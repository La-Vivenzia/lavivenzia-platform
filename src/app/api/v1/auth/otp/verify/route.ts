import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import {
  assertSameOrigin,
  buildSessionCookie,
  getRequestContext,
  withCookie,
} from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";
import { otpVerifySchema } from "../../_schemas";

/** POST /api/v1/auth/otp/verify — exchange a valid code for a session. */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const body = await parseJsonBody(request, otpVerifySchema);
  const context = await getRequestContext();

  const session = await getAuthService().verifyLoginOtp({
    email: body.email,
    code: body.code,
    context,
  });

  const response = jsonResponse({
    userId: session.userId,
    mfaRequired: session.mfaRequired,
    expiresAt: session.expiresAt.toISOString(),
  });

  return withCookie(response, buildSessionCookie(session.token, session.lifetime));
});
