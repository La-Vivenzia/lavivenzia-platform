import type { BookingConfirmation, CheckoutIntent, RazorpayPaymentResult } from "./contract";
import type { PriceQuote } from "./pricing";
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
 * The booking panel as a state machine (FR-09, Phase 2 Sprint 2 & 3).
 *
 * Implements the full lifecycle:
 * 1. Slot & party selection (`loading` -> `selecting`)
 * 2. Inventory Hold reservation via Sprint 2 (`reserving` -> `held`)
 * 3. 5-minute Hold countdown with expiration detection (`held` -> `hold_expired`)
 * 4. Decoupled Order initiation via Sprint 3 (`ordering` -> `paying`)
 * 5. Razorpay hosted checkout interaction & dismissal recovery
 * 6. Payment authorization confirmation
 *
 * ```text
 * loading ─► selecting ─► reserving ─► held ─► ordering ─► paying ─► confirmed
 *    │           ▲          │           │ ▲       │          │
 *    ▼           │          ▼           ▼ └──dismiss─────────┘
 * load_error ────┘        error    hold_expired
 * ```
 */

export type BookingPhase =
  | "loading"
  | "load_error"
  | "selecting"
  | "reserving"
  | "held"
  | "hold_expired"
  | "ordering"
  | "paying"
  | "confirming"
  | "confirmed"
  | "error"
  // Legacy phase alias
  | "preparing";

export interface HeldBooking {
  readonly id: string;
  readonly bookingReference: string;
  readonly heldUntil: string;
  readonly totalAmountMinorUnits: number;
  readonly currency: string;
  readonly guestCount: number;
  readonly slotId: string;
}

export interface CheckoutOrderData {
  readonly bookingId: string;
  readonly paymentId: string;
  readonly gatewayOrderId: string;
  readonly orderId: string;
  readonly amount: number;
  readonly currency: string;
  readonly receipt: string;
  readonly status: string;
  readonly keyId?: string;
}

