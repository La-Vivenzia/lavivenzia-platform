import { z } from "zod";
import { requirePrincipal } from "@/lib/auth-context";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getCheckoutService } from "@/lib/container";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { emitNotification } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly slug: string }>;
}

const ConfirmBody = z.object({
  intent: z.string().min(1).max(4096),
  razorpay: z
    .object({
      orderId: z.string().min(1).max(64),
      paymentId: z.string().min(1).max(64),
      signature: z.string().min(1).max(256),
    })
    .optional(),
});

/**
 * POST /api/v1/experiences/:slug/checkout/confirm — verify a completed
 * checkout and release the confirmation (FR-09, ADR-0016).
 *
 * The browser's "payment succeeded" callback is only a prompt to call this.
 * The confirmation — and the venue it reveals — is returned only once the
 * server has verified the signed intent and, in test mode, the provider's
 * payment signature against the order the server created.
 *
 * On success, a booking_confirmed notification is emitted to the patron's
 * inbox so their notification centre reflects the new reservation immediately.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await enforceIpRateLimit("checkoutPerIp");

  // Reserving is for signed-in patrons; browsing the listing is not gated.
  const principal = await requirePrincipal();

  const { slug } = await params;
  const body = await parseJsonBody(request, ConfirmBody);
  const confirmation = await getCheckoutService().confirm(slug, body);

  // Emit a notification so the patron sees the booking in their inbox
  // without polling or a separate webhook. The notification is best-effort:
  // a failure here must not roll back a confirmed booking.
  try {
    emitNotification({
      userId: principal.userId,
      type: "booking_confirmed",
      title: `Booking Confirmed: ${confirmation.experience.title}`,
      body: `Your reservation with ${confirmation.experience.hostName} is confirmed. Reference: ${confirmation.reference}.`,
      actionUrl: `/experiences/${slug}`,
    });
  } catch {
    // Non-fatal — the confirmation is already returned to the client.
  }

  return jsonResponse(confirmation);
});
