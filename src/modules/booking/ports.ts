import type { PricingUnit } from "@/modules/experiences/readiness";

/**
 * Booking Capacity & Mutex Persistence Boundary (LA-12 Phase 2 Sprint 2).
 *
 * Hexagonal architecture port: The domain owns this interface.
 * Prisma implementation lives in `src/adapters/persistence/prisma/booking-capacity-repositories.ts`.
 * No Prisma, HTTP, or framework imports are permitted in this file.
 */

export type SlotStatus = "OPEN" | "CLOSED";

export interface LockedSlotRecord {
  readonly id: string;
  readonly experienceId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly reservedCount: number;
  readonly bookingCutoffMinutes: number;
  readonly status: SlotStatus;
}

export interface ExperienceBookingRules {
  readonly id: string;
  readonly title: string;
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly pricingUnit: PricingUnit;
  readonly minGuests: number;
  readonly maxGuests: number | null;
  readonly status: string;
}

export interface CreateHoldBookingInput {
  readonly bookingReference: string;
  readonly userId: string;
  readonly experienceId: string;
  readonly slotId: string;
  readonly guestCount: number;
  readonly heldUntil: Date;
  readonly totalAmountMinorUnits: number;
  readonly currency: string;
  readonly customerEmail?: string | null;
  readonly customerPhone?: string | null;
  readonly specialRequests?: string | null;
  readonly item: {
    readonly title: string;
    readonly quantity: number;
    readonly unitPriceMinorUnits: number;
    readonly totalPriceMinorUnits: number;
  };
}

export interface HoldBookingRecord {
  readonly id: string;
  readonly bookingReference: string;
  readonly userId: string;
  readonly experienceId: string;
  readonly slotId: string;
  readonly guestCount: number;
  readonly status: "HELD";
  readonly heldUntil: Date;
  readonly totalAmountMinorUnits: number;
  readonly currency: string;
  readonly customerEmail: string | null;
  readonly customerPhone: string | null;
  readonly specialRequests: string | null;
  readonly createdAt: Date;
}

export interface BookingCapacityRepository {
  /**
   * Acquire a pessimistic row-level lock on `experience_slots` using PostgreSQL `SELECT ... FOR UPDATE`.
   * Returns null if slot does not exist.
   */
  acquireSlotLock(slotId: string): Promise<LockedSlotRecord | null>;

  /**
   * Compute dynamic active held seats:
   * SUM(guest_count) WHERE slot_id = :slotId AND status = 'HELD' AND held_until > :now
   */
  getActiveHeldSeats(slotId: string, now: Date): Promise<number>;

  /**
   * Retrieve experience rules & pricing required for bookability check.
   */
  findExperienceForSlot(experienceId: string): Promise<ExperienceBookingRules | null>;

  /**
   * Atomically insert a Booking record with status = 'HELD' and its child BookingItem.
   *
   * CRITICAL INVARIANT: NEVER modifies ExperienceSlot.reservedCount.
   */
  createHoldBooking(input: CreateHoldBookingInput): Promise<HoldBookingRecord>;

  /**
   * Execute callback inside a database transaction boundary.
   */
  runInTransaction<T>(fn: (repo: BookingCapacityRepository) => Promise<T>): Promise<T>;
}
