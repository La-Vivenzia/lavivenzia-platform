import { env } from "@/lib/env";
import { jsonResponse, withRoute } from "@/lib/http";
import { assertSameOrigin, requirePrincipal } from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/mfa/enroll — begin TOTP enrolment.
 *
 * Requires an authenticated session but deliberately NOT a satisfied MFA
 * challenge: an admin whose role mandates MFA has to be able to enrol before
 * they can ever satisfy it, otherwise the requirement is unreachable.
 * `beginMfaEnrolment` refuses if MFA is already enrolled, which is what stops
 * a hijacked session from swapping the second factor.
 */
export const POST = withRoute(async () => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const { provisioningUri } = await getAuthService().beginMfaEnrolment(principal.userId);

  // Carries the shared secret. Returned once, over the authenticated channel,
  // and never logged.
  return jsonResponse({ provisioningUri });
});
