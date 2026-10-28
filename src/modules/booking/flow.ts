import type { BookingConfirmation, CheckoutIntent } from "./contract";
import {
  checkGuestCount,
  clampGuests,
  describeGuestProblem,
  guestLimits,
  type GuestLimits,
  type PartyRules,
} from "./guests";
import { groupSlotsByDay, slotsForParty, type PublicSlot, type SlotDay } from "./slots";

/**
 * The booking panel as a state machine (FR-09).
 *
 * A reducer rather than a handful of `useState`s, for one reason: the
 * transitions are the product. "Payment dismissed keeps the selection", "a slot
 * change re-clamps the party", "nothing can be selected while a payment is
 * open" — each is one line here, testable without a browser, instead of an
 * implicit property of which setters a click handler remembered to call.
 *
 * An event that does not apply in the current phase returns the state
 * unchanged. A late slot reload cannot reset a panel that is mid-payment.
 *
 * ```text
 * loading ─► selecting ─► preparing ─► paying ─► confirming ─► confirmed
 *    │           ▲   ▲         │          │           │
 *    ▼           │   └─dismiss─┼──────────┘           │
 * load_error ────┘             └────► error ◄─────────┘
 * ```
 */

export type BookingPhase =
  | "loading"
  | "load_error"
  | "selecting"
  | "preparing"
  | "paying"
  | "confirming"
  | "confirmed"
  | "error";

export interface BookingState {
  readonly phase: BookingPhase;
  readonly party: { readonly minGuests: number; readonly maxGuests: number | null };
  readonly days: readonly SlotDay[];
  readonly selectedDay: string | null;
  readonly selectedSlotId: string | null;
  readonly guests: number;
  /** A failure the traveller must read. */
  readonly error: string | null;
  /** Something worth saying that is not a failure — e.g. a cancelled payment. */
  readonly notice: string | null;
  readonly intent: CheckoutIntent | null;
  readonly confirmation: BookingConfirmation | null;
}

export type BookingEvent =
  | { readonly type: "SLOTS_LOADED"; readonly slots: readonly PublicSlot[] }
  | { readonly type: "SLOTS_FAILED"; readonly message: string }
  | { readonly type: "RELOAD" }
  | { readonly type: "SELECT_DAY"; readonly day: string }
  | { readonly type: "SELECT_SLOT"; readonly slotId: string }
  | { readonly type: "SET_GUESTS"; readonly guests: number }
  | { readonly type: "SUBMIT" }
  | { readonly type: "INTENT_READY"; readonly intent: CheckoutIntent }
  | { readonly type: "PAYMENT_COMPLETED" }
  | { readonly type: "PAYMENT_DISMISSED" }
  | { readonly type: "CONFIRMED"; readonly confirmation: BookingConfirmation }
  | { readonly type: "FAILED"; readonly message: string }
  | { readonly type: "DISMISS_ERROR" }
  | { readonly type: "START_OVER" };

export function initialBookingState(party: {
  readonly minGuests: number;
  readonly maxGuests: number | null;
}): BookingState {
  return {
    phase: "loading",
    party,
    days: [],
    selectedDay: null,
    selectedSlotId: null,
    guests: Math.max(1, party.minGuests),
    error: null,
    notice: null,
    intent: null,
    confirmation: null,
  };
}

// ── Selectors ───────────────────────────────────────────────────────────────

export function findSlot(days: readonly SlotDay[], slotId: string | null): PublicSlot | null {
  if (!slotId) return null;
  for (const day of days) {
    const slot = day.slots.find((candidate) => candidate.id === slotId);
    if (slot) return slot;
  }
  return null;
}

export function selectedSlot(state: BookingState): PublicSlot | null {
  return findSlot(state.days, state.selectedSlotId);
}

export function slotsForSelectedDay(state: BookingState): readonly PublicSlot[] {
  return state.days.find((day) => day.key === state.selectedDay)?.slots ?? [];
}

export function partyRules(state: BookingState, slot: PublicSlot | null): PartyRules {
  return {
    minGuests: state.party.minGuests,
    maxGuests: state.party.maxGuests,
    // Before a slot is chosen the party is bounded only by the host's rules.
    seatsRemaining: slot?.seatsRemaining ?? Number.POSITIVE_INFINITY,
  };
}

export function currentGuestLimits(state: BookingState): GuestLimits | null {
  return guestLimits(partyRules(state, selectedSlot(state)));
}

