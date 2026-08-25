import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { withRoute } from "@/lib/http";
import {
  assertSameOrigin,
  buildClearedSessionCookie,
  getPrincipal,
  getRequestContext,
} from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";

/**
 * POST /host/sign-out — end the session and return to the front door.
 *
 * A form post rather than a fetch, so signing out works with JavaScript
 * unavailable. It is a POST because signing out changes state: as a GET it
 * would be triggerable by any image tag on any page.
 *
 * The server-side session is revoked first, then the cookie is cleared. In that
 * order a failure leaves the user still signed in rather than holding a cookie
 * for a session that no longer exists.
 */
export const POST = withRoute(async () => {
  await assertSameOrigin(env.APP_URL);

  const principal = await getPrincipal();

  if (principal) {
    const context = await getRequestContext();
    await getAuthService().revokeSession(principal.sessionId, context);
  }

  // 303 so the browser follows with a GET; a 302 after a POST is re-submitted
  // as a POST by some clients.
  const response = NextResponse.redirect(new URL("/sign-in", env.APP_URL), 303);
  response.cookies.set(buildClearedSessionCookie());

  return response;
});
