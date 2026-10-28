import { ValidationError } from "@/lib/errors";
import type { PricingUnit } from "@/modules/experiences/readiness";

/**
 * Booking price quote (FR-09).
 *
 * Framework-free and pure, so the server that authorises a payment and the
 * panel that shows the traveller a total run the same arithmetic. The browser's
 * figure is a preview; the server recomputes it and the server's figure is the
 * one sent to the payment provider.
 *
 * **Only the host's price.** No platform fee, tax or discount line exists here
 * because none has been decided — A-003 (platform fee) and A-005 (GST/TCS) are
 * open founder decisions. Inventing one would put a guess on a receipt. When
 * those land they become further lines on the quote, and the total stays the
 * sum of its lines.
 *
 * Money is integer minor units throughout (ADR-0010). Never a float.
 */

export interface QuoteInput {
  /** The host's price in minor units. Null means "on request" — not bookable. */
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly pricingUnit: PricingUnit;
  readonly guests: number;
}

export interface QuoteLine {
  readonly kind: "per_person" | "per_group";
  readonly unitPriceMinor: number;
  /** Guests for a per-person line; always 1 for a per-group line. */
  readonly quantity: number;
  readonly amountMinor: number;
}

export interface PriceQuote {
  readonly currency: string;
  readonly pricingUnit: PricingUnit;
  readonly guests: number;
  readonly lines: readonly QuoteLine[];
  readonly totalMinor: number;
}

export function isPriced(basePriceMinor: number | null): basePriceMinor is number {
  return basePriceMinor !== null && Number.isSafeInteger(basePriceMinor) && basePriceMinor > 0;
}

export function quoteBooking(input: QuoteInput): PriceQuote {
  if (!isPriced(input.basePriceMinor)) {
    throw new ValidationError("This experience is priced on request and cannot be booked online.");
  }
  if (!Number.isSafeInteger(input.guests) || input.guests < 1) {
    throw new ValidationError("Guest count must be a whole number of at least 1.");
  }

  const unitPriceMinor = input.basePriceMinor;
  const line: QuoteLine =
    input.pricingUnit === "PER_PERSON"
      ? {
          kind: "per_person",
          unitPriceMinor,
          quantity: input.guests,
          amountMinor: unitPriceMinor * input.guests,
        }
      : { kind: "per_group", unitPriceMinor, quantity: 1, amountMinor: unitPriceMinor };

  const totalMinor = line.amountMinor;

  // Integers stay exact only up to 2^53. The catalogue caps a price well below
  // that, but a quote is a money boundary and checks for itself.
  if (!Number.isSafeInteger(totalMinor)) {
    throw new ValidationError("This booking total is too large to process.");
  }

  return {
    currency: input.currency.toUpperCase(),
    pricingUnit: input.pricingUnit,
    guests: input.guests,
    lines: [line],
    totalMinor,
  };
}
