import { z } from "zod";
import { requirePrincipal } from "@/lib/auth-context";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import {
  getCheckoutService,
  getCompanionService,
  sendBookingConfirmationEmail,
} from "@/lib/container";
import { getLogger } from "@/lib/logger";
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
 * checkout and release the confirmation (FR-09, ADR-0016, LA-22).
 *
 * The browser's "payment succeeded" callback is only a prompt to call this.
 * The confirmation — and the venue it reveals — is returned only once the
 * server has verified the signed intent and, in test mode, the provider's
 * payment signature against the order the server created.
 *
 * On success:
 * 1. Automatically emits an in-app BOOKING_CONFIRMED notification.
 * 2. Automatically sends a luxury-branded booking confirmation email.
 * 3. Automatically dispatches nearby curated recommendations based on the active zone.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await enforceIpRateLimit("checkoutPerIp");

  // Reserving is for signed-in patrons; browsing the listing is not gated.
  const principal = await requirePrincipal();

  const { slug } = await params;
  const body = await parseJsonBody(request, ConfirmBody);
  const confirmation = await getCheckoutService().confirm(slug, body);

  // 1. Emit an in-app booking_confirmed notification
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

  // 2. Automatically send booking confirmation email to traveler
  void sendBookingConfirmationEmail(principal.email, confirmation).catch((error: unknown) => {
    getLogger().warn(
      {
        reference: confirmation.reference,
        reason: error instanceof Error ? error.message : "unknown error",
      },
      "booking confirmation email was not sent",
    );
  });

  // 3. Automatically dispatch nearby curated recommendations for active experience zone
  void getCompanionService()
    .autoDispatch({
      to: principal.email,
      userId: principal.userId,
      activeExperienceSlug: slug,
      patronName: principal.email.split("@")[0],
    })
    .catch((error: unknown) => {
      getLogger().warn(
        {
          slug,
          reason: error instanceof Error ? error.message : "unknown error",
        },
        "automated companion dispatch after booking confirmation was not sent",
      );
    });

  return jsonResponse(confirmation);
});
