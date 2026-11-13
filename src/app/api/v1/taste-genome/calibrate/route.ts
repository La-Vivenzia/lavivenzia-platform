import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/auth-context";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { calibrate } from "@/modules/taste-genome/service";
import { resolvePatron, withGuestCookie } from "../_identity";
import { calibrationSchema } from "../_schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/taste-genome/calibrate — seed the genome from onboarding.
 *
 * Same-origin and rate limited: unauthenticated, but it writes.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);
  await enforceIpRateLimit("tasteGenomePerIp");

  const answers = await parseJsonBody(request, calibrationSchema);
  const identity = await resolvePatron(request);

  return withGuestCookie(jsonResponse({ genome: calibrate(identity.patronId, answers) }), identity);
});
