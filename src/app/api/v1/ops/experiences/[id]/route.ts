import { jsonResponse, withRoute } from "@/lib/http";
import { requirePrincipal } from "@/lib/auth-context";
import { getOperationsService } from "@/lib/container";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * GET /api/v1/ops/experiences/:id — everything needed to review one listing.
 *
 * Returns the listing, its media, its host, the review history and the
 * decisions currently available. One request, because a reviewer opening an
 * item should not watch five panels populate independently.
 */
export const GET = withRoute<RouteContext>(async (_request, { params }) => {
  const { id } = await params;
  const principal = await requirePrincipal();

  return jsonResponse(await getOperationsService().getExperience(principal, id));
});
