import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  assertCapacityChangeAllowed,
  assertSlotMutable,
  bookingClosesAt,
  isBookable,
  MAX_SLOTS_PER_REQUEST,
  overlaps,
  seatsRemaining,
  validateBatch,
  validateSlot,
} from "@/modules/availability/rules";

/**
 * Availability rules (FR-08).
 *
 * Pure logic, so this suite needs no database and no environment. What is
 * pinned here is the set of states a slot must never reach — because once
 * booking exists, every one of them becomes a seat sold twice or a traveller
 * holding a reservation nobody can honour.
 */

const NOW = new Date("2026-06-01T10:00:00.000Z");
const at = (iso: string) => new Date(iso);

const slot = (startsAt: string, endsAt: string, capacity = 10, bookingCutoffMinutes = 0) => ({
  startsAt: at(startsAt),
  endsAt: at(endsAt),
  capacity,
  bookingCutoffMinutes,
});

describe("overlaps", () => {
  it("detects a true overlap", () => {
    expect(
      overlaps(
        slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z"),
        slot("2026-06-02T11:00:00Z", "2026-06-02T13:00:00Z"),
      ),
    ).toBe(true);
  });

  it("treats back-to-back slots as not overlapping", () => {
    // A host running the same thing twice in a day expresses it exactly this
    // way, so touching endpoints must be allowed.
    expect(
      overlaps(
        slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z"),
        slot("2026-06-02T12:00:00Z", "2026-06-02T14:00:00Z"),
      ),
    ).toBe(false);
  });

  it("detects containment in both directions", () => {
    const outer = slot("2026-06-02T09:00:00Z", "2026-06-02T18:00:00Z");
    const inner = slot("2026-06-02T11:00:00Z", "2026-06-02T12:00:00Z");
    expect(overlaps(outer, inner)).toBe(true);
    expect(overlaps(inner, outer)).toBe(true);
  });
});

