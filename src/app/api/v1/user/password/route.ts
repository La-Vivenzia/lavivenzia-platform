import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext, requirePrincipal } from "@/lib/auth-context";
import { getUserProfileService } from "@/lib/container";
import { changePasswordSchema } from "../_schemas";

/**
 * POST /api/v1/user/password — change the password.
 *
 * Every other session is revoked in the same transaction; the one making this
 * request survives, so its cookie is left as it is.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, changePasswordSchema);
  const context = await getRequestContext();

  const result = await getUserProfileService().changePassword(principal, body, {
    ipAddress: context.ipAddress,
    correlationId: context.correlationId,
  });

  return jsonResponse({ ok: true, revokedSessions: result.revokedSessions });
});
