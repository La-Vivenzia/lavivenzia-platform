import { after } from "next/server";
import { z } from "zod";

import { requirePrincipal } from "@/lib/auth-context";
import { getJourneyPassService, sendJourneyPassEmail } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { JOURNEY_HOLDER_MAX, JOURNEY_PARTY_MAX } from "@/modules/booking/journey-pass-contract";

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
 * Once issued, the route and secret keyword are emailed to the signed-in
 * account's own address. The send runs after the response (`after`), so the
 * patron is never kept waiting on a mail provider, and a delivery failure is
 * logged rather than turned into a failed booking — the pass is on screen.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await enforceIpRateLimit("checkoutPerIp");

  // Reserving is for signed-in patrons; browsing the listing is not gated.
  const principal = await requirePrincipal();

  const { id } = await params;
  const body = await parseJsonBody(request, PassBody);
  const pass = await getJourneyPassService().issue({ journeyId: id, ...body });

  after(async () => {
    try {
      await sendJourneyPassEmail(principal.email, pass);
    } catch (error) {
      getLogger().warn(
        {
          reference: pass.reference,
          reason: error instanceof Error ? error.message : "unknown error",
        },
        "journey pass confirmation email was not sent",
      );
    }
  });

  return jsonResponse(pass, 201);
});
