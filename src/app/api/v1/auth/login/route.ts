import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import {
  assertSameOrigin,
  buildSessionCookie,
  getRequestContext,
  withCookie,
} from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";
import { loginSchema } from "../_schemas";

/** POST /api/v1/auth/login — password authentication for hosts and admins. */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const body = await parseJsonBody(request, loginSchema);
  const context = await getRequestContext();

  const session = await getAuthService().loginWithPassword({
    email: body.email,
    password: body.password,
    context,
  });

  // A fresh token is minted on every login, so a session fixed before
  // authentication cannot survive it (session fixation).
  const response = jsonResponse({
    userId: session.userId,
    mfaRequired: session.mfaRequired,
    expiresAt: session.expiresAt.toISOString(),
  });

  return withCookie(response, buildSessionCookie(session.token, session.lifetime));
});
