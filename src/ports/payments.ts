/**
 * Payment gateway port.
 *
 * Order creation and checkout-signature verification are implemented, for the
 * test-mode checkout (ADR-0016). The state machine, refund policy engine,
 * commission model and ledger are still deliberately deferred until the
 * founder decisions on GST/TCS structure, cancellation policy and platform fee
 * are made — each of those determines column-level schema.
 * See PROJECT_STATE.md → Pending decisions.
 */

/** Money is always minor units (paise) as an integer. Never a float. */
export interface Money {
  /** Amount in the currency's minor unit, e.g. 499900 for ₹4,999.00. */
  readonly amountMinor: number;
  /** ISO 4217, e.g. "INR". Stored explicitly to keep expansion possible. */
  readonly currency: string;
}

export interface CreateOrderInput {
  readonly amount: Money;
  /** Our own reference, used for reconciliation against the provider. */
  readonly referenceId: string;
  readonly notes?: Readonly<Record<string, string>>;
}

export interface ProviderOrder {
  readonly providerOrderId: string;
  readonly amount: Money;
  readonly status: string;
}

export interface VerifiedWebhookEvent {
  /** Provider's event ID — the idempotency key for webhook processing. */
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: unknown;
}

export interface CheckoutSignatureInput {
  readonly orderId: string;
  readonly paymentId: string;
  readonly signature: string;
}

export interface PaymentGatewayPort {
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;

  /**
   * Verify the signature the hosted checkout returns on success, against the
   * order *we* created. This is the server-side check that turns a browser
   * callback — which proves nothing on its own — into evidence of payment.
   */
  verifyCheckoutSignature(input: CheckoutSignatureInput): boolean;

  /**
   * Verify a webhook signature against the raw request body and return the
   * parsed event. Implementations MUST verify before parsing, and MUST NOT
   * trust any client-supplied success signal (SYSTEM_DESIGN.md §8).
   */
  verifyWebhook(rawBody: string, signature: string): Promise<VerifiedWebhookEvent>;

  /** Server-side truth for a payment, used by the reconciliation sweep. */
  fetchPayment(providerPaymentId: string): Promise<{ status: string; amount: Money }>;
}
