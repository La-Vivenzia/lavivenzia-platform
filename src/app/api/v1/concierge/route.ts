import { z } from "zod";

import { jsonResponse, parseQuery, withRoute } from "@/lib/http";
import { budgetFromRupees } from "@/modules/concierge/conversation";
import { BUDGET_RUPEES, MATCH_LIMIT, PARTY_SIZE } from "@/modules/concierge/options";
import { findVibeMatches } from "@/modules/concierge/service";

/**
 * Coordinates are optional strings on purpose: `resolveLocation` drops a
 * mangled pair and falls back to the hotspot, rather than failing the request
 * because a browser sent a stale fix.
 */
const conciergeQuerySchema = z.object({
  lat: z.string().max(32).optional(),
  lng: z.string().max(32).optional(),
  hotspot: z.string().max(32).optional(),
  craving: z.string().trim().min(1).max(80),
  party: z.coerce.number().int().min(PARTY_SIZE.min).max(PARTY_SIZE.max).default(2),
  /** Whole rupees, as the traveller said them. Absent means "flexible": no cap. */
  budget: z.coerce.number().int().min(BUDGET_RUPEES.min).max(BUDGET_RUPEES.max).optional(),
  budgetFor: z.enum(["each", "total"]).default("each"),
  limit: z.coerce.number().int().min(1).max(MATCH_LIMIT.max).default(MATCH_LIMIT.default),
});

/**
 * GET /api/v1/concierge — the concierge's ranking.
 *
 * Unauthenticated and read-only. Ranks the pilot catalogue by craving, distance
 * and the traveller's own budget for the party; every price is the booking quote for that party,
 * and every distance is measured from the listing's stored coordinates.
 */
export const GET = withRoute(async (request) => {
  const query = parseQuery(request, conciergeQuerySchema);

  const result = findVibeMatches({
    latitude: query.lat,
    longitude: query.lng,
    hotspot: query.hotspot,
    craving: query.craving,
    partySize: query.party,
    budget: query.budget === undefined ? null : budgetFromRupees(query.budget, query.budgetFor),
    limit: query.limit,
  });

  return jsonResponse(result);
});
