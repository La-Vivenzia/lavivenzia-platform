import { jsonResponse, withRoute } from "@/lib/http";
import { getGenome } from "@/modules/taste-genome/service";
import { resolvePatron, withGuestCookie } from "./_identity";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/taste-genome — the current patron's Taste Genome.
 *
 * Public: a guest without a cookie is issued one, and receives an uncalibrated
 * uniform genome until they calibrate or browse.
 */
export const GET = withRoute(async (request) => {
  const identity = await resolvePatron(request);
  return withGuestCookie(jsonResponse({ genome: getGenome(identity.patronId) }), identity);
});
