import { jsonResponse, withRoute } from "@/lib/http";
import { getDiscoveryService } from "@/lib/container";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { parseFilters } from "@/modules/discovery/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/experiences — public discovery (FR-01, FR-02, FR-03).
 *
 * Unauthenticated by design: every row it can return is already published.
 * Filters are parsed by the domain rather than here, and malformed values are
 * dropped rather than rejected — a traveller arriving on a link with a mangled
 * parameter should see experiences, not an error.
 *
 * **The keyword path is rate limited and the rest is not.** Filtering by
 * category, price or destination is an indexed lookup costing about what
 * serving the page costs. A keyword runs trigram similarity across the text
 * columns, which is materially more expensive and will run against any string a
 * stranger sends. Limiting only that arm keeps ordinary browsing unmetered
 * while putting a ceiling on the one shape worth abusing.
 *
 * Volumetric protection for the rendered pages belongs at the edge, not here
 * (SYSTEM_DESIGN.md §14). This bounds the scriptable JSON surface.
 */
export const GET = withRoute(async (request) => {
  const params = new URL(request.url).searchParams;

  const search = params.get("search")?.trim();
  if (search) await enforceIpRateLimit("discoverySearchPerIp");

  const page = await getDiscoveryService().browse(
    parseFilters({
      search: search ?? undefined,
      category: params.get("category") ?? undefined,
      destination: params.get("destination") ?? undefined,
      minPrice: params.get("minPrice") ?? undefined,
      maxPrice: params.get("maxPrice") ?? undefined,
      maxDuration: params.get("maxDuration") ?? undefined,
      // Location search (FR-03). Coordinates and radius are validated in the
      // domain; anything unusable drops the proximity filter rather than
      // failing the request, so a stale link still returns experiences.
      lat: params.get("lat") ?? undefined,
      lng: params.get("lng") ?? undefined,
      radiusKm: params.get("radiusKm") ?? undefined,
      sort: params.get("sort") ?? undefined,
      page: params.get("page") ?? undefined,
    }),
  );

  return jsonResponse(page);
});
