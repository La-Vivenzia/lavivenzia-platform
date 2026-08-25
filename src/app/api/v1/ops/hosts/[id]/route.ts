import { jsonResponse, withRoute } from "@/lib/http";
import { requirePrincipal } from "@/lib/auth-context";
import { getOperationsService } from "@/lib/container";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/** GET /api/v1/ops/hosts/:id — a host application with its review history. */
export const GET = withRoute<RouteContext>(async (_request, { params }) => {
  const { id } = await params;
  const principal = await requirePrincipal();

  return jsonResponse(await getOperationsService().getHost(principal, id));
});
