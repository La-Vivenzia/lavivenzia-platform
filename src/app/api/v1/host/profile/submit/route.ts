import { env } from "@/lib/env";
import { jsonResponse, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext, requirePrincipal } from "@/lib/auth-context";
import { getHostService } from "@/lib/container";

/**
 * POST /api/v1/host/profile/submit — submit for verification (FR-05, FR-15).
 *
 * No body. Everything the decision depends on is already stored, and
 * completeness is re-derived from the row rather than taken from the client.
 */
export const POST = withRoute(async () => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const context = await getRequestContext();

  const view = await getHostService().submitForVerification(principal, {
    ipAddress: context.ipAddress,
    correlationId: context.correlationId,
  });

  return jsonResponse({ profile: view });
});
