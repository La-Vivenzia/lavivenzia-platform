import { env } from "@/lib/env";
import { jsonResponse, withRoute } from "@/lib/http";
import {
  assertSameOrigin,
  buildClearedSessionCookie,
  getPrincipal,
  getRequestContext,
  withCookie,
} from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";

/** POST /api/v1/auth/logout — revoke the current session. */
export const POST = withRoute(async () => {
  await assertSameOrigin(env.APP_URL);

  const principal = await getPrincipal();
  const context = await getRequestContext();

  if (principal) {
    // Server-side revocation, not just cookie removal: clearing the cookie
    // alone would leave a token that still authenticates if it was captured.
    await getAuthService().revokeSession(principal.sessionId, context);
  }

  // Always 204, even when already logged out — a different response for an
  // invalid session would confirm whether a captured token is still live.
  return withCookie(jsonResponse(null, 204), buildClearedSessionCookie());
});
