/**
 * Availability persistence boundary (FR-08).
 *
 * The domain owns this interface; the Prisma implementation lives in
 * `src/adapters/persistence/prisma`. Nothing here knows about Prisma, HTTP or
 * React — the module compiles and its tests run with no environment at all.
 */

export type SlotStatus = "OPEN" | "CLOSED";

export interface SlotRecord {
  readonly id: string;
  readonly experienceId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly reservedCount: number;
  readonly bookingCutoffMinutes: number;
  readonly status: SlotStatus;
}

export interface CreateSlotInput {
  readonly experienceId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly bookingCutoffMinutes: number;
}

export interface SlotRepository {
  /** Every slot for an experience, soonest first. */
  listForExperience(experienceId: string): Promise<readonly SlotRecord[]>;

  /**
   * Slots from `from` onward, used by the traveller surface. Returns stored
   * state; whether a slot is *bookable* is decided by `isBookable`, so one
   * rule governs both surfaces.
   */
  listUpcoming(experienceId: string, from: Date): Promise<readonly SlotRecord[]>;

  findById(id: string): Promise<SlotRecord | null>;

  /**
   * Insert a batch in one transaction.
   *
   * All or nothing on purpose: a host adding a week of slots should not end up
   * with four of seven written because the fifth collided. The unique index on
   * `(experience_id, starts_at)` is what makes a concurrent duplicate fail
   * rather than race.
   */
  createMany(inputs: readonly CreateSlotInput[]): Promise<readonly SlotRecord[]>;

  update(
    id: string,
    input: {
      readonly capacity?: number;
      readonly bookingCutoffMinutes?: number;
      readonly status?: SlotStatus;
    },
  ): Promise<SlotRecord>;

  remove(id: string): Promise<void>;

  /** Guards removing an experience's last usable availability, and reporting. */
  countUpcoming(experienceId: string, from: Date): Promise<number>;
}
