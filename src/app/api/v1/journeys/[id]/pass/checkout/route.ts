import { z } from "zod";

import { requirePrincipal } from "@/lib/auth-context";
import { getJourneyPassService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { JOURNEY_PARTY_MAX } from "@/modules/booking/journey-pass-contract";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/** A party size. Never a price — the server computes that from the live listings. */
const CheckoutBody = z.object({
  partySize: z.number().int().min(1).max(JOURNEY_PARTY_MAX),
});

/**
 * POST /api/v1/journeys/:id/pass/checkout — price a party for a curated
 * journey and sign a short-lived intent (ADR-0016, amended Phase 4).
 *
 * In `razorpay_test` the response also carries the Razorpay order the hosted
 * checkout will charge, created here for the server's total. In `demo` no
 * provider is called. The intent goes back, untouched, to `POST …/pass`.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await enforceIpRateLimit("checkoutPerIp");

  // Reserving is for signed-in patrons; browsing the listing is not gated.
  await requirePrincipal();

  const { id } = await params;
  const body = await parseJsonBody(request, CheckoutBody);
  const intent = await getJourneyPassService().prepare({ journeyId: id, ...body });

  return jsonResponse(intent, 201);
});
