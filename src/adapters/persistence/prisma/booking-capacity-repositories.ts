import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  BookingCapacityRepository,
  CreateHoldBookingInput,
  ExperienceBookingRules,
  HoldBookingRecord,
  LockedSlotRecord,
  SlotStatus,
} from "@/modules/booking/ports";
import type { PricingUnit } from "@/modules/experiences/readiness";

type DbClient = PrismaClient | Prisma.TransactionClient;

type SlotRow = {
  id: string;
  experienceId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  reservedCount: number;
  bookingCutoffMinutes: number;
  status: string;
};

function toLockedRecord(row: SlotRow): LockedSlotRecord {
  return {
    id: row.id,
    experienceId: row.experienceId,
    startsAt: new Date(row.startsAt),
    endsAt: new Date(row.endsAt),
    capacity: row.capacity,
    reservedCount: row.reservedCount,
    bookingCutoffMinutes: row.bookingCutoffMinutes,
    status: row.status as SlotStatus,
  };
}

/**
 * Prisma adapter for BookingCapacityRepository (LA-12 Phase 2 Sprint 2).
 *
 * Implements pessimistic row-level locking (`SELECT ... FOR UPDATE`)
 * and dynamic active hold summation over `bookings`.
 */
export class PrismaBookingCapacityRepository implements BookingCapacityRepository {
  readonly #db: DbClient;

  constructor(db: DbClient) {
    this.#db = db;
  }

  /**
   * Pessimistically locks the target slot row using PostgreSQL `FOR UPDATE`.
   */
  async acquireSlotLock(slotId: string): Promise<LockedSlotRecord | null> {
    const rows = await this.#db.$queryRaw<SlotRow[]>`
      SELECT
        id,
        experience_id AS "experienceId",
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        capacity,
        reserved_count AS "reservedCount",
        booking_cutoff_minutes AS "bookingCutoffMinutes",
        status
      FROM experience_slots
      WHERE id = ${slotId}::uuid
      FOR UPDATE
    `;

    if (!rows || rows.length === 0 || !rows[0]) {
      return null;
    }

    return toLockedRecord(rows[0]);
  }

  /**
   * Sum of guestCount for active holds: status = 'HELD' and heldUntil > now.
   */
  async getActiveHeldSeats(slotId: string, now: Date): Promise<number> {
    const result = await this.#db.booking.aggregate({
      where: {
        slotId,
        status: "HELD",
        heldUntil: {
          gt: now,
        },
      },
      _sum: {
        guestCount: true,
      },
    });

    return result._sum.guestCount ?? 0;
  }

  /**
   * Retrieves booking rules and pricing parameters for the parent experience.
   */
  async findExperienceForSlot(experienceId: string): Promise<ExperienceBookingRules | null> {
    const row = await this.#db.experience.findUnique({
      where: { id: experienceId },
      select: {
        id: true,
        title: true,
        basePriceMinor: true,
        currency: true,
        pricingUnit: true,
        minGuests: true,
        maxGuests: true,
        status: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      basePriceMinor: row.basePriceMinor,
      currency: row.currency,
      pricingUnit: row.pricingUnit as PricingUnit,
      minGuests: row.minGuests,
      maxGuests: row.maxGuests,
      status: row.status,
    };
  }

  /**
   * Atomically creates a Booking with status 'HELD' and associated BookingItem.
   *
   * CRITICAL INVARIANT: Never updates ExperienceSlot.reservedCount.
   */
  async createHoldBooking(input: CreateHoldBookingInput): Promise<HoldBookingRecord> {
    const row = await this.#db.booking.create({
      data: {
        bookingReference: input.bookingReference,
        userId: input.userId,
        experienceId: input.experienceId,
        slotId: input.slotId,
        guestCount: input.guestCount,
        status: "HELD",
        heldUntil: input.heldUntil,
        totalAmountMinorUnits: input.totalAmountMinorUnits,
        currency: input.currency,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        specialRequests: input.specialRequests ?? null,
        items: {
          create: {
            title: input.item.title,
            quantity: input.item.quantity,
            unitPriceMinorUnits: input.item.unitPriceMinorUnits,
            totalPriceMinorUnits: input.item.totalPriceMinorUnits,
          },
        },
      },
    });

    return {
      id: row.id,
      bookingReference: row.bookingReference,
      userId: row.userId,
      experienceId: row.experienceId,
      slotId: row.slotId,
      guestCount: row.guestCount,
      status: "HELD",
      heldUntil: row.heldUntil!,
      totalAmountMinorUnits: row.totalAmountMinorUnits,
      currency: row.currency,
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      specialRequests: row.specialRequests,
      createdAt: row.createdAt,
    };
  }

  /**
   * Executes callback within a database transaction.
   */
  async runInTransaction<T>(fn: (repo: BookingCapacityRepository) => Promise<T>): Promise<T> {
    if (
      "$transaction" in this.#db &&
      typeof (this.#db as PrismaClient).$transaction === "function"
    ) {
      return await (this.#db as PrismaClient).$transaction(async (tx) => {
        const txRepo = new PrismaBookingCapacityRepository(tx);
        return await fn(txRepo);
      });
    }

    return await fn(this);
  }
}
