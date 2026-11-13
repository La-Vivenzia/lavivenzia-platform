import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/auth-context";
import { getTasteGenomeService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { accountIdOf } from "@/modules/taste-genome/service";
import { resolvePatron, withGuestCookie } from "../_identity";
import { calibrationSchema } from "../_schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/taste-genome/calibrate — seed the genome from onboarding.
 *
 * A signed-in patron's genome is written to their account before this
 * returns; a guest's is held for this device. `anchored` tells the onboarding
 * modal which happened, so it can confirm the save or offer to anchor.
 *
 * Same-origin and rate limited: unauthenticated, but it writes.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);
  await enforceIpRateLimit("tasteGenomePerIp");

  const answers = await parseJsonBody(request, calibrationSchema);
  const identity = await resolvePatron(request);
  const genome = await getTasteGenomeService().calibrate(identity.patronId, answers);

  return withGuestCookie(
    jsonResponse({ genome, anchored: accountIdOf(identity.patronId) !== null }),
    identity,
  );
});
