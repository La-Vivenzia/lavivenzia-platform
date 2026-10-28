import { EXPERIENCE_LIMITS as LIMITS } from "@/modules/experiences/readiness";

/**
 * Party size rules (FR-09).
 *
 * Three ceilings meet here and the lowest wins: the host's maximum party, the
 * seats still free on the chosen slot, and the catalogue's absolute ceiling.
 * The floor is the host's minimum party. When the floor sits above the ceiling
 * the slot cannot take this experience's smallest party, and it is not offered.
 */

export interface PartyRules {
  readonly minGuests: number;
  /** Null means the host set no party maximum; the slot's seats still apply. */
  readonly maxGuests: number | null;
  /** Seats still free on the chosen slot. */
  readonly seatsRemaining: number;
}

export interface GuestLimits {
  readonly min: number;
  readonly max: number;
}

/** The selectable range for this slot, or null when no valid party fits. */
export function guestLimits(rules: PartyRules): GuestLimits | null {
  const min = Math.max(1, rules.minGuests);
  const max = Math.min(
    rules.maxGuests ?? Number.POSITIVE_INFINITY,
    rules.seatsRemaining,
    LIMITS.guests.max,
  );

  return max >= min ? { min, max } : null;
}

/** Pull a requested count into range, so a slot change never strands an invalid party. */
export function clampGuests(guests: number, limits: GuestLimits): number {
  if (!Number.isFinite(guests)) return limits.min;
  return Math.min(limits.max, Math.max(limits.min, Math.trunc(guests)));
}

export type GuestCountProblem =
  "not_whole_number" | "below_minimum" | "above_party_maximum" | "exceeds_seats_remaining";

/**
 * Why a count is not allowed, or null when it is.
 *
 * A reason rather than a boolean: "this time has only 3 seats left" and "this
 * host takes at most 6" are different messages, and the second does not change
 * by picking another time.
 */
export function checkGuestCount(guests: number, rules: PartyRules): GuestCountProblem | null {
  if (!Number.isSafeInteger(guests) || guests < 1) return "not_whole_number";
  if (guests < Math.max(1, rules.minGuests)) return "below_minimum";
  if (guests > Math.min(rules.maxGuests ?? LIMITS.guests.max, LIMITS.guests.max)) {
    return "above_party_maximum";
  }
  if (guests > rules.seatsRemaining) return "exceeds_seats_remaining";
  return null;
}

export function describeGuestProblem(problem: GuestCountProblem, rules: PartyRules): string {
  switch (problem) {
    case "not_whole_number":
      return "Choose how many guests are coming.";
    case "below_minimum":
      return `This experience needs at least ${rules.minGuests} guests.`;
    case "above_party_maximum":
      return `This experience takes at most ${rules.maxGuests ?? LIMITS.guests.max} guests per booking.`;
    case "exceeds_seats_remaining":
      return rules.seatsRemaining === 1
        ? "Only 1 seat is left at this time."
        : `Only ${rules.seatsRemaining} seats are left at this time.`;
  }
}
