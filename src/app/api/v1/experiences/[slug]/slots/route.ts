import { jsonResponse, withRoute } from "@/lib/http";
import { getAvailabilityService, getDiscoveryService } from "@/lib/container";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly slug: string }>;
}

/**
 * GET /api/v1/experiences/:slug/slots — bookable availability (FR-08).
 *
 * The public read surface. Two properties keep it from leaking:
 *
 * Resolution goes through discovery, which has no status parameter at all, so
 * an unpublished listing 404s here exactly as it does on its detail route —
 * this endpoint cannot be used to discover that a draft exists.
 *
 * Only bookable slots are returned. A closed, sold-out or past-cut-off
 * occurrence is absent rather than shown as unavailable, so the response
 * cannot be read as a capacity report on someone else's business.
 */
export const GET = withRoute<RouteContext>(async (_request, { params }) => {
  const { slug } = await params;

  const experience = await getDiscoveryService().getExperience(slug);
  const slots = await getAvailabilityService().listBookable(experience.id);

  return jsonResponse({ slots });
});
