import { z } from "zod";
import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, requirePrincipal } from "@/lib/auth-context";
import { getBookingCapacityEngine } from "@/lib/container";

export const dynamic = "force-dynamic";

const reserveHoldSchema = z.object({
  slotId: z.string().uuid("Invalid slot ID format."),
  guests: z.number().int().min(1, "Must reserve at least 1 guest."),
  specialRequests: z.string().max(1000).optional(),
  customerPhone: z.string().max(20).optional(),
});

/**
 * POST /api/v1/checkout/reserve — Reserve a 5-minute capacity hold on an ExperienceSlot.
 *
 * Implements LA-12 Phase 2 Sprint 2:
 * 1. Pessimistic row-locking on target ExperienceSlot (`SELECT ... FOR UPDATE`).
 * 2. Dynamic active-hold calculation (`status = 'HELD' AND heldUntil > NOW()`).
 * 3. Atomic reservation creation with 5-minute TTL.
 * 4. Never modifies `ExperienceSlot.reservedCount`.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, reserveHoldSchema);

  const result = await getBookingCapacityEngine().reserveHold({
    slotId: body.slotId,
    userId: principal.userId,
    guests: body.guests,
    customerEmail: principal.email,
    customerPhone: body.customerPhone,
    specialRequests: body.specialRequests,
  });

  return jsonResponse(result, 201);
});
