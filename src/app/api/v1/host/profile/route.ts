import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext, requirePrincipal } from "@/lib/auth-context";
import { getHostService } from "@/lib/container";
import { createHostProfileSchema, updateHostProfileSchema } from "../_schemas";

/**
 * The host's own profile (FR-05).
 *
 * There is no host ID in the path on purpose. The record is resolved from the
 * session, so there is no identifier for a caller to substitute.
 */

/** GET /api/v1/host/profile — the caller's profile, or null if onboarding has not started. */
export const GET = withRoute(async () => {
  const principal = await requirePrincipal();
  const view = await getHostService().getOwnProfile(principal);

  // 200 with null rather than 404: "you have not started" is a state the
  // dashboard renders, not a missing resource.
  return jsonResponse({ profile: view });
});

/** POST /api/v1/host/profile — begin onboarding. */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, createHostProfileSchema);
  const context = await getRequestContext();

  const view = await getHostService().createProfile(
    principal,
    {
      displayName: body.displayName,
      hostType: body.hostType,
      contactEmail: body.contactEmail ?? null,
    },
    { ipAddress: context.ipAddress, correlationId: context.correlationId },
  );

  return jsonResponse({ profile: view }, 201);
});

/** PATCH /api/v1/host/profile — save progress. Partial by design. */
export const PATCH = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, updateHostProfileSchema);

  const view = await getHostService().updateProfile(principal, body);
  return jsonResponse({ profile: view });
});
