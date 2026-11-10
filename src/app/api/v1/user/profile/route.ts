import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext, requirePrincipal } from "@/lib/auth-context";
import { getUserProfileService } from "@/lib/container";
import { updateProfileSchema } from "../_schemas";

/**
 * The signed-in person's own profile.
 *
 * No user ID in the path: the account is resolved from the session, so there
 * is no identifier for a caller to substitute.
 */

/** GET /api/v1/user/profile */
export const GET = withRoute(async () => {
  const principal = await requirePrincipal();
  const profile = await getUserProfileService().getProfile(principal);
  return jsonResponse({ profile });
});

/** PATCH /api/v1/user/profile — partial; an omitted field is left alone. */
export const PATCH = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, updateProfileSchema);
  const context = await getRequestContext();

  const profile = await getUserProfileService().updateProfile(principal, body, {
    ipAddress: context.ipAddress,
    correlationId: context.correlationId,
  });

  return jsonResponse({ profile });
});
