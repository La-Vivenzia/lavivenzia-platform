import { z } from "zod";

import { jsonResponse, parseQuery, withRoute } from "@/lib/http";
import { PREMIUM_RATING_FLOOR, filterTripsByRating, listTrips } from "@/modules/trips/data";

const tripsQuerySchema = z.object({
  minRating: z.coerce.number().min(0).max(5).default(PREMIUM_RATING_FLOOR),
  verifiedOnly: z.enum(["true", "false"]).default("false"),
});

/**
 * GET /api/v1/trips — the curated end-to-end trips.
 *
 * Unauthenticated and static. Listing lines carry the listing's own price;
 * planned lines and stays carry `priceBasis: "indicative"`, and every curator
 * score carries `verified`. A client must surface both rather than present an
 * indicative figure as a quote or a provisional score as a verified one.
 */
export const GET = withRoute(async (request) => {
  const query = parseQuery(request, tripsQuerySchema);

  const trips = filterTripsByRating(listTrips(), {
    minScore: query.minRating,
    verifiedOnly: query.verifiedOnly === "true",
  });

  return jsonResponse({ trips });
});
