import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { handleItineraryRequest } from "@/modules/itinerary/service";
import { ItineraryRequest } from "@/modules/itinerary/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/itinerary/generate — plan an evening, or swap one stop.
 *
 * Unauthenticated, like the concierge: everything it returns is published
 * catalogue data. The body carries preferences and, for a swap, the current
 * stops as slugs; never a time or a price. Rate limited by client address
 * because each request is an exhaustive search.
 *
 * "Nothing fits" is a 200 with `status: "unfulfillable"` and a reason — a
 * correct answer to the constraints, not a failure.
 */
export const POST = withRoute(async (request) => {
  await enforceIpRateLimit("itineraryPerIp");

  const body = await parseJsonBody(request, ItineraryRequest);
  return jsonResponse(handleItineraryRequest(body));
});
