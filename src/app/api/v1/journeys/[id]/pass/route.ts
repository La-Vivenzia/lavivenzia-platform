import { z } from "zod";

import { getJourneyPassService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { JOURNEY_HOLDER_MAX, JOURNEY_PARTY_MAX } from "@/modules/booking/journey-pass-contract";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/** A party size and a name to print. Never a price — the server computes that. */
const PassBody = z.object({
  partySize: z.number().int().min(1).max(JOURNEY_PARTY_MAX),
  holderName: z
    .string()
    .max(JOURNEY_HOLDER_MAX * 2)
    .optional(),
});

/**
 * POST /api/v1/journeys/:id/pass — one combined checkout for every act of a
 * curated journey, answered with a digital VIP pass.
 *
 * Follows the checkout mode (ADR-0016): closed when `BOOKING_CHECKOUT` is
 * `off`, the production default. No money moves and nothing is held in any
 * mode; the response says so in `simulated`, `payment.chargedMinor` and
 * `notice`.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await enforceIpRateLimit("checkoutPerIp");

  const { id } = await params;
  const body = await parseJsonBody(request, PassBody);
  const pass = await getJourneyPassService().issue({ journeyId: id, ...body });

  return jsonResponse(pass, 201);
});
