import { jsonResponse, withRoute } from "@/lib/http";
import { getDiscoveryService } from "@/lib/container";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly slug: string }>;
}

/**
 * GET /api/v1/experiences/:slug — one published listing.
 *
 * Addressed by slug, not by id. The UUID is internal; keeping it out of public
 * URLs means the surface reveals nothing about how many listings exist. An
 * unpublished listing returns 404, identically to one that never existed, so
 * the endpoint cannot be used to probe the review queue.
 */
export const GET = withRoute<RouteContext>(async (_request, { params }) => {
  const { slug } = await params;
  return jsonResponse(await getDiscoveryService().getExperience(slug));
});
