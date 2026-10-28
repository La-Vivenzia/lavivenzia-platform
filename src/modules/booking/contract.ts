import type { PriceQuote } from "./pricing";

/**
 * The checkout contract between the booking panel and `/api/v1`.
 *
 * Plain types in a module with no directive, so the route handlers, the
 * service and the client component all import one definition (see the client
 * boundary test for why this cannot live in the component).
 */

/**
 * How checkout completes in this deployment.
 *
 * - `off` — selection and pricing work; the reserve action is closed.
 * - `demo` — no provider, no money. The server signs the confirmation itself
 *   and every surface says it is a demonstration.
 * - `razorpay_test` — hosted Razorpay Checkout against **test** keys. The
 *   server creates the order and verifies the payment signature.
 *
 * There is deliberately no live mode yet: no table records a booking, so live
 * money could be taken with nothing to show for it. See ADR-0016.
 */
export type CheckoutMode = "off" | "demo" | "razorpay_test";
export const CHECKOUT_MODES = ["off", "demo", "razorpay_test"] as const;

export interface CheckoutSlot {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

/** Response to `POST /checkout`: a priced, signed, short-lived intent. */
export interface CheckoutIntent {
  readonly mode: Exclude<CheckoutMode, "off">;
  /** Human-facing reference. `DEMO-` / `TEST-` prefixed outside live mode. */
  readonly reference: string;
  /** Opaque, server-signed. The client returns it untouched to confirm. */
  readonly intent: string;
  readonly quote: PriceQuote;
  readonly slot: CheckoutSlot;
  readonly expiresAt: string;
  /** Present only in `razorpay_test`: what the hosted checkout needs. */
  readonly razorpay?: {
    readonly keyId: string;
    readonly orderId: string;
    readonly amountMinor: number;
    readonly currency: string;
  };
}

/** What Razorpay's checkout handler returns on a successful payment. */
export interface RazorpayPaymentResult {
  readonly orderId: string;
  readonly paymentId: string;
  readonly signature: string;
}

export interface BookingConfirmation {
  readonly reference: string;
  readonly mode: Exclude<CheckoutMode, "off">;
  readonly experience: {
    readonly slug: string;
    readonly title: string;
    readonly hostName: string;
  };
  readonly slot: CheckoutSlot;
  readonly guests: number;
  readonly quote: PriceQuote;
  /**
   * The venue, released only after the server has verified the confirmation.
   * `lines` is the postal address as the host published it.
   */
  readonly venue: {
    readonly lines: readonly string[];
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly mapUrl: string | null;
  };
  readonly paymentId: string | null;
  readonly confirmedAt: string;
}
