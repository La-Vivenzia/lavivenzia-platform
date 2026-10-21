import { ValidationError } from "@/lib/errors";

/**
 * Availability rules (FR-08).
 *
 * Framework-free and free of I/O, so the whole of it runs in the unit suite
 * with no database and no environment. Every rule here is one a host can
 * trigger by accident, and each exists to stop a slot reaching a state that
 * booking would later have to reason about.
 *
 * **Nothing here prices, cancels or taxes anything.** A slot says when an
 * experience runs and how many seats exist. What a seat costs, what happens
 * when it is given up, and what tax applies are deliberately absent — those
 * are unresolved founder decisions (A-003, A-004, A-005), and inventing them
 * here would put guesses into a table that holds money-adjacent records.
 */

/** A slot shorter than this is almost certainly a typo in the end time. */
export const MIN_SLOT_MINUTES = 5;
/** Beyond this a "slot" is a season, and the host wants several rows. */
export const MAX_SLOT_HOURS = 24;
/** Bulk creation cap, so one request cannot write an unbounded number of rows. */
export const MAX_SLOTS_PER_REQUEST = 60;
export const MAX_CAPACITY = 1_000;

export interface SlotInput {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly bookingCutoffMinutes: number;
}

/** The shape overlap checking needs — satisfied by both inputs and records. */
export interface SlotInterval {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * Two intervals overlap when each begins before the other ends.
 *
 * Touching endpoints are **not** an overlap: a 10:00–12:00 slot and a
 * 12:00–14:00 slot are back-to-back, which is how a host running a thing twice
 * in a day expresses it.
 */
export function overlaps(a: SlotInterval, b: SlotInterval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/**
 * Validate one slot in isolation.
 *
 * `now` is a parameter rather than read from the clock so the rule is testable
 * and so a batch is judged against a single instant — otherwise a slow request
 * could accept the first slot of a batch and reject an identical later one.
 */
export function validateSlot(input: SlotInput, now: Date): void {
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime())) {
    throw new ValidationError("Slot start and end must be valid dates.");
  }

  if (input.endsAt <= input.startsAt) {
    throw new ValidationError("A slot must end after it starts.");
  }

  if (input.startsAt <= now) {
    // A slot in the past cannot be booked, and one created in the past is
    // almost always a timezone mistake worth surfacing immediately.
    throw new ValidationError("A slot must start in the future.");
  }

  const minutes = (input.endsAt.getTime() - input.startsAt.getTime()) / 60_000;

  if (minutes < MIN_SLOT_MINUTES) {
    throw new ValidationError(`A slot must run for at least ${MIN_SLOT_MINUTES} minutes.`);
  }
  if (minutes > MAX_SLOT_HOURS * 60) {
    throw new ValidationError(
      `A slot cannot run longer than ${MAX_SLOT_HOURS} hours. Create one slot per occurrence.`,
    );
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    throw new ValidationError("Capacity must be a whole number of at least 1.");
  }
  if (input.capacity > MAX_CAPACITY) {
    throw new ValidationError(`Capacity cannot exceed ${MAX_CAPACITY}.`);
  }

  if (!Number.isInteger(input.bookingCutoffMinutes) || input.bookingCutoffMinutes < 0) {
    throw new ValidationError("Booking cut-off must be zero or a positive number of minutes.");
  }
  if (input.bookingCutoffMinutes > minutes + 60 * 24 * 365) {
    throw new ValidationError("Booking cut-off is unreasonably far before the slot.");
  }
}

/**
 * Validate a batch against itself and against what already exists.
 *
 * Both directions matter. A host adding a week of slots can overlap an
 * existing one *and* overlap another slot in the same submission, and only
 * checking the first would let the second through.
 */
export function validateBatch(
  inputs: readonly SlotInput[],
  existing: readonly SlotInterval[],
  now: Date,
): void {
  if (inputs.length === 0) {
    throw new ValidationError("Provide at least one slot.");
  }
  if (inputs.length > MAX_SLOTS_PER_REQUEST) {
    throw new ValidationError(`Create at most ${MAX_SLOTS_PER_REQUEST} slots in one request.`);
  }

  for (const input of inputs) validateSlot(input, now);

  for (let i = 0; i < inputs.length; i += 1) {
    const candidate = inputs[i];
    if (!candidate) continue;

    for (let j = i + 1; j < inputs.length; j += 1) {
      const other = inputs[j];
      if (other && overlaps(candidate, other)) {
        throw new ValidationError("Two of the slots you are adding overlap each other.");
      }
    }

    if (existing.some((slot) => overlaps(candidate, slot))) {
      throw new ValidationError("A slot overlaps one that already exists for this experience.");
    }
  }
}

/**
 * Whether a capacity change is allowed.
 *
 * The database enforces this too — it is a CHECK constraint — but catching it
 * here turns a constraint violation into a sentence a host can act on.
 */
export function assertCapacityChangeAllowed(nextCapacity: number, reservedCount: number): void {
  if (!Number.isInteger(nextCapacity) || nextCapacity < 1) {
    throw new ValidationError("Capacity must be a whole number of at least 1.");
  }
  if (nextCapacity > MAX_CAPACITY) {
    throw new ValidationError(`Capacity cannot exceed ${MAX_CAPACITY}.`);
  }
  if (nextCapacity < reservedCount) {
    throw new ValidationError(
      `Capacity cannot be lower than the ${reservedCount} seat(s) already reserved.`,
    );
  }
}

/** Seats still available. Never negative, whatever the stored values say. */
export function seatsRemaining(slot: {
  readonly capacity: number;
  readonly reservedCount: number;
}): number {
  return Math.max(0, slot.capacity - slot.reservedCount);
}

/** The instant after which this slot stops accepting bookings. */
export function bookingClosesAt(slot: {
  readonly startsAt: Date;
  readonly bookingCutoffMinutes: number;
}): Date {
  return new Date(slot.startsAt.getTime() - slot.bookingCutoffMinutes * 60_000);
}

/**
 * Whether a traveller could book this slot right now.
 *
 * Exported for the public read surface and for the booking path that follows.
 * It is **not** a reservation: Phase 6 must still take the seat inside a
 * transaction, because anything checked and then acted on separately is a
 * race. This answers "should we show it", not "is it ours".
 */
export function isBookable(
  slot: {
    readonly status: "OPEN" | "CLOSED";
    readonly startsAt: Date;
    readonly capacity: number;
    readonly reservedCount: number;
    readonly bookingCutoffMinutes: number;
  },
  now: Date,
): boolean {
  if (slot.status !== "OPEN") return false;
  if (seatsRemaining(slot) <= 0) return false;
  return now < bookingClosesAt(slot);
}

/**
 * Whether the host may still edit or remove a slot.
 *
 * A started slot is history; a slot with reservations belongs partly to the
 * travellers in it. Both are refused, and the second will matter the moment
 * booking ships.
 */
export function assertSlotMutable(
  slot: {
    readonly startsAt: Date;
    readonly reservedCount: number;
  },
  now: Date,
): void {
  if (slot.startsAt <= now) {
    throw new ValidationError("A slot that has already started cannot be changed.");
  }
  if (slot.reservedCount > 0) {
    throw new ValidationError(
      `This slot has ${slot.reservedCount} reservation(s). Close it instead of removing it.`,
    );
  }
}
