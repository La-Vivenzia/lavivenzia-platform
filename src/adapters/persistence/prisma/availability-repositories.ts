import type { PrismaClient } from "@/lib/db";
import { ConflictError } from "@/lib/errors";
import type {
  CreateSlotInput,
  SlotRecord,
  SlotRepository,
  SlotStatus,
} from "@/modules/availability/ports";

/**
 * Prisma implementation of the availability port (FR-08).
 *
 * Two behaviours are worth knowing:
 *
 * **Batch creation is one transaction.** A host adding a week of slots either
 * gets all of them or none. Partial success is worse than failure here — they
 * would have to work out which days were written.
 *
 * **A duplicate start time is a race, not a validation miss.** The domain
 * checks for overlap before writing, but two requests can pass that check
 * concurrently; the unique index on `(experience_id, starts_at)` is what
 * actually decides. P2002 is therefore translated into a conflict the host can
 * read, rather than surfacing as an unhandled Prisma error.
 */

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

function toRecord(row: SlotRow): SlotRecord {
  return {
    id: row.id,
    experienceId: row.experienceId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    capacity: row.capacity,
    reservedCount: row.reservedCount,
    bookingCutoffMinutes: row.bookingCutoffMinutes,
    status: row.status as SlotStatus,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

export class PrismaSlotRepository implements SlotRepository {
  readonly #db: PrismaClient;

  constructor(db: PrismaClient) {
    this.#db = db;
  }

  async listForExperience(experienceId: string): Promise<readonly SlotRecord[]> {
    const rows = await this.#db.experienceSlot.findMany({
      where: { experienceId },
      orderBy: { startsAt: "asc" },
    });

    return rows.map(toRecord);
  }

  async listUpcoming(experienceId: string, from: Date): Promise<readonly SlotRecord[]> {
    const rows = await this.#db.experienceSlot.findMany({
      where: { experienceId, startsAt: { gte: from } },
      orderBy: { startsAt: "asc" },
    });

    return rows.map(toRecord);
  }

  async findById(id: string): Promise<SlotRecord | null> {
    const row = await this.#db.experienceSlot.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async createMany(inputs: readonly CreateSlotInput[]): Promise<readonly SlotRecord[]> {
    try {
      const rows = await this.#db.$transaction(
        inputs.map((input) => this.#db.experienceSlot.create({ data: { ...input } })),
      );

      return rows.map(toRecord);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("A slot already exists at that start time.", undefined, {
          cause: error,
        });
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: {
      readonly capacity?: number;
      readonly bookingCutoffMinutes?: number;
      readonly status?: SlotStatus;
    },
  ): Promise<SlotRecord> {
    const row = await this.#db.experienceSlot.update({
      where: { id },
      data: {
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.bookingCutoffMinutes !== undefined
          ? { bookingCutoffMinutes: input.bookingCutoffMinutes }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    return toRecord(row);
  }

  async remove(id: string): Promise<void> {
    await this.#db.experienceSlot.delete({ where: { id } });
  }

  async countUpcoming(experienceId: string, from: Date): Promise<number> {
    return this.#db.experienceSlot.count({
      where: { experienceId, startsAt: { gte: from } },
    });
  }
}
