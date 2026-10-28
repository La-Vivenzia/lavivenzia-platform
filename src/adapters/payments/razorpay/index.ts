import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CheckoutSignatureInput,
  CreateOrderInput,
  Money,
  PaymentGatewayPort,
  ProviderOrder,
  VerifiedWebhookEvent,
} from "@/ports/payments";
import {
  InternalError,
  NotImplementedError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";

/**
 * Razorpay adapter.
 *
 * Implemented: webhook signature verification, order creation and checkout
 * signature verification (ADR-0010, ADR-0016). Payment fetch — the
 * reconciliation sweep's read — stays unimplemented until bookings are
 * persisted, because there is nothing yet to reconcile against.
 *
 * Each operation asserts the credential it needs when it is called rather than
 * at construction, so a deployment with only the webhook secret (or only the
 * key pair) still boots, and a missing credential fails at the point of use.
 */

const ORDERS_URL = "https://api.razorpay.com/v1/orders";

/**
 * Network budget for order creation. The traveller is waiting on this request
 * with a spinner on the reserve button.
 */
const REQUEST_TIMEOUT_MS = 8_000;

/** Razorpay caps `receipt` at 40 characters. */
const MAX_RECEIPT_LENGTH = 40;

export interface RazorpayAdapterConfig {
  readonly webhookSecret?: string | undefined;
  readonly keyId?: string | undefined;
  readonly keySecret?: string | undefined;
  /** Injected for tests; the global `fetch` otherwise. */
  readonly fetch?: typeof fetch;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, so compare lengths first —
  // a length difference is already a failed signature.
  return left.length === right.length && timingSafeEqual(left, right);
}

export class RazorpayAdapter implements PaymentGatewayPort {
  readonly #config: RazorpayAdapterConfig;
  readonly #fetch: typeof fetch;

  constructor(config: RazorpayAdapterConfig) {
    if (!config.webhookSecret && !(config.keyId && config.keySecret)) {
      throw new ValidationError("Razorpay is not configured: no webhook secret or key pair");
    }
    this.#config = config;
    this.#fetch = config.fetch ?? fetch;
  }

  #keys(): { keyId: string; keySecret: string } {
    const { keyId, keySecret } = this.#config;
    if (!keyId || !keySecret) {
      throw new ValidationError("Razorpay key id and secret are not configured");
    }
    return { keyId, keySecret };
  }

  /**
   * Create an order for a server-computed amount.
   *
   * **Not retried.** Razorpay orders carry no idempotency key, so a retry after
   * a timeout can create a second order; the traveller retries from the panel
   * instead, which prepares a fresh intent. A stray unpaid order expires on
   * Razorpay's side and moves no money.
   */
  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    const { keyId, keySecret } = this.#keys();
    if (!Number.isSafeInteger(input.amount.amountMinor) || input.amount.amountMinor <= 0) {
      throw new ValidationError("Order amount must be a positive integer of minor units");
    }

    let response: Response;
    try {
      response = await this.#fetch(ORDERS_URL, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: input.amount.amountMinor,
          currency: input.amount.currency,
          receipt: input.referenceId.slice(0, MAX_RECEIPT_LENGTH),
          ...(input.notes ? { notes: input.notes } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (caught) {
      const name = (caught as { name?: string } | null)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ProviderTimeoutError(
          "Payment provider timed out.",
          { provider: "razorpay" },
          {
            cause: caught,
          },
        );
      }
      throw new ProviderUnavailableError(
        "Payment provider is unreachable.",
        { provider: "razorpay" },
        {
          cause: caught,
        },
      );
    }

    const context = { provider: "razorpay", httpStatus: response.status };

    if (!response.ok) {
      // 401 and 400 are our configuration or our request, not the traveller's:
      // non-operational, so the message is not echoed and someone is alerted.
      if (response.status === 401 || response.status === 400) {
        throw new InternalError("Payment provider rejected the order request.", context);
      }
      throw new ProviderUnavailableError("Payment provider is unavailable.", context);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new ProviderUnavailableError(
        "Payment provider returned an unreadable response.",
        context,
        {
          cause,
        },
      );
    }

    const order = (body ?? {}) as {
      id?: unknown;
      amount?: unknown;
      currency?: unknown;
      status?: unknown;
    };
    if (
      typeof order.id !== "string" ||
      order.amount !== input.amount.amountMinor ||
      order.currency !== input.amount.currency
    ) {
      // An order for a different amount than we asked for must never reach checkout.
      throw new ProviderUnavailableError("Payment provider returned an unexpected order.", context);
    }

    return {
      providerOrderId: order.id,
      amount: input.amount,
      status: typeof order.status === "string" ? order.status : "created",
    };
  }

  /**
   * Razorpay signs `order_id|payment_id` with the key secret (HMAC-SHA256,
   * hex). Matching it proves the payment belongs to the order we created.
   */
  verifyCheckoutSignature(input: CheckoutSignatureInput): boolean {
    const { keySecret } = this.#keys();
    if (!input.orderId || !input.paymentId || !input.signature) return false;
    const expected = createHmac("sha256", keySecret)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest("hex");
    return constantTimeEqual(input.signature, expected);
  }

  fetchPayment(_providerPaymentId: string): Promise<{ status: string; amount: Money }> {
    throw new NotImplementedError(
      "Razorpay payment fetch is not implemented: reconciliation is deferred until bookings " +
        "are persisted.",
    );
  }

  /**
   * Verify `X-Razorpay-Signature` (HMAC-SHA256 over the raw body) in constant
   * time, then parse. Returning the provider event ID gives the caller the
   * idempotency key it needs to make duplicate delivery a no-op.
   */
  async verifyWebhook(rawBody: string, signature: string): Promise<VerifiedWebhookEvent> {
    const secret = this.#config.webhookSecret;
    if (!secret) throw new ValidationError("Razorpay webhook secret is not configured");

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!constantTimeEqual(signature, expected)) {
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
