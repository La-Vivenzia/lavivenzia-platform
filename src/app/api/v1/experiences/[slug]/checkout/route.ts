import { z } from "zod";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getCheckoutService } from "@/lib/container";
import { enforceIpRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly slug: string }>;
}

const CheckoutBody = z.object({
  slotId: z.uuid(),
  guests: z.number().int().min(1).max(500),
});

/**
 * POST /api/v1/experiences/:slug/checkout — price and sign a booking choice
 * (FR-09, ADR-0016).
 *
 * The body carries only what the traveller chose: a slot and a party size.
 * Price, availability and — in test mode — the provider order all come from
 * the server; nothing the browser could say about money is accepted.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await enforceIpRateLimit("checkoutPerIp");

  const { slug } = await params;
  const body = await parseJsonBody(request, CheckoutBody);
  const intent = await getCheckoutService().prepare(slug, body);

  return jsonResponse(intent, 201);
});
