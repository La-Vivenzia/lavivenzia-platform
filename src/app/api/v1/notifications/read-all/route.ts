import { requirePrincipal } from "@/lib/auth-context";
import { jsonResponse, withRoute } from "@/lib/http";
import { markAllNotificationsRead } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/notifications/read-all
 *
 * Marks every unread notification for the authenticated patron as read.
 * Returns 204 — there is nothing to send back once all are marked.
 */
export const POST = withRoute(async () => {
  const principal = await requirePrincipal();
  markAllNotificationsRead(principal.userId);
  return jsonResponse(null, 204);
});
