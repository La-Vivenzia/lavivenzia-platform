import { describe, expect, it } from "vitest";
import {
  checkGuestCount,
  clampGuests,
  describeGuestProblem,
  guestLimits,
} from "@/modules/booking/guests";
import { dayKeyOf, groupSlotsByDay, slotsForParty, type PublicSlot } from "@/modules/booking/slots";

/**
 * Party size and slot grouping (FR-08, FR-09).
 *
 * Three ceilings meet on the party size — the host's maximum, the seats left
 * on the slot and the catalogue ceiling — and the lowest must win. Slots are
 * grouped by day in IST, not in whatever zone the test machine runs in.
 */

describe("guestLimits", () => {
  it("is bounded by the host's minimum and maximum", () => {
    expect(guestLimits({ minGuests: 2, maxGuests: 6, seatsRemaining: 20 })).toEqual({
      min: 2,
      max: 6,
    });
  });

  it("is capped by the seats left on the slot when that is lower", () => {
    expect(guestLimits({ minGuests: 1, maxGuests: 10, seatsRemaining: 3 })).toEqual({
      min: 1,
      max: 3,
    });
  });

  it("falls back to the catalogue ceiling when the host set no maximum", () => {
    expect(guestLimits({ minGuests: 1, maxGuests: null, seatsRemaining: 10_000 })).toEqual({
      min: 1,
      max: 500,
    });
  });

  it("returns null when the smallest party cannot fit", () => {
    expect(guestLimits({ minGuests: 4, maxGuests: 8, seatsRemaining: 3 })).toBeNull();
  });

  it("treats a minimum below one as one", () => {
    expect(guestLimits({ minGuests: 0, maxGuests: 4, seatsRemaining: 4 })?.min).toBe(1);
  });
});

describe("clampGuests", () => {
  const limits = { min: 2, max: 6 };

  it.each([
    [1, 2],
    [2, 2],
    [4, 4],
    [6, 6],
    [9, 6],
    [3.7, 3],
    [Number.NaN, 2],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampGuests(input, limits)).toBe(expected);
  });
});

describe("checkGuestCount", () => {
  const rules = { minGuests: 2, maxGuests: 6, seatsRemaining: 4 };

  it("accepts a count inside every limit", () => {
    expect(checkGuestCount(3, rules)).toBeNull();
    expect(checkGuestCount(2, rules)).toBeNull();
    expect(checkGuestCount(4, rules)).toBeNull();
  });

  it("names each reason a count is refused", () => {
    expect(checkGuestCount(0, rules)).toBe("not_whole_number");
    expect(checkGuestCount(2.5, rules)).toBe("not_whole_number");
    expect(checkGuestCount(1, rules)).toBe("below_minimum");
    expect(checkGuestCount(7, rules)).toBe("above_party_maximum");
    expect(checkGuestCount(5, rules)).toBe("exceeds_seats_remaining");
  });

  it("enforces the catalogue ceiling with no host maximum", () => {
    expect(checkGuestCount(501, { minGuests: 1, maxGuests: null, seatsRemaining: 1000 })).toBe(
      "above_party_maximum",
    );
  });

  it("describes problems in traveller language", () => {
    expect(describeGuestProblem("exceeds_seats_remaining", { ...rules, seatsRemaining: 1 })).toBe(
      "Only 1 seat is left at this time.",
    );
    expect(describeGuestProblem("below_minimum", rules)).toContain("at least 2");
    expect(describeGuestProblem("above_party_maximum", rules)).toContain("at most 6");
  });
});

const slot = (id: string, startsAt: string, seatsRemaining = 10): PublicSlot => ({
  id,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 2 * 3_600_000).toISOString(),
  seatsRemaining,
  bookingClosesAt: startsAt,
});

describe("slot grouping", () => {
  it("keys a day in IST, not UTC", () => {
    // 20:00 UTC on the 2nd is 01:30 IST on the 3rd.
    expect(dayKeyOf("2026-11-02T20:00:00Z")).toBe("2026-11-03");
    expect(dayKeyOf("2026-11-02T10:00:00Z")).toBe("2026-11-02");
  });

  it("groups by day, soonest first, times ascending within a day", () => {
    const days = groupSlotsByDay([
      slot("c", "2026-11-03T04:30:00Z"),
      slot("b", "2026-11-02T12:30:00Z"),
      slot("a", "2026-11-02T03:30:00Z"),
    ]);

    expect(days.map((day) => day.key)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(days[0]!.slots.map((s) => s.id)).toEqual(["a", "b"]);
    expect(days[1]!.slots.map((s) => s.id)).toEqual(["c"]);
  });

  it("returns no days for no slots", () => {
    expect(groupSlotsByDay([])).toEqual([]);
  });

  it("drops slots with fewer seats than the smallest party", () => {
    const kept = slotsForParty(
      [slot("full-ish", "2026-11-02T03:30:00Z", 1), slot("ok", "2026-11-02T05:30:00Z", 4)],
      2,
    );
    expect(kept.map((s) => s.id)).toEqual(["ok"]);
  });
});
