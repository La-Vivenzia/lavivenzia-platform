import { z } from "zod";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getCheckoutService } from "@/lib/container";
import { enforceIpRateLimit } from "@/lib/rate-limit";

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
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await enforceIpRateLimit("checkoutPerIp");

  const { slug } = await params;
  const body = await parseJsonBody(request, ConfirmBody);
  const confirmation = await getCheckoutService().confirm(slug, body);

  return jsonResponse(confirmation);
});
