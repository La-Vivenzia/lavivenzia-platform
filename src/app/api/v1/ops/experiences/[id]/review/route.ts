import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext, requirePrincipal } from "@/lib/auth-context";
import { getOperationsService } from "@/lib/container";
import { experienceDecisionSchema } from "../../../_schemas";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * POST /api/v1/ops/experiences/:id/review — approve, reject, suspend or
 * reinstate (FR-07, FR-14).
 *
 * The body carries a decision and a reason. It does not carry who is making it:
 * the actor is the authenticated principal, and there is no field for a client
 * to claim otherwise. The permission each decision needs is looked up from the
 * decision table rather than chosen here, so this handler cannot authorize a
 * suspension with an approval permission.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { id } = await params;
  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, experienceDecisionSchema);
  const context = await getRequestContext();

  const view = await getOperationsService().decideOnExperience(
    principal,
    { id, decision: body.decision, note: body.note ?? null },
    { ipAddress: context.ipAddress, correlationId: context.correlationId },
  );

  return jsonResponse(view);
});
