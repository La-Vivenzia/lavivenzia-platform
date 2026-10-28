/**
 * Razorpay hosted Checkout, browser side (ADR-0010, ADR-0016).
 *
 * Hosted Checkout is a hard rule: card data is entered into Razorpay's own
 * frame and never touches our servers, which keeps PCI scope at SAQ-A. This
 * module only loads Razorpay's script and turns its callbacks into one
 * promise.
 *
 * **What it resolves with is not proof of payment.** `paid` carries the
 * identifiers and signature Razorpay handed the browser; the server verifies
 * that signature before anything is confirmed. A forged `paid` here gets a
 * traveller nothing.
 *
 * Plain module rather than `"use client"`: it exports functions that are not
 * components, and it only touches `window` when called.
 */

import type { RazorpayPaymentResult } from "@/modules/booking/contract";

export const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
const SCRIPT_TIMEOUT_MS = 15_000;

interface RazorpaySuccessResponse {
  readonly razorpay_order_id: string;
  readonly razorpay_payment_id: string;
  readonly razorpay_signature: string;
}

interface RazorpayFailureResponse {
  readonly error?: { readonly description?: string; readonly reason?: string };
}

interface RazorpayOptions {
  readonly key: string;
  readonly order_id: string;
  readonly amount: number;
  readonly currency: string;
  readonly name: string;
  readonly description: string;
  readonly notes?: Readonly<Record<string, string>>;
  readonly theme?: { readonly color?: string };
  readonly handler: (response: RazorpaySuccessResponse) => void;
  readonly modal?: { readonly ondismiss?: () => void; readonly escape?: boolean };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", callback: (response: RazorpayFailureResponse) => void): void;
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<RazorpayConstructor> | null = null;

/**
 * Load the checkout script once.
 *
 * Bounded by a timeout, and a failure clears the cached promise so the next
 * attempt starts clean — a traveller on a flaky connection can retry without
 * reloading the page.
 */
export function loadRazorpay(timeoutMs = SCRIPT_TIMEOUT_MS): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay Checkout can only load in a browser."));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail("Payment window took too long to load."), timeoutMs);

    function fail(message: string) {
      window.clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error(message));
    }

    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Razorpay) resolve(window.Razorpay);
      else fail("Payment window failed to start.");
    };
    script.onerror = () => fail("Payment window could not be loaded. Check your connection.");
    document.head.appendChild(script);
  });

  return loading;
}

export type RazorpayOutcome =
  | { readonly kind: "paid"; readonly payment: RazorpayPaymentResult }
  | { readonly kind: "dismissed" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Open the checkout for an order the server created, and settle once.
 *
 * Razorpay reports a failed attempt and then keeps the modal open for another
 * try, so `payment.failed` alone does not settle — the traveller may still pay.
 * The last failure is reported only if they then close the modal.
 */
export async function openRazorpayCheckout(input: {
  readonly keyId: string;
  readonly orderId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly title: string;
  readonly reference: string;
  readonly themeColor?: string;
}): Promise<RazorpayOutcome> {
  const Razorpay = await loadRazorpay();

  return new Promise<RazorpayOutcome>((resolve) => {
    let settled = false;
    let lastFailure: string | null = null;
    const settle = (outcome: RazorpayOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const checkout = new Razorpay({
      key: input.keyId,
      order_id: input.orderId,
      amount: input.amountMinor,
      currency: input.currency,
      name: "La Vivenzia",
      description: input.title,
      notes: { reference: input.reference },
      ...(input.themeColor ? { theme: { color: input.themeColor } } : {}),
      handler: (response) =>
        settle({
          kind: "paid",
          payment: {
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          },
        }),
      modal: {
        ondismiss: () =>
          settle(lastFailure ? { kind: "failed", message: lastFailure } : { kind: "dismissed" }),
      },
    });

    checkout.on("payment.failed", (response) => {
      lastFailure =
        response.error?.description ?? "The payment did not go through. Nothing was charged.";
    });

    checkout.open();
  });
}
