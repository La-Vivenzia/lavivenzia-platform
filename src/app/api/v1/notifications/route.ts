import { requirePrincipal } from "@/lib/auth-context";
import { jsonResponse, withRoute } from "@/lib/http";
import { getNotificationsForUser } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications
 *
 * Returns the authenticated patron's notification inbox and unread count.
 * Seeds the inbox on first read so a new patron always sees something.
 */
export const GET = withRoute(async () => {
  const principal = await requirePrincipal();
  const result = getNotificationsForUser(principal.userId);
  return jsonResponse(result);
});
