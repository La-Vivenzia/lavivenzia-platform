import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin } from "@/lib/auth-context";
import { requireHostContext } from "@/lib/host-context";
import { getAvailabilityService } from "@/lib/container";
import { updateSlotSchema } from "../../../../_schemas";

interface RouteContext {
  readonly params: Promise<{ readonly id: string; readonly slotId: string }>;
}

/**
 * PATCH /api/v1/host/experiences/:id/slots/:slotId — change a slot (FR-08).
 *
 * Capacity, cut-off and open/closed only. Times are deliberately immutable:
 * moving a slot that travellers may already hold seats in is a cancellation
 * and a rebooking, not an edit, and that belongs with Phase 6 where the
 * refund policy will exist.
 *
 * Ownership is resolved through the slot's parent experience and the
 * authenticated host, so a slot belonging to someone else is reported as not
 * found rather than forbidden — the API does not confirm it exists.
 */
export const PATCH = withRoute<RouteContext>(async (request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { slotId } = await params;
  const { principal, host } = await requireHostContext();
  const body = await parseJsonBody(request, updateSlotSchema);

  const slot = await getAvailabilityService().updateSlot(principal, host, slotId, body);

  return jsonResponse({ slot });
});

/**
 * DELETE /api/v1/host/experiences/:id/slots/:slotId — remove a slot (FR-08).
 *
 * Refused once the slot has started or has reservations. Closing is the
 * correct action for a slot people hold seats in, and it keeps the record.
 */
export const DELETE = withRoute<RouteContext>(async (_request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { slotId } = await params;
  const { principal, host } = await requireHostContext();

  await getAvailabilityService().removeSlot(principal, host, slotId);

  return jsonResponse({ removed: true });
});
