import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext, requirePrincipal } from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";
import { mfaVerifySchema } from "../../_schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/mfa/verify — satisfy the MFA challenge for this session.
 *
 * Confirms enrolment on first use and marks the session MFA-satisfied, which is
 * what `authorize()` checks before allowing any privileged permission.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, mfaVerifySchema);
  const context = await getRequestContext();

  await getAuthService().verifyMfa({
    userId: principal.userId,
    sessionId: principal.sessionId,
    code: body.code,
    context,
  });

  return jsonResponse({ mfaSatisfied: true });
});