export interface BookingState {
  readonly phase: BookingPhase;
  readonly party: { readonly minGuests: number; readonly maxGuests: number | null };
  readonly days: readonly SlotDay[];
  readonly selectedDay: string | null;
  readonly selectedSlotId: string | null;
  readonly guests: number;
  /** Active reservation hold created in Sprint 2 */
  readonly hold: HeldBooking | null;
  /** Active checkout order created in Sprint 3 */
  readonly order: CheckoutOrderData | null;
  /** Authoritative price quote from server */
  readonly quote: PriceQuote | null;
  /** Authorized payment result from Razorpay modal */
  readonly paymentResult: RazorpayPaymentResult | null;
  /** A failure the traveller must read. */
  readonly error: string | null;
  /** Error code from ApiError (e.g. UNAUTHENTICATED, CONFLICT, BAD_REQUEST). */
  readonly errorCode: string | null;
  /** Something worth saying that is not a failure — e.g. a cancelled payment or active hold. */
  readonly notice: string | null;
  /** Legacy intent & confirmation for backwards compatibility */
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
  | { readonly type: "HOLD_RESERVED"; readonly hold: HeldBooking; readonly quote: PriceQuote }
  | { readonly type: "HOLD_EXPIRED" }
  | { readonly type: "PROCEED_TO_PAYMENT" }
  | { readonly type: "ORDER_CREATED"; readonly order: CheckoutOrderData }
  | { readonly type: "PAYMENT_AUTHORIZED"; readonly payment: RazorpayPaymentResult }
  | { readonly type: "PAYMENT_COMPLETED" }
  | { readonly type: "PAYMENT_DISMISSED" }
  | { readonly type: "PAYMENT_FAILED"; readonly message: string }
  | { readonly type: "CONFIRMED"; readonly confirmation: BookingConfirmation }
  | { readonly type: "FAILED"; readonly message: string; readonly code?: string }
  | { readonly type: "DISMISS_ERROR" }
  | { readonly type: "START_OVER" }
  | { readonly type: "INTENT_READY"; readonly intent: CheckoutIntent };

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
    hold: null,
    order: null,
    quote: null,
    paymentResult: null,
    error: null,
    errorCode: null,
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

export function canPay(state: BookingState): boolean {
  return state.phase === "held" && state.hold !== null;
}

/** Selection is frozen while a request or payment is in flight. */
export function isBusy(state: BookingState): boolean {
  return (
    state.phase === "preparing" ||
    state.phase === "reserving" ||
    state.phase === "ordering" ||
    state.phase === "paying" ||
    state.phase === "confirming"
  );
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
      return canSubmit(state)
        ? {
            ...state,
            phase: "preparing",
            error: null,
            errorCode: null,
            notice: null,
          }
        : state;

    case "HOLD_RESERVED":
      if (state.phase !== "reserving" && state.phase !== "preparing") return state;
      return {
        ...state,
        phase: "held",
        hold: event.hold,
        quote: event.quote,
        error: null,
        errorCode: null,
        notice: null,
      };

    case "HOLD_EXPIRED":
      if (
        state.phase !== "held" &&
        state.phase !== "ordering" &&
        state.phase !== "paying" &&
        state.phase !== "error"
      ) {
        return state;
      }
      return {
        ...state,
        phase: "hold_expired",
        order: null,
        error: null,
        errorCode: "HOLD_EXPIRED",
        notice: "Your 5-minute reservation hold has expired. Please choose a slot again.",
      };

    case "PROCEED_TO_PAYMENT":
      if (state.phase !== "held" || !state.hold) return state;
      return {
        ...state,
        phase: "ordering",
        error: null,
        errorCode: null,
        notice: null,
      };

    case "ORDER_CREATED":
      if (state.phase !== "ordering" && state.phase !== "held") return state;
      return {
        ...state,
        phase: "paying",
        order: event.order,
        error: null,
        errorCode: null,
        notice: null,
      };

    case "PAYMENT_AUTHORIZED":
      if (state.phase !== "paying" && state.phase !== "ordering") return state;
      return {
        ...state,
        phase: "confirmed",
        paymentResult: event.payment,
        error: null,
        errorCode: null,
        notice: null,
      };

    case "PAYMENT_COMPLETED":
      return state.phase === "paying" ? { ...state, phase: "confirming" } : state;

    case "PAYMENT_DISMISSED":
      if (state.phase !== "paying") return state;
      // Invariant: Modal dismissal does NOT fail the payment or destroy the hold!
      // Customer remains in 'held' state with active countdown and can click 'Resume Payment'.
      if (state.hold) {
        return {
          ...state,
          phase: "held",
          notice:
            "Payment window was closed. Your seats are still held. Click 'Resume Payment' to reopen.",
        };
      }
      return {
        ...state,
        phase: "selecting",
        intent: null,
        notice: "Payment was cancelled. Nothing was charged and your selection is kept.",
      };

    case "PAYMENT_FAILED":
      if (state.phase !== "paying") return state;
      if (state.hold) {
        return {
          ...state,
          phase: "held",
          notice:
            event.message ||
            "Payment did not go through. Your seats are still held — please try another card or UPI.",
        };
      }
      return {
        ...state,
        phase: "error",
        error: event.message,
      };

    case "CONFIRMED":
      return state.phase === "confirming"
        ? { ...state, phase: "confirmed", confirmation: event.confirmation, error: null }
        : state;

    case "FAILED":
      if (!isBusy(state) && state.phase !== "held") return state;
      if (
        event.code === "HOLD_EXPIRED" ||
        event.message.toLowerCase().includes("hold has expired") ||
        event.message.toLowerCase().includes("hold expired")
      ) {
        return {
          ...state,
          phase: "hold_expired",
          error: event.message,
          errorCode: event.code ?? "HOLD_EXPIRED",
          hold: null,
          order: null,
          intent: null,
        };
      }
      return {
        ...state,
        phase: "error",
        error: event.message,
        errorCode: event.code ?? null,
        intent: null,
        ...(state.phase === "preparing" || state.phase === "reserving" ? { hold: null } : {}),
      };

    case "DISMISS_ERROR":
      if (state.phase !== "error") return state;
      return {
        ...state,
        phase: state.hold ? "held" : "selecting",
        error: null,
        errorCode: null,
      };

    case "START_OVER":
      // Seats have changed since the slots were read, so start from a fresh read.
      return initialBookingState(state.party);

    // Backward compatibility for existing tests
    case "INTENT_READY":
      if (state.phase !== "preparing" && state.phase !== "reserving") return state;
      return {
        ...state,
        phase: event.intent.mode === "razorpay_test" ? "paying" : "confirming",
        intent: event.intent,
      };
  }
}