/** Why the current party cannot be booked, or null. */
export function guestProblemMessage(state: BookingState): string | null {
  const rules = partyRules(state, selectedSlot(state));
  const problem = checkGuestCount(state.guests, rules);
  return problem ? describeGuestProblem(problem, rules) : null;
}

export function canSubmit(state: BookingState): boolean {
  return (
    state.phase === "selecting" &&
    selectedSlot(state) !== null &&
    guestProblemMessage(state) === null
  );
}

/** Selection is frozen while a request or payment is in flight. */
export function isBusy(state: BookingState): boolean {
  return state.phase === "preparing" || state.phase === "paying" || state.phase === "confirming";
}

// ── Transitions ─────────────────────────────────────────────────────────────

function withSlot(state: BookingState, slotId: string | null): BookingState {
  const slot = findSlot(state.days, slotId);
  if (!slot) return { ...state, selectedSlotId: null };

  const limits = guestLimits(partyRules(state, slot));
  return {
    ...state,
    selectedSlotId: slot.id,
    guests: limits ? clampGuests(state.guests, limits) : state.guests,
  };
}

function withDay(state: BookingState, day: string | null): BookingState {
  const slots = state.days.find((candidate) => candidate.key === day)?.slots ?? [];
  if (!day || slots.length === 0) return { ...state, selectedDay: null, selectedSlotId: null };

  const next = { ...state, selectedDay: day };
  // Keep the time if it is on this day; with only one time, choose it for them.
  if (slots.some((slot) => slot.id === state.selectedSlotId)) return next;
  return withSlot(next, slots.length === 1 ? slots[0]!.id : null);
}

export function bookingReducer(state: BookingState, event: BookingEvent): BookingState {
  switch (event.type) {
    case "SLOTS_LOADED": {
      if (state.phase !== "loading") return state;

      const days = groupSlotsByDay(slotsForParty(event.slots, state.party.minGuests));
      const loaded: BookingState = { ...state, phase: "selecting", days, error: null };

      // A reload keeps what was chosen when it still exists; otherwise open on
      // the soonest day so the first screen is never an empty picker.
      const keepDay = days.some((day) => day.key === state.selectedDay);
      const withSelection = withDay(
        { ...loaded, selectedSlotId: keepDay ? state.selectedSlotId : null },
        keepDay ? state.selectedDay : (days[0]?.key ?? null),
      );
      return withSlot(withSelection, withSelection.selectedSlotId);
    }

    case "SLOTS_FAILED":
      return state.phase === "loading"
        ? { ...state, phase: "load_error", error: event.message }
        : state;

    case "RELOAD":
      return state.phase === "load_error" || state.phase === "selecting"
        ? { ...state, phase: "loading", error: null }
        : state;

    case "SELECT_DAY":
      return state.phase === "selecting" ? { ...withDay(state, event.day), notice: null } : state;

    case "SELECT_SLOT": {
      if (state.phase !== "selecting") return state;
      if (!slotsForSelectedDay(state).some((slot) => slot.id === event.slotId)) return state;
      return { ...withSlot(state, event.slotId), notice: null };
    }

    case "SET_GUESTS": {
      if (state.phase !== "selecting") return state;
      const limits = currentGuestLimits(state);
      return { ...state, guests: limits ? clampGuests(event.guests, limits) : state.guests };
    }

    case "SUBMIT":
      return canSubmit(state) ? { ...state, phase: "preparing", error: null, notice: null } : state;

    case "INTENT_READY":
      if (state.phase !== "preparing") return state;
      // Demo mode has no payment step: the server confirms on the next call.
      return {
        ...state,
        phase: event.intent.mode === "razorpay_test" ? "paying" : "confirming",
        intent: event.intent,
      };

    case "PAYMENT_COMPLETED":
      return state.phase === "paying" ? { ...state, phase: "confirming" } : state;

    case "PAYMENT_DISMISSED":
      return state.phase === "paying"
        ? {
            ...state,
            phase: "selecting",
            intent: null,
            notice: "Payment was cancelled. Nothing was charged and your selection is kept.",
          }
        : state;

    case "CONFIRMED":
      return state.phase === "confirming"
        ? { ...state, phase: "confirmed", confirmation: event.confirmation, error: null }
        : state;

    case "FAILED":
      return isBusy(state)
        ? { ...state, phase: "error", error: event.message, intent: null }
        : state;

    case "DISMISS_ERROR":
      return state.phase === "error" ? { ...state, phase: "selecting", error: null } : state;

    case "START_OVER":
      // Seats have changed since the slots were read, so start from a fresh read.
      return state.phase === "confirmed" ? initialBookingState(state.party) : state;
  }
}
