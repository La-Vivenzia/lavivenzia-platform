import { jsonResponse, withRoute } from "@/lib/http";
import { getTasteGenomeService } from "@/lib/container";
import { accountIdOf } from "@/modules/taste-genome/service";
import { resolvePatron, withGuestCookie } from "./_identity";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/taste-genome — the current patron's Taste Genome.
 *
 * Public: a guest without a cookie is issued one, and receives an uncalibrated
 * uniform genome until they calibrate or browse. `anchored` says whether the
 * genome is saved to an account or held for this device only.
 */
export const GET = withRoute(async (request) => {
  const identity = await resolvePatron(request);
  const genome = await getTasteGenomeService().getGenome(identity.patronId);
  return withGuestCookie(
    jsonResponse({ genome, anchored: accountIdOf(identity.patronId) !== null }),
    identity,
  );
});
