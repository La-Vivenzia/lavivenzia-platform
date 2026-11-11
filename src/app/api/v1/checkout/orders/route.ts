import { z } from "zod";
import { assertSameOrigin, requirePrincipal } from "@/lib/auth-context";
import { getCheckoutOrdersService } from "@/lib/container";
import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

const createCheckoutOrderSchema = z.object({
  bookingId: z.string().uuid("Invalid booking ID format."),
});

/**
 * POST /api/v1/checkout/orders — Canonical checkout order initiation endpoint (LA-12 Phase 2 Sprint 3).
 *
 * Implements:
 * 1. CSRF origin verification (`assertSameOrigin`) and session authentication (`requirePrincipal`).
 * 2. Booking ownership validation and 5-minute hold TTL enforcement under short database row locks.
 * 3. Integer paise amount calculation and INR currency assertion.
 * 4. Attempt-level receipt formulation (`p_<paymentId>`) and dual metadata correlation in Razorpay notes.
 * 5. Two-phase short database transaction boundaries (network call strictly decoupled from DB locks).
 * 6. Coherent retry handling (HTTP 200 idempotent replay for active INITIATED orders).
 * 7. Fast webhook race recovery (preserves AUTHORIZED/CAPTURED states without clobbering).
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const principal = await requirePrincipal();
  const body = await parseJsonBody(request, createCheckoutOrderSchema);

  const result = await getCheckoutOrdersService().createCheckoutOrder({
    bookingId: body.bookingId,
    userId: principal.userId,
  });

  return jsonResponse(result.body, result.statusCode);
});
