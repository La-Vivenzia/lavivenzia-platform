import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext } from "@/lib/auth-context";
import { requireHostContext } from "@/lib/host-context";
import { getExperienceService } from "@/lib/container";
import { experienceActionSchema } from "../../../_schemas";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * POST /api/v1/host/experiences/:id/actions — move a listing through the
 * lifecycle (FR-07).
 *
 * One endpoint taking a named action rather than four verbs-as-paths. The
 * transitions are a state machine, and a state machine with one entry point is
 * one that cannot be entered halfway. A transition that is not legal from the
 * current status returns 409, not 400: the request is well formed, the record
 * is simply not where the caller thought it was.
 *
 * Publication is absent by design. FR-07 puts approval between draft and
 * published, and approval belongs to Operations — a host can submit, never
 * publish.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { id } = await params;
  const { principal, host } = await requireHostContext();
  const body = await parseJsonBody(request, experienceActionSchema);
  const context = await getRequestContext();

  const view = await getExperienceService().performAction(principal, host, id, body.action, {
    ipAddress: context.ipAddress,
    correlationId: context.correlationId,
  });

  return jsonResponse({ experience: view });
});
