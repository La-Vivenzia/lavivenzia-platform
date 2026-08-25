import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, parseQuery, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext } from "@/lib/auth-context";
import { requireHostContext } from "@/lib/host-context";
import { getExperienceService } from "@/lib/container";
import { createExperienceSchema, experienceQuerySchema } from "../_schemas";

/** GET /api/v1/host/experiences — the caller's own listings (FR-13). */
export const GET = withRoute(async (request) => {
  const { principal, host } = await requireHostContext();
  const query = parseQuery(request, experienceQuerySchema);

  const experiences = await getExperienceService().listOwn(principal, host, {
    ...(query.status ? { status: query.status } : {}),
  });

  return jsonResponse({ experiences });
});

/**
 * POST /api/v1/host/experiences — create a draft (FR-06).
 *
 * A title is all that is required to start. The listing is a draft from the
 * moment it exists, so a host can leave and come back rather than losing work
 * to a form that refuses to save until it is complete.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const { principal, host } = await requireHostContext();
  const body = await parseJsonBody(request, createExperienceSchema);
  const context = await getRequestContext();

  const view = await getExperienceService().createDraft(principal, host, body, {
    ipAddress: context.ipAddress,
    correlationId: context.correlationId,
  });

  return jsonResponse({ experience: view }, 201);
});
