import { env } from "@/lib/env";
import { jsonResponse, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext, requirePrincipal } from "@/lib/auth-context";
import { getUserProfileService } from "@/lib/container";

/** GET /api/v1/user/sessions — live sessions, the current one first. */
export const GET = withRoute(async () => {
  const principal = await requirePrincipal();
  const sessions = await getUserProfileService().listSessions(principal);
  return jsonResponse({ sessions });
});

/** DELETE /api/v1/user/sessions — sign out every device except this one. */
export const DELETE = withRoute(async () => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const context = await getRequestContext();

  const result = await getUserProfileService().revokeOtherSessions(principal, {
    ipAddress: context.ipAddress,
    correlationId: context.correlationId,
  });

  return jsonResponse({ revokedSessions: result.revokedSessions });
});
