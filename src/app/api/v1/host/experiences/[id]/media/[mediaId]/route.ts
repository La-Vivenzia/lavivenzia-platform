import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin } from "@/lib/auth-context";
import { requireHostContext } from "@/lib/host-context";
import { getExperienceService } from "@/lib/container";
import { updateMediaSchema } from "../../../../_schemas";

interface RouteContext {
  readonly params: Promise<{ readonly id: string; readonly mediaId: string }>;
}

/**
 * A single image.
 *
 * Both identifiers are checked together — the media must belong to the
 * experience, and the experience to the caller. A media id from another
 * listing matches nothing rather than being reassigned into this one.
 */

/** PATCH — set alternative text or reorder. */
export const PATCH = withRoute<RouteContext>(async (request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { id, mediaId } = await params;
  const { principal, host } = await requireHostContext();
  const body = await parseJsonBody(request, updateMediaSchema);

  const media = await getExperienceService().updateMedia(principal, host, id, mediaId, body);
  return jsonResponse({ media });
});

/** DELETE — detach the image and delete the stored bytes. */
export const DELETE = withRoute<RouteContext>(async (_request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { id, mediaId } = await params;
  const { principal, host } = await requireHostContext();

  await getExperienceService().removeMedia(principal, host, id, mediaId);

  return jsonResponse(null, 204);
});
