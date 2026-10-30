import { randomBytes } from "node:crypto";
import { renderSVG } from "uqr";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatReference } from "@/modules/booking/checkout";
import type { CheckoutMode } from "@/modules/booking/contract";

import { findTrip, type PriceBasis, type Trip, type TripDay } from "./data";

/**
 * Simulated whole-trip checkout (ADR-0016 rules, applied to a trip bundle).
 *
 * **Nothing here moves money or holds anything.** There is no payment
 * provider call, no row written and no seat or room reserved with any venue.
 * The "payment record" is a description of what a real one would contain,
 * returned to the caller and then forgotten.
 *
 * The browser chooses a trip and a party size; the server decides everything
 * else. The price is computed here from the trip definition — a client never
 * sends one — and a closed checkout (`off`, the production default) refuses.
 */

export const SIMULATION_NOTICE =
  "Simulation only. No payment was taken, and nothing is reserved with any venue.";

/** Every line on a simulated trip is in this state, and only this state. */
export const SIMULATED_LINE_STATUS = "PRE_BOOKED_SIMULATED";

export interface SimulateTripRequest {
  readonly tripId: string;
  readonly partySize: number;
}

export interface SimulatedLine {
  readonly id: string;
  readonly kind: "stay" | "activity" | "dining";
  readonly title: string;
  /** The stay is listed against day 1, the night it covers. */
  readonly day: TripDay;
  readonly startMinute: number;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly totalMinor: number;
  readonly priceBasis: PriceBasis;
  readonly status: typeof SIMULATED_LINE_STATUS;
}

export interface SimulatedTripBooking {
  readonly simulated: true;
  readonly bookingReference: string;
  readonly trip: { readonly id: string; readonly title: string; readonly region: string };
  readonly partySize: number;
  readonly payment: {
    readonly transactionId: string;
    readonly status: "SIMULATED";
    readonly provider: "none";
    readonly amountMinor: number;
    /** Always zero. The field exists so no reader has to infer it. */
    readonly chargedMinor: 0;
    readonly currency: string;
  };
  readonly lines: readonly SimulatedLine[];
  readonly voucher: {
    /** What the QR encodes. Not a credential — nothing will accept it. */
    readonly payload: string;
    /** `data:image/svg+xml;base64,…`, for a plain `<img src>`. */
    readonly qrDataUri: string;
  };
  readonly hasIndicativePricing: boolean;
  readonly issuedAt: string;
  readonly notice: string;
}

export interface SimulateTripDependencies {
  readonly mode: CheckoutMode;
  readonly findTrip?: (id: string) => Trip | undefined;
  readonly now?: () => Date;
  readonly random?: (size: number) => Uint8Array;
}

function transactionId(bytes: Uint8Array): string {
  return `SIMTXN-${Buffer.from(bytes).toString("hex").toUpperCase()}`;
}

function toLines(trip: Trip, partySize: number): SimulatedLine[] {
  const stayLine: SimulatedLine = {
    id: `${trip.id}-stay`,
    kind: "stay",
    title: trip.stay.title,
    day: 1,
    startMinute: trip.stay.checkInMinute,
    quantity: partySize,
    unitPriceMinor: trip.stay.priceMinor,
    totalMinor: trip.stay.priceMinor * partySize,
    priceBasis: trip.stay.priceBasis,
    status: SIMULATED_LINE_STATUS,
  };

  const lines = trip.days.flatMap((plan) =>
    plan.lines.map((line): SimulatedLine => ({
      id: line.id,
      kind: line.kind,
      title: line.title,
      day: plan.day,
      startMinute: line.startMinute,
      quantity: partySize,
      unitPriceMinor: line.priceMinor,
      totalMinor: line.priceMinor * partySize,
      priceBasis: line.priceBasis,
      status: SIMULATED_LINE_STATUS,
    })),
  );

  return [stayLine, ...lines];
}

export function simulateTripBooking(
  request: SimulateTripRequest,
  deps: SimulateTripDependencies,
): SimulatedTripBooking {
  if (deps.mode === "off") {
    throw new ConflictError("Trip booking is not open yet.");
  }

  const trip = (deps.findTrip ?? findTrip)(request.tripId);
  if (!trip) throw new NotFoundError("That trip does not exist.");

  const { partySize } = request;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > trip.maxPartySize) {
    throw new ValidationError(`This trip takes between 1 and ${trip.maxPartySize} travellers.`, {
      partySize,
      max: trip.maxPartySize,
    });
  }

  const random = deps.random ?? ((size: number) => randomBytes(size));
  const now = (deps.now ?? (() => new Date()))();

  const lines = toLines(trip, partySize);
  const amountMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0);
  // No provider is involved in either non-off mode, so the reference is
  // always a DEMO one — never TEST-, which would imply Razorpay saw it.
  const bookingReference = formatReference(random(8), "demo");

  const payload = `lavivenzia:trip-voucher:v1?ref=${bookingReference}&trip=${trip.id}&party=${partySize}&simulated=1`;
  const svg = renderSVG(payload, { ecc: "M", border: 2 });

  return {
    simulated: true,
    bookingReference,
    trip: { id: trip.id, title: trip.title, region: trip.region },
    partySize,
    payment: {
      transactionId: transactionId(random(6)),
      status: "SIMULATED",
      provider: "none",
      amountMinor,
      chargedMinor: 0,
      currency: trip.currency,
    },
    lines,
    voucher: {
      payload,
      qrDataUri: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    },
    hasIndicativePricing: trip.hasIndicativePricing,
    issuedAt: now.toISOString(),
    notice: SIMULATION_NOTICE,
  };
}
