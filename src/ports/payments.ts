/**
 * Payment gateway port.
 *
 * Boundary only. No payment business logic exists yet: the state machine,
 * refund policy engine, commission model and ledger are deliberately deferred
 * until the founder decisions on GST/TCS structure, cancellation policy and
 * platform fee are made — each of those determines column-level schema.
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

export interface PaymentGatewayPort {
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;

  /**
   * Verify a webhook signature against the raw request body and return the
   * parsed event. Implementations MUST verify before parsing, and MUST NOT
   * trust any client-supplied success signal (SYSTEM_DESIGN.md §8).
   */
  verifyWebhook(rawBody: string, signature: string): Promise<VerifiedWebhookEvent>;

  /** Server-side truth for a payment, used by the reconciliation sweep. */
  fetchPayment(providerPaymentId: string): Promise<{ status: string; amount: Money }>;
}