describe("validateSlot", () => {
  it("accepts a well-formed future slot", () => {
    expect(() =>
      validateSlot(slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z"), NOW),
    ).not.toThrow();
  });

  it("rejects a slot in the past", () => {
    expect(() => validateSlot(slot("2026-05-30T10:00:00Z", "2026-05-30T12:00:00Z"), NOW)).toThrow(
      ValidationError,
    );
  });

  it("rejects an end before the start", () => {
    expect(() => validateSlot(slot("2026-06-02T12:00:00Z", "2026-06-02T10:00:00Z"), NOW)).toThrow(
      ValidationError,
    );
  });

  it("rejects a zero-length slot", () => {
    expect(() => validateSlot(slot("2026-06-02T10:00:00Z", "2026-06-02T10:00:00Z"), NOW)).toThrow(
      ValidationError,
    );
  });

  it("rejects a slot longer than a day", () => {
    expect(() => validateSlot(slot("2026-06-02T10:00:00Z", "2026-06-04T10:00:00Z"), NOW)).toThrow(
      /24 hours/,
    );
  });

  it("rejects capacity below one", () => {
    expect(() =>
      validateSlot(slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z", 0), NOW),
    ).toThrow(ValidationError);
  });

  it("rejects fractional capacity", () => {
    expect(() =>
      validateSlot(slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z", 2.5), NOW),
    ).toThrow(ValidationError);
  });

  it("rejects a negative cut-off", () => {
    expect(() =>
      validateSlot(slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z", 10, -30), NOW),
    ).toThrow(ValidationError);
  });

  it("rejects an invalid date rather than writing NaN", () => {
    expect(() =>
      validateSlot(
        {
          startsAt: new Date("nonsense"),
          endsAt: at("2026-06-02T12:00:00Z"),
          capacity: 4,
          bookingCutoffMinutes: 0,
        },
        NOW,
      ),
    ).toThrow(ValidationError);
  });
});

describe("validateBatch", () => {
  it("accepts a non-overlapping batch", () => {
    expect(() =>
      validateBatch(
        [
          slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z"),
          slot("2026-06-02T14:00:00Z", "2026-06-02T16:00:00Z"),
        ],
        [],
        NOW,
      ),
    ).not.toThrow();
  });

  it("rejects two slots in the same batch that overlap each other", () => {
    // The case a per-slot check alone would miss.
    expect(() =>
      validateBatch(
        [
          slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z"),
          slot("2026-06-02T11:00:00Z", "2026-06-02T13:00:00Z"),
        ],
        [],
        NOW,
      ),
    ).toThrow(/overlap each other/);
  });

  it("rejects a slot overlapping one that already exists", () => {
    expect(() =>
      validateBatch(
        [slot("2026-06-02T11:00:00Z", "2026-06-02T13:00:00Z")],
        [slot("2026-06-02T10:00:00Z", "2026-06-02T12:00:00Z")],
        NOW,
      ),
    ).toThrow(/already exists/);
  });

  it("rejects an empty batch", () => {
    expect(() => validateBatch([], [], NOW)).toThrow(ValidationError);
  });

  it("caps how many slots one request may write", () => {
    const many = Array.from({ length: MAX_SLOTS_PER_REQUEST + 1 }, (_, i) =>
      slot(
        `2026-07-${String((i % 27) + 1).padStart(2, "0")}T${String(i % 20).padStart(2, "0")}:00:00Z`,
        `2026-07-${String((i % 27) + 1).padStart(2, "0")}T${String((i % 20) + 1).padStart(2, "0")}:00:00Z`,
      ),
    );
    expect(() => validateBatch(many, [], NOW)).toThrow(/at most/);
  });
});

describe("assertCapacityChangeAllowed", () => {
  it("allows raising capacity", () => {
    expect(() => assertCapacityChangeAllowed(20, 5)).not.toThrow();
  });

  it("allows lowering to exactly what is reserved", () => {
    expect(() => assertCapacityChangeAllowed(5, 5)).not.toThrow();
  });

  it("refuses dropping capacity below reserved seats", () => {
    // The whole point of FR-08's capacity rule: a slot must never be in a
    // state where more seats are sold than exist.
    expect(() => assertCapacityChangeAllowed(4, 5)).toThrow(/already reserved/);
  });
});

describe("seatsRemaining", () => {
  it("reports what is left", () => {
    expect(seatsRemaining({ capacity: 10, reservedCount: 3 })).toBe(7);
  });

  it("never reports a negative number, whatever is stored", () => {
    expect(seatsRemaining({ capacity: 2, reservedCount: 5 })).toBe(0);
  });
});

describe("bookingClosesAt / isBookable", () => {
  const open = {
    status: "OPEN" as const,
    startsAt: at("2026-06-02T10:00:00Z"),
    capacity: 10,
    reservedCount: 0,
    bookingCutoffMinutes: 120,
  };

  it("closes booking the cut-off before the start", () => {
    expect(bookingClosesAt(open).toISOString()).toBe("2026-06-02T08:00:00.000Z");
  });

  it("is bookable well before the cut-off", () => {
    expect(isBookable(open, at("2026-06-02T07:00:00Z"))).toBe(true);
  });

  it("is not bookable after the cut-off, even though the slot has not started", () => {
    expect(isBookable(open, at("2026-06-02T09:00:00Z"))).toBe(false);
  });

  it("is not bookable when closed by the host", () => {
    expect(isBookable({ ...open, status: "CLOSED" }, at("2026-06-02T07:00:00Z"))).toBe(false);
  });

  it("is not bookable when full", () => {
    expect(isBookable({ ...open, reservedCount: 10 }, at("2026-06-02T07:00:00Z"))).toBe(false);
  });

  it("is not bookable once the slot has started", () => {
    expect(isBookable(open, at("2026-06-02T11:00:00Z"))).toBe(false);
  });
});

describe("assertSlotMutable", () => {
  it("allows editing a future, unreserved slot", () => {
    expect(() =>
      assertSlotMutable({ startsAt: at("2026-06-02T10:00:00Z"), reservedCount: 0 }, NOW),
    ).not.toThrow();
  });

  it("refuses editing a slot that has started", () => {
    expect(() =>
      assertSlotMutable({ startsAt: at("2026-05-30T10:00:00Z"), reservedCount: 0 }, NOW),
    ).toThrow(/already started/);
  });

  it("refuses removing a slot travellers hold seats in", () => {
    expect(() =>
      assertSlotMutable({ startsAt: at("2026-06-02T10:00:00Z"), reservedCount: 2 }, NOW),
    ).toThrow(/reservation/);
  });
});
