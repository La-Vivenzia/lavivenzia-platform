import { z } from "zod";

import { getPrincipal } from "@/lib/auth-context";
import { getJourneyPassService, sendJourneyPassEmail } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { JOURNEY_HOLDER_MAX, JOURNEY_PARTY_MAX } from "@/modules/booking/journey-pass-contract";
import { emitNotification } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/** A party size and a name to print. Never a price — the server computes that. */
const PassBody = z.object({
  partySize: z.number().int().min(1).max(JOURNEY_PARTY_MAX),
  holderName: z
    .string()
    .max(JOURNEY_HOLDER_MAX * 2)
    .optional(),
  /** From `POST …/pass/checkout`. Required in Razorpay test mode. */
  intent: z.string().min(1).max(4096).optional(),
  razorpay: z
    .object({
      orderId: z.string().min(1).max(64),
      paymentId: z.string().min(1).max(64),
      signature: z.string().min(1).max(256),
    })
    .optional(),
});

/**
 * POST /api/v1/journeys/:id/pass — one combined checkout for every act of a
 * curated journey, answered with a digital VIP pass.
 *
 * Follows the checkout mode (ADR-0016, amended Phase 4): closed when
 * `BOOKING_CHECKOUT` is `off`; a zero-key simulation in `demo`; and in
 * `razorpay_test` it issues only after the Razorpay payment signature verifies
 * server-side against the order `POST …/pass/checkout` created. The browser's
 * "payment succeeded" callback proves nothing on its own. Nothing is held with
 * any venue in any mode; the response says so in `simulated`, `payment` and
 * `notice`.
 *
 * Guests may unlock a pass without an account; the per-IP limit is the gate.
 * A signed-in patron additionally has the route and secret keyword emailed to
 * the account's own address — a guest has none, and keeps the pass on screen. The send is fire-and-forget (not awaited), so the
 * patron is never kept waiting on a mail provider, and a delivery failure is
 * logged rather than turned into a failed booking — the pass is on screen.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await enforceIpRateLimit("checkoutPerIp");

  const principal = await getPrincipal();

  const { id } = await params;
  const body = await parseJsonBody(request, PassBody);
  const pass = await getJourneyPassService().issue({ journeyId: id, ...body });

  if (principal) {
    try {
      emitNotification({
        userId: principal.userId,
        type: "booking_confirmed",
        title: `Booking Confirmed: ${pass.journey.title}`,
        body: `Your Journey Pass #${pass.reference} for ${pass.partySize} ${pass.partySize === 1 ? "guest" : "guests"} is confirmed. Secret door keyword: ${pass.secretKeyword}.`,
        actionUrl: `/journeys/${encodeURIComponent(pass.journey.id)}`,
      });
    } catch {
      // Non-fatal — pass is already issued.
    }

    void sendJourneyPassEmail(principal.email, pass).catch((error: unknown) => {
      getLogger().warn(
        {
          reference: pass.reference,
          reason: error instanceof Error ? error.message : "unknown error",
        },
        "journey pass confirmation email was not sent",
      );
    });
  }

  return jsonResponse(pass, 201);
});
