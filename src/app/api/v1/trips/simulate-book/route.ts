import { z } from "zod";

import { getCheckoutService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { TRIP_PARTY_MAX } from "@/modules/trips/data";
import { simulateTripBooking } from "@/modules/trips/simulate";

export const dynamic = "force-dynamic";

/** A trip and a party size. Never a price — the server computes that. */
const SimulateBody = z.object({
  tripId: z.string().trim().min(1).max(64),
  partySize: z.number().int().min(1).max(TRIP_PARTY_MAX),
});

/**
 * POST /api/v1/trips/simulate-book — a simulated whole-trip booking.
 *
 * Follows the checkout mode (ADR-0016): closed when `BOOKING_CHECKOUT` is
 * `off`, which is the production default. No money moves and nothing is held
 * in any mode; the response says so in `simulated`, `payment.chargedMinor`
 * and `notice`.
 */
export const POST = withRoute(async (request) => {
  await enforceIpRateLimit("checkoutPerIp");

  const body = await parseJsonBody(request, SimulateBody);
  const booking = simulateTripBooking(body, { mode: getCheckoutService().mode });

  return jsonResponse(booking, 201);
});
