import { describe, expect, it } from "vitest";
import type { BookingConfirmation, CheckoutIntent } from "@/modules/booking/contract";
import {
  bookingReducer,
  canSubmit,
  currentGuestLimits,
  guestProblemMessage,
  initialBookingState,
  isBusy,
  selectedSlot,
  type BookingEvent,
  type BookingState,
} from "@/modules/booking/flow";
import type { PublicSlot } from "@/modules/booking/slots";

/**
 * The booking panel's state machine (FR-09).
 *
 * The transitions are the product: a dismissed payment keeps the selection, a
 * slot change re-clamps the party, nothing moves while a payment is open, and
 * an event that does not apply in the current phase changes nothing.
 */

const slot = (id: string, startsAt: string, seatsRemaining = 10): PublicSlot => ({
  id,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 2 * 3_600_000).toISOString(),
  seatsRemaining,
  bookingClosesAt: startsAt,
});

// Two days in IST; the 2nd has two times, the 3rd one.
const SLOTS = [
  slot("morning", "2026-11-02T03:30:00Z", 10),
  slot("evening", "2026-11-02T12:30:00Z", 3),
  slot("next-day", "2026-11-03T04:30:00Z", 8),
];

const run = (state: BookingState, ...events: BookingEvent[]) =>
  events.reduce(bookingReducer, state);

const loaded = (party = { minGuests: 2, maxGuests: 6 }, slots = SLOTS) =>
  run(initialBookingState(party), { type: "SLOTS_LOADED", slots });

const demoIntent: CheckoutIntent = {
  mode: "demo",
  reference: "DEMO-ABCD-1234",
  intent: "signed",
  quote: {
    currency: "INR",
    pricingUnit: "PER_PERSON",
    guests: 2,
    lines: [{ kind: "per_person", unitPriceMinor: 100, quantity: 2, amountMinor: 200 }],
    totalMinor: 200,
  },
  slot: { id: "morning", startsAt: SLOTS[0]!.startsAt, endsAt: SLOTS[0]!.endsAt },
  expiresAt: "2026-11-01T00:30:00Z",
};
const testIntent: CheckoutIntent = {
  ...demoIntent,
  mode: "razorpay_test",
  reference: "TEST-ABCD-1234",
  razorpay: { keyId: "rzp_test_x", orderId: "order_1", amountMinor: 200, currency: "INR" },
};
const confirmation = { reference: "DEMO-ABCD-1234" } as BookingConfirmation;

describe("initial state", () => {
  it("starts loading, with the party at the host's minimum", () => {
    const state = initialBookingState({ minGuests: 3, maxGuests: 8 });
    expect(state.phase).toBe("loading");
    expect(state.guests).toBe(3);
    expect(canSubmit(state)).toBe(false);
  });
});

