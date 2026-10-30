import { jsonResponse, withRoute } from "@/lib/http";
import { listJourneys } from "@/modules/journeys/data";

/**
 * GET /api/v1/journeys — the curated multi-stop journeys.
 *
 * Unauthenticated and static: each journey is resolved from the pilot
 * catalogue, so its prices and durations are the listings' own. Privileges
 * carry a `confirmed` flag; a client must not present an unconfirmed one as a
 * guarantee.
 */
export const GET = withRoute(async () => {
  return jsonResponse({ journeys: listJourneys() });
});
