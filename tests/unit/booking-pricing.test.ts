import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { isPriced, quoteBooking } from "@/modules/booking/pricing";

/**
 * Booking price quote (FR-09).
 *
 * The same arithmetic previews the total in the panel and authorises the
 * amount sent to the provider, so it is pinned here exactly: integer paise,
 * no invented fee or tax line, and a total that is the sum of its lines.
 */

describe("quoteBooking", () => {
  it("multiplies a per-person price by the party size", () => {
    const quote = quoteBooking({
      basePriceMinor: 250_000,
      currency: "INR",
      pricingUnit: "PER_PERSON",
      guests: 3,
    });

    expect(quote.lines).toEqual([
      { kind: "per_person", unitPriceMinor: 250_000, quantity: 3, amountMinor: 750_000 },
    ]);
    expect(quote.totalMinor).toBe(750_000);
    expect(quote.guests).toBe(3);
  });

  it("charges a per-group price once, whatever the party size", () => {
    const two = quoteBooking({
      basePriceMinor: 1_200_000,
      currency: "INR",
      pricingUnit: "PER_GROUP",
      guests: 2,
    });
    const eight = quoteBooking({
      basePriceMinor: 1_200_000,
      currency: "INR",
      pricingUnit: "PER_GROUP",
      guests: 8,
    });

    expect(two.totalMinor).toBe(1_200_000);
    expect(eight.totalMinor).toBe(1_200_000);
    expect(eight.lines[0]).toMatchObject({ kind: "per_group", quantity: 1 });
    expect(eight.guests).toBe(8);
  });

  it("keeps money in integer minor units — no float drift", () => {
    // 0.1 + 0.2 territory in major units; exact in paise.
    const quote = quoteBooking({
      basePriceMinor: 33_333,
      currency: "INR",
      pricingUnit: "PER_PERSON",
      guests: 3,
    });
    expect(quote.totalMinor).toBe(99_999);
    expect(Number.isInteger(quote.totalMinor)).toBe(true);
  });

  it("adds no fee, tax or discount line while A-003 and A-005 are undecided", () => {
    const quote = quoteBooking({
      basePriceMinor: 100_000,
      currency: "INR",
      pricingUnit: "PER_PERSON",
      guests: 2,
    });
    expect(quote.lines).toHaveLength(1);
    expect(quote.totalMinor).toBe(quote.lines.reduce((sum, line) => sum + line.amountMinor, 0));
  });

  it("normalises the currency code", () => {
    const quote = quoteBooking({
      basePriceMinor: 100,
      currency: "inr",
      pricingUnit: "PER_GROUP",
      guests: 1,
    });
    expect(quote.currency).toBe("INR");
  });

  it("refuses a price on request", () => {
    expect(() =>
      quoteBooking({ basePriceMinor: null, currency: "INR", pricingUnit: "PER_PERSON", guests: 2 }),
    ).toThrow(ValidationError);
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses a guest count of %s", (guests) => {
    expect(() =>
      quoteBooking({ basePriceMinor: 100, currency: "INR", pricingUnit: "PER_PERSON", guests }),
    ).toThrow(ValidationError);
  });

  it("refuses a total beyond safe integer range", () => {
    expect(() =>
      quoteBooking({
        basePriceMinor: Number.MAX_SAFE_INTEGER,
        currency: "INR",
        pricingUnit: "PER_PERSON",
        guests: 2,
      }),
    ).toThrow(ValidationError);
  });
});

describe("isPriced", () => {
  it("accepts only a positive integer price", () => {
    expect(isPriced(1)).toBe(true);
    expect(isPriced(null)).toBe(false);
    expect(isPriced(0)).toBe(false);
    expect(isPriced(-5)).toBe(false);
    expect(isPriced(10.5)).toBe(false);
  });
});
