import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin } from "@/lib/auth-context";
import { requireHostContext } from "@/lib/host-context";
import { getExperienceService } from "@/lib/container";
import { updateExperienceSchema } from "../../_schemas";

/**
 * A single listing.
 *
 * The `id` in the path is the *experience*, never the host. Ownership comes
 * from the session, and the repository requires the host ID as part of the
 * lookup — so an id belonging to another host resolves to nothing and returns
 * 404 rather than 403. A 403 would confirm the id exists, which is the fact an
 * enumeration attempt is looking for.
 */

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export const GET = withRoute<RouteContext>(async (_request, { params }) => {
  const { id } = await params;
  const { principal, host } = await requireHostContext();

  return jsonResponse({ experience: await getExperienceService().getOwn(principal, host, id) });
});

/** PATCH — save a section of the editor. Partial: absent keys are left alone. */
export const PATCH = withRoute<RouteContext>(async (request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { id } = await params;
  const { principal, host } = await requireHostContext();
  const body = await parseJsonBody(request, updateExperienceSchema);

  const view = await getExperienceService().updateContent(principal, host, id, body);
  return jsonResponse({ experience: view });
});
