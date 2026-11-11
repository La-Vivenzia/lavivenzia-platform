import { randomBytes } from "node:crypto";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { quoteBooking, type PriceQuote } from "./pricing";
import type { BookingCapacityRepository, HoldBookingRecord } from "./ports";

/**
 * Default hold duration: 5 minutes (300,000 ms) as specified by Phase 2 architecture.
 */
export const HOLD_DURATION_MS = 5 * 60 * 1000;

/** Crockford base32 alphabet: no ambiguous characters (I, L, O, U). */
const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateBookingReference(prefix = "LV"): string {
  const bytes = randomBytes(8);
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += CROCKFORD_BASE32[bytes[i]! % 32];
  }
  return `${prefix}-${result.slice(0, 4)}-${result.slice(4)}`;
}

export interface ReserveHoldInput {
  readonly slotId: string;
  readonly userId: string;
  readonly guests: number;
  readonly customerEmail?: string | null;
  readonly customerPhone?: string | null;
  readonly specialRequests?: string | null;
}

export interface SlotCapacitySummary {
  readonly id: string;
  readonly experienceId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly totalCapacity: number;
  readonly confirmedReservedCount: number;
  readonly activeHeldSeats: number;
  readonly availableCapacity: number;
}

export interface ReserveHoldResult {
  readonly booking: HoldBookingRecord;
  readonly quote: PriceQuote;
  readonly slot: {
    readonly id: string;
    readonly experienceId: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly capacity: number;
    readonly reservedCount: number;
    readonly activeHeldSeatsAfterHold: number;
    readonly availableCapacityAfterHold: number;
  };
}

export interface BookingCapacityEngineDependencies {
  readonly repository: BookingCapacityRepository;
  readonly now?: () => Date;
  readonly holdDurationMs?: number;
  readonly generateReference?: () => string;
}

/**
 * BookingCapacityEngine (LA-12 Phase 2 Sprint 2).
 *
 * Implements the atomic seat capacity mutex and 5-minute dynamic hold reservations.
 *
 * CRITICAL INVARIANTS:
 * 1. Pessimistic concurrency: Row-locks `ExperienceSlot` using `SELECT ... FOR UPDATE` before capacity math.
 * 2. Dynamic active hold formula:
 *    Active Held Seats = SUM(guestCount) WHERE status = 'HELD' AND heldUntil > NOW()
 *    Available Capacity = slot.capacity - slot.reservedCount - Active Held Seats
 * 3. Never mutates `ExperienceSlot.reservedCount` on hold creation, expiration, or cancellation.
 *    `reservedCount` strictly tracks confirmed transactions.
 * 4. Decoupled from framework & ORM: communicates purely through `BookingCapacityRepository`.
 */
export class BookingCapacityEngine {
  readonly #repo: BookingCapacityRepository;
  readonly #now: () => Date;
  readonly #holdDurationMs: number;
  readonly #generateReference: () => string;

  constructor(dependencies: BookingCapacityEngineDependencies) {
    this.#repo = dependencies.repository;
    this.#now = dependencies.now ?? (() => new Date());
    this.#holdDurationMs = dependencies.holdDurationMs ?? HOLD_DURATION_MS;
    this.#generateReference =
      dependencies.generateReference ?? (() => generateBookingReference("LV"));
  }