describe("loading slots", () => {
  it("opens on the soonest day and selects nothing when it has several times", () => {
    const state = loaded();
    expect(state.phase).toBe("selecting");
    expect(state.days.map((day) => day.key)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(state.selectedDay).toBe("2026-11-02");
    expect(state.selectedSlotId).toBeNull();
    expect(canSubmit(state)).toBe(false);
  });

  it("chooses the time for the traveller when a day has only one", () => {
    const state = run(loaded(), { type: "SELECT_DAY", day: "2026-11-03" });
    expect(state.selectedSlotId).toBe("next-day");
  });

  it("shows an empty calendar rather than failing when nothing is open", () => {
    const state = loaded(undefined, []);
    expect(state.phase).toBe("selecting");
    expect(state.days).toEqual([]);
    expect(state.selectedDay).toBeNull();
  });

  it("hides slots too small for the minimum party", () => {
    const state = loaded({ minGuests: 4, maxGuests: 6 });
    const ids = state.days.flatMap((day) => day.slots.map((s) => s.id));
    expect(ids).not.toContain("evening");
  });

  it("records a load failure and recovers on reload", () => {
    const failed = run(initialBookingState({ minGuests: 1, maxGuests: 4 }), {
      type: "SLOTS_FAILED",
      message: "offline",
    });
    expect(failed.phase).toBe("load_error");
    expect(failed.error).toBe("offline");

    const retried = run(failed, { type: "RELOAD" }, { type: "SLOTS_LOADED", slots: SLOTS });
    expect(retried.phase).toBe("selecting");
    expect(retried.error).toBeNull();
  });

  it("keeps the selection across a reload when it still exists", () => {
    const chosen = run(loaded(), { type: "SELECT_SLOT", slotId: "evening" });
    const reloaded = run(chosen, { type: "RELOAD" }, { type: "SLOTS_LOADED", slots: SLOTS });
    expect(reloaded.selectedSlotId).toBe("evening");
  });

  it("drops a selection that vanished on reload", () => {
    const chosen = run(loaded(), { type: "SELECT_SLOT", slotId: "evening" });
    const reloaded = run(
      chosen,
      { type: "RELOAD" },
      { type: "SLOTS_LOADED", slots: [SLOTS[0]!, SLOTS[2]!] },
    );
    // The day still exists with a single time, which is selected for them.
    expect(reloaded.selectedSlotId).toBe("morning");
  });
});

describe("slot selection", () => {
  it("selects a time on the chosen day", () => {
    const state = run(loaded(), { type: "SELECT_SLOT", slotId: "morning" });
    expect(selectedSlot(state)?.id).toBe("morning");
    expect(canSubmit(state)).toBe(true);
  });

  it("ignores a time from a different day", () => {
    const state = run(loaded(), { type: "SELECT_SLOT", slotId: "next-day" });
    expect(state.selectedSlotId).toBeNull();
  });

  it("ignores an unknown slot id", () => {
    const state = run(loaded(), { type: "SELECT_SLOT", slotId: "nope" });
    expect(state.selectedSlotId).toBeNull();
  });

  it("clears the time when moving to a day with several times", () => {
    const state = run(
      loaded(),
      { type: "SELECT_DAY", day: "2026-11-03" },
      { type: "SELECT_DAY", day: "2026-11-02" },
    );
    expect(state.selectedSlotId).toBeNull();
  });

  it("ignores a day that has no slots", () => {
    const state = run(loaded(), { type: "SELECT_DAY", day: "2030-01-01" });
    expect(state.selectedDay).toBeNull();
    expect(state.selectedSlotId).toBeNull();
  });

  it("re-clamps the party when a slot with fewer seats is chosen", () => {
    const state = run(
      loaded(),
      { type: "SELECT_SLOT", slotId: "morning" },
      { type: "SET_GUESTS", guests: 6 },
      { type: "SELECT_SLOT", slotId: "evening" },
    );
    expect(state.guests).toBe(3);
    expect(currentGuestLimits(state)).toEqual({ min: 2, max: 3 });
    expect(guestProblemMessage(state)).toBeNull();
  });
});

describe("guest limits", () => {
  const chosen = () => run(loaded(), { type: "SELECT_SLOT", slotId: "morning" });

  it("clamps above the host maximum", () => {
    expect(run(chosen(), { type: "SET_GUESTS", guests: 40 }).guests).toBe(6);
  });

  it("clamps below the host minimum", () => {
    expect(run(chosen(), { type: "SET_GUESTS", guests: 0 }).guests).toBe(2);
  });

  it("steps within range", () => {
    expect(run(chosen(), { type: "SET_GUESTS", guests: 4 }).guests).toBe(4);
  });

  it("is bounded by the host's rules before a slot is chosen", () => {
    expect(run(loaded(), { type: "SET_GUESTS", guests: 9 }).guests).toBe(6);
  });
});

describe("checkout transitions", () => {
  const ready = () => run(loaded(), { type: "SELECT_SLOT", slotId: "morning" });

  it("refuses to submit without a slot", () => {
    expect(run(loaded(), { type: "SUBMIT" }).phase).toBe("selecting");
  });

  it("goes straight to confirming in demo mode", () => {
    const state = run(ready(), { type: "SUBMIT" }, { type: "INTENT_READY", intent: demoIntent });
    expect(state.phase).toBe("confirming");
    expect(state.intent).toBe(demoIntent);
  });

  it("opens payment in Razorpay test mode, then confirms after payment", () => {
    const paying = run(ready(), { type: "SUBMIT" }, { type: "INTENT_READY", intent: testIntent });
    expect(paying.phase).toBe("paying");
    expect(isBusy(paying)).toBe(true);

    const done = run(paying, { type: "PAYMENT_COMPLETED" }, { type: "CONFIRMED", confirmation });
    expect(done.phase).toBe("confirmed");
    expect(done.confirmation).toBe(confirmation);
  });

  it("keeps the selection and says nothing was charged when payment is dismissed", () => {
    const state = run(
      ready(),
      { type: "SET_GUESTS", guests: 4 },
      { type: "SUBMIT" },
      { type: "INTENT_READY", intent: testIntent },
      { type: "PAYMENT_DISMISSED" },
    );
    expect(state.phase).toBe("selecting");
    expect(state.selectedSlotId).toBe("morning");
    expect(state.guests).toBe(4);
    expect(state.intent).toBeNull();
    expect(state.notice).toMatch(/Nothing was charged/);
  });

  it("freezes selection while busy", () => {
    const preparing = run(ready(), { type: "SUBMIT" });
    expect(preparing.phase).toBe("preparing");
    const after = run(
      preparing,
      { type: "SELECT_SLOT", slotId: "evening" },
      { type: "SET_GUESTS", guests: 5 },
      { type: "SELECT_DAY", day: "2026-11-03" },
      { type: "SUBMIT" },
      { type: "RELOAD" },
    );
    expect(after).toEqual(preparing);
  });

  it("ignores a late slot load that arrives mid-checkout", () => {
    const paying = run(ready(), { type: "SUBMIT" }, { type: "INTENT_READY", intent: testIntent });
    expect(run(paying, { type: "SLOTS_LOADED", slots: [] })).toBe(paying);
  });

  it.each(["preparing", "paying", "confirming"] as const)(
    "moves to error from %s and back to selecting on dismiss",
    (phase) => {
      const events: BookingEvent[] = [{ type: "SUBMIT" }];
      if (phase !== "preparing") events.push({ type: "INTENT_READY", intent: testIntent });
      if (phase === "confirming") events.push({ type: "PAYMENT_COMPLETED" });

      const busy = run(ready(), ...events);
      expect(busy.phase).toBe(phase);

      const failed = run(busy, { type: "FAILED", message: "That time is no longer available." });
      expect(failed.phase).toBe("error");
      expect(failed.intent).toBeNull();
      expect(failed.selectedSlotId).toBe("morning");

      const back = run(failed, { type: "DISMISS_ERROR" });
      expect(back.phase).toBe("selecting");
      expect(back.error).toBeNull();
    },
  );

  it("ignores FAILED and CONFIRMED when nothing is in flight", () => {
    const state = ready();
    expect(run(state, { type: "FAILED", message: "x" })).toBe(state);
    expect(run(state, { type: "CONFIRMED", confirmation })).toBe(state);
  });

  it("cannot confirm a payment that never opened", () => {
    const state = ready();
    expect(run(state, { type: "PAYMENT_COMPLETED" })).toBe(state);
    expect(run(state, { type: "PAYMENT_DISMISSED" })).toBe(state);
  });

  it("starts over from a fresh slot read after confirmation", () => {
    const done = run(
      ready(),
      { type: "SUBMIT" },
      { type: "INTENT_READY", intent: demoIntent },
      { type: "CONFIRMED", confirmation },
    );
    const again = run(done, { type: "START_OVER" });
    expect(again).toEqual(initialBookingState({ minGuests: 2, maxGuests: 6 }));
  });
});
