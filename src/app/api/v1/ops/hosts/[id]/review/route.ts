import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext, requirePrincipal } from "@/lib/auth-context";
import { getOperationsService } from "@/lib/container";
import { hostDecisionSchema } from "../../../_schemas";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/** POST /api/v1/ops/hosts/:id/review — verify or reject an application (FR-05). */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { id } = await params;
  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, hostDecisionSchema);
  const context = await getRequestContext();

  const view = await getOperationsService().decideOnHost(
    principal,
    { id, decision: body.decision, note: body.note ?? null },
    { ipAddress: context.ipAddress, correlationId: context.correlationId },
  );

  return jsonResponse(view);
});
