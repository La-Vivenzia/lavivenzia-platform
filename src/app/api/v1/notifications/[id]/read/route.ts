import { requirePrincipal } from "@/lib/auth-context";
import { jsonResponse, withRoute } from "@/lib/http";
import { NotFoundError } from "@/lib/errors";
import { markNotificationRead } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * POST /api/v1/notifications/[id]/read
 *
 * Marks a single notification as read. Silently enforces ownership — a patron
 * cannot mark another patron's notification as read; the response is a 404
 * rather than a 403 to avoid confirming that the notification exists.
 */
export const POST = withRoute<RouteContext>(async (_request, { params }) => {
  const principal = await requirePrincipal();
  const { id } = await params;

  const updated = markNotificationRead(id, principal.userId);
  if (!updated) {
    throw new NotFoundError(`Notification ${id} not found.`, { id });
  }

  return jsonResponse({ notification: updated });
});
