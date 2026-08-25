import { jsonResponse, withRoute } from "@/lib/http";
import { requirePrincipal } from "@/lib/auth-context";
import { getOperationsService } from "@/lib/container";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ops/overview — queue depth and recent decisions (FR-14).
 *
 * Authorization is the service's, not this handler's. Route-level checks are
 * one forgotten import away from an open endpoint, and they do not cover the
 * server components that call the same service directly.
 */
export const GET = withRoute(async () => {
  const principal = await requirePrincipal();
  return jsonResponse(await getOperationsService().overview(principal));
});
