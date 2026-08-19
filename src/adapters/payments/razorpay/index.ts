import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CreateOrderInput,
  Money,
  PaymentGatewayPort,
  ProviderOrder,
  VerifiedWebhookEvent,
} from "@/ports/payments";
import { NotImplementedError, UnauthenticatedError, ValidationError } from "@/lib/errors";

/**
 * Razorpay adapter — integration boundary only.
 *
 * Order creation and payment fetch are intentionally unimplemented: they belong
 * with the booking/payment state machine, which is blocked on the founder
 * decisions listed in PROJECT_STATE.md.
 *
 * Webhook signature verification IS implemented, because it is a security
 * boundary rather than business logic, and because getting it wrong later is
 * expensive. It must run against the raw request body, before any parsing.
 */
export class RazorpayAdapter implements PaymentGatewayPort {
  readonly #webhookSecret: string;

  constructor(config: { readonly webhookSecret: string }) {
    if (!config.webhookSecret) {
      throw new ValidationError("Razorpay webhook secret is not configured");
    }
    this.#webhookSecret = config.webhookSecret;
  }

  createOrder(_input: CreateOrderInput): Promise<ProviderOrder> {
    throw new NotImplementedError(
      "Razorpay order creation is not implemented: payment business logic is deferred " +
        "pending the platform fee and GST/TCS decisions.",
    );
  }

  fetchPayment(_providerPaymentId: string): Promise<{ status: string; amount: Money }> {
    throw new NotImplementedError(
      "Razorpay payment fetch is not implemented: reconciliation is deferred to the " +
        "payments phase.",
    );
  }

  /**
   * Verify `X-Razorpay-Signature` (HMAC-SHA256 over the raw body) in constant
   * time, then parse. Returning the provider event ID gives the caller the
   * idempotency key it needs to make duplicate delivery a no-op.
   */
  async verifyWebhook(rawBody: string, signature: string): Promise<VerifiedWebhookEvent> {
    const expected = createHmac("sha256", this.#webhookSecret).update(rawBody).digest("hex");

    const provided = Buffer.from(signature, "utf8");
    const computed = Buffer.from(expected, "utf8");

    // timingSafeEqual throws on length mismatch, so compare lengths first —
    // a length difference is already a failed signature.
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      throw new UnauthenticatedError("Invalid webhook signature");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (cause) {
      throw new ValidationError("Webhook body is not valid JSON", {}, { cause });
    }

    if (typeof parsed !== "object" || parsed === null) {
      throw new ValidationError("Webhook body is not an object");
    }

    const event = parsed as Record<string, unknown>;
    const eventId = event.id;
    const eventType = event.event;

    if (typeof eventId !== "string" || typeof eventType !== "string") {
      throw new ValidationError("Webhook body is missing 'id' or 'event'");
    }

    return { eventId, eventType, payload: parsed };
  }
}