  /**
   * Acquires a row lock on the target slot, validates capacity and business invariants,
   * quotes pricing, and creates an atomic 5-minute HELD booking.
   */
  async reserveHold(input: ReserveHoldInput): Promise<ReserveHoldResult> {
    if (!input.slotId || typeof input.slotId !== "string" || input.slotId.trim() === "") {
      throw new ValidationError("Slot ID is required.");
    }
    if (!input.userId || typeof input.userId !== "string" || input.userId.trim() === "") {
      throw new ValidationError("User ID is required.");
    }
    if (!Number.isSafeInteger(input.guests) || input.guests < 1) {
      throw new ValidationError("Guest count must be a whole number of at least 1.");
    }

    return await this.#repo.runInTransaction(async (txRepo) => {
      // 1. Acquire pessimistic row-level lock on the experience slot
      const slot = await txRepo.acquireSlotLock(input.slotId);
      if (!slot) {
        throw new NotFoundError("Experience slot not found.");
      }

      // 2. Operational slot status validation
      if (slot.status !== "OPEN") {
        throw new ConflictError("Experience slot is not open for booking.");
      }

      const now = this.#now();

      // 3. Temporal validity checks
      if (slot.startsAt.getTime() <= now.getTime()) {
        throw new ConflictError("Experience slot has already started.");
      }

      const cutoffMs = slot.bookingCutoffMinutes * 60 * 1000;
      if (slot.startsAt.getTime() - cutoffMs <= now.getTime()) {
        throw new ConflictError("Booking cutoff has passed for this slot.");
      }

      // 4. Experience validation (pricing & guest bounds)
      const experience = await txRepo.findExperienceForSlot(slot.experienceId);
      if (!experience) {
        throw new NotFoundError("Experience not found.");
      }

      if (experience.status !== "PUBLISHED") {
        throw new ConflictError("Experience is not currently published for booking.");
      }

      if (input.guests < experience.minGuests) {
        throw new ValidationError(`Booking requires at least ${experience.minGuests} guest(s).`);
      }

      if (experience.maxGuests !== null && input.guests > experience.maxGuests) {
        throw new ValidationError(`Booking allows at most ${experience.maxGuests} guest(s).`);
      }

      // 5. Dynamic active hold calculation
      const activeHeldSeats = await txRepo.getActiveHeldSeats(slot.id, now);

      // 6. Available capacity calculation
      const availableCapacity = slot.capacity - slot.reservedCount - activeHeldSeats;
      if (input.guests > availableCapacity) {
        throw new ConflictError(
          `Requested ${input.guests} seat(s), but only ${Math.max(0, availableCapacity)} seat(s) remain available.`,
        );
      }

      // 7. Calculate exact integer minor unit price quote
      const quote = quoteBooking({
        basePriceMinor: experience.basePriceMinor,
        currency: experience.currency,
        pricingUnit: experience.pricingUnit,
        guests: input.guests,
      });

      // 8. Construct hold expiry instant (now + 5 minutes)
      const heldUntil = new Date(now.getTime() + this.#holdDurationMs);
      const bookingReference = this.#generateReference();

      const line = quote.lines[0];
      const itemTitle = experience.title;
      const unitPriceMinorUnits = line ? line.unitPriceMinor : quote.totalMinor;
      const quantity = line ? line.quantity : input.guests;

      // 9. Persist hold booking & line item atomically inside transaction
      // NOTE: ExperienceSlot.reservedCount is explicitly NOT modified.
      const booking = await txRepo.createHoldBooking({
        bookingReference,
        userId: input.userId,
        experienceId: slot.experienceId,
        slotId: slot.id,
        guestCount: input.guests,
        heldUntil,
        totalAmountMinorUnits: quote.totalMinor,
        currency: quote.currency,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        specialRequests: input.specialRequests ?? null,
        item: {
          title: itemTitle,
          quantity,
          unitPriceMinorUnits,
          totalPriceMinorUnits: quote.totalMinor,
        },
      });

      return {
        booking,
        quote,
        slot: {
          id: slot.id,
          experienceId: slot.experienceId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          capacity: slot.capacity,
          reservedCount: slot.reservedCount,
          activeHeldSeatsAfterHold: activeHeldSeats + input.guests,
          availableCapacityAfterHold: availableCapacity - input.guests,
        },
      };
    });
  }

  /**
   * Read-only capacity status query for UI displays and inspection.
   */
  async getSlotCapacitySummary(slotId: string): Promise<SlotCapacitySummary> {
    if (!slotId || typeof slotId !== "string") {
      throw new ValidationError("Slot ID is required.");
    }

    const slot = await this.#repo.acquireSlotLock(slotId);
    if (!slot) {
      throw new NotFoundError("Experience slot not found.");
    }

    const now = this.#now();
    const activeHeldSeats = await this.#repo.getActiveHeldSeats(slot.id, now);
    const availableCapacity = Math.max(0, slot.capacity - slot.reservedCount - activeHeldSeats);

    return {
      id: slot.id,
      experienceId: slot.experienceId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      totalCapacity: slot.capacity,
      confirmedReservedCount: slot.reservedCount,
      activeHeldSeats,
      availableCapacity,
    };
  }
}
