import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { PricingUnit } from "@/modules/experiences/readiness";
import type { PaymentGatewayPort } from "@/ports/payments";
import type {
  BookingConfirmation,
  CheckoutIntent,
  CheckoutMode,
  RazorpayPaymentResult,
} from "./contract";
import { checkGuestCount, describeGuestProblem } from "./guests";
import { quoteBooking, type PriceQuote } from "./pricing";

/**
 * Checkout (FR-09, FR-10) — demo and Razorpay test mode only (ADR-0016).
 *
 * **What this is.** The server half of the booking panel: it re-validates the
 * traveller's choice against live availability, prices it with the same
 * arithmetic the panel previews, and — only after verifying that the
 * traveller actually completed checkout — releases a confirmation carrying the
 * venue.
 *
 * **What this is not.** A booking record. No Booking or Payment table exists
 * yet, so nothing here reserves a seat or persists a payment; the intent is a
 * signed, short-lived token instead of a row. That is exactly why live keys
 * are refused (`resolveCheckoutMode`): taking real money with no row to show
 * for it is the one outcome this design must make impossible. When the
 * booking aggregate lands, `prepare` becomes "create pending booking + hold"
 * and `confirm` becomes a state transition, and the contract to the panel does
 * not change.
 *
 * The browser is never trusted with a fact: not the price, not the slot's
 * availability, not payment success.
 */

const INTENT_TTL_MS = 30 * 60_000;
/** Crockford base32: no I, L, O or U — nothing a traveller can misread aloud. */
const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export interface CheckoutExperience {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly hostName: string;
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly pricingUnit: PricingUnit;
  readonly minGuests: number;
  readonly maxGuests: number | null;
  readonly addressLine: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface CheckoutSlotRecord {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly seatsRemaining: number;
}

export interface CheckoutDependencies {
  readonly mode: CheckoutMode;
  /** Resolves a *published* listing only; throws NotFoundError otherwise. */
  readonly findExperience: (slug: string) => Promise<CheckoutExperience>;
  /** The same "bookable" rule the public slots endpoint uses. */
  readonly listBookableSlots: (experienceId: string) => Promise<readonly CheckoutSlotRecord[]>;
  /** Required in `razorpay_test`; unused otherwise. */
  readonly gateway?: PaymentGatewayPort | null;
  readonly razorpayKeyId?: string | null;
  /** Secret key for signing intents. Never leaves the server. */
  readonly signingKey: string;
  readonly now?: () => Date;
  readonly random?: (size: number) => Uint8Array;
}

export interface CheckoutRequest {
  readonly slotId: string;
  readonly guests: number;
}

export interface ConfirmRequest {
  readonly intent: string;
  readonly razorpay?: RazorpayPaymentResult | undefined;
}

/** What the signed intent carries. Everything `confirm` needs, nothing more. */
interface IntentPayload {
  readonly v: 1;
  readonly mode: Exclude<CheckoutMode, "off">;
  readonly reference: string;
  readonly slug: string;
  readonly slotId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly guests: number;
  readonly quote: PriceQuote;
  readonly orderId: string | null;
  readonly exp: number;
}

/**
 * Decide the checkout mode from configuration, refusing anything unsafe.
 *
 * Unset means demo outside production and off in production, so a production
 * deployment never shows a demonstration confirmation unless someone chose to.
 */
export function resolveCheckoutMode(input: {
  readonly configured: CheckoutMode | undefined;
  readonly isProduction: boolean;
  readonly razorpayKeyId: string | undefined;
  readonly razorpayKeySecret: string | undefined;
}): CheckoutMode {
  const mode = input.configured ?? (input.isProduction ? "off" : "demo");
  if (mode !== "razorpay_test") return mode;

  if (!input.razorpayKeyId || !input.razorpayKeySecret) {
    throw new ValidationError(
      "BOOKING_CHECKOUT=razorpay_test requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
  }
  if (!input.razorpayKeyId.startsWith("rzp_test_")) {
    // Live keys would move real money with no booking record behind it.
    throw new ValidationError(
      "BOOKING_CHECKOUT=razorpay_test accepts Razorpay test keys only (rzp_test_…). " +
        "Live checkout is blocked until bookings are persisted (ADR-0016).",
    );
  }
  return mode;
}

export function formatReference(bytes: Uint8Array, mode: Exclude<CheckoutMode, "off">): string {
  const body = Array.from(bytes.slice(0, 8), (byte) => REFERENCE_ALPHABET[byte % 32]).join("");
  return `${mode === "demo" ? "DEMO" : "TEST"}-${body.slice(0, 4)}-${body.slice(4, 8)}`;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export class CheckoutService {
  readonly #deps: CheckoutDependencies;
  readonly #now: () => Date;
  readonly #random: (size: number) => Uint8Array;

  constructor(deps: CheckoutDependencies) {
    if (!deps.signingKey) throw new ValidationError("Checkout signing key is not configured.");
    if (deps.mode === "razorpay_test" && (!deps.gateway || !deps.razorpayKeyId)) {
      throw new ValidationError("Razorpay test checkout needs a gateway and a key id.");
    }
    this.#deps = deps;
    this.#now = deps.now ?? (() => new Date());
    this.#random = deps.random ?? ((size) => randomBytes(size));
  }

  get mode(): CheckoutMode {
    return this.#deps.mode;
  }

  // ── Intent signing ───────────────────────────────────────────────────────

  #sign(encoded: string): string {
    return createHmac("sha256", this.#deps.signingKey).update(encoded).digest("base64url");
  }

  #encodeIntent(payload: IntentPayload): string {
    const encoded = base64url(JSON.stringify(payload));
    return `${encoded}.${this.#sign(encoded)}`;
  }

  #decodeIntent(token: string): IntentPayload {
    const [encoded, signature, extra] = token.split(".");
    const invalid = new ValidationError("This checkout session is not valid. Please start again.");
    if (!encoded || !signature || extra !== undefined) throw invalid;

    const expected = Buffer.from(this.#sign(encoded));
    const provided = Buffer.from(signature);
    // Verify before parsing: an unsigned payload is never read.
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw invalid;

    let payload: IntentPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as IntentPayload;
    } catch {
      throw invalid;
    }
    if (payload.v !== 1) throw invalid;

    if (payload.exp <= this.#now().getTime()) {
      throw new ValidationError(
        "This checkout session has expired. Please choose your time again.",
      );
    }
    return payload;
  }

  // ── Prepare ──────────────────────────────────────────────────────────────

  /**
   * Validate a choice and return a priced, signed intent.
   *
   * In test mode this also creates the provider order, for the server-computed
   * amount — the hosted checkout can only charge what the order says.
   */
  async prepare(slug: string, request: CheckoutRequest): Promise<CheckoutIntent> {
    const mode = this.#deps.mode;
    if (mode === "off") {
      throw new ConflictError("Booking is not open for this experience yet.");
    }

    const experience = await this.#deps.findExperience(slug);
    const slots = await this.#deps.listBookableSlots(experience.id);
    const slot = slots.find((candidate) => candidate.id === request.slotId);
    if (!slot) {
      // Closed, full, past its cut-off, or never this experience's: one answer.
      throw new ConflictError("That time is no longer available. Please choose another.");
    }

    const rules = {
      minGuests: experience.minGuests,
      maxGuests: experience.maxGuests,
      seatsRemaining: slot.seatsRemaining,
    };
    const problem = checkGuestCount(request.guests, rules);
    if (problem) throw new ValidationError(describeGuestProblem(problem, rules));

    const quote = quoteBooking({
      basePriceMinor: experience.basePriceMinor,
      currency: experience.currency,
      pricingUnit: experience.pricingUnit,
      guests: request.guests,
    });

    const reference = formatReference(this.#random(8), mode);
    const expiresAt = new Date(this.#now().getTime() + INTENT_TTL_MS);

    let razorpay: CheckoutIntent["razorpay"];
    if (mode === "razorpay_test") {
      const order = await this.#deps.gateway!.createOrder({
        amount: { amountMinor: quote.totalMinor, currency: quote.currency },
        referenceId: reference,
        notes: { experience: experience.slug, slot: slot.id, guests: String(request.guests) },
      });
      razorpay = {
        keyId: this.#deps.razorpayKeyId!,
        orderId: order.providerOrderId,
        amountMinor: quote.totalMinor,
        currency: quote.currency,
      };
    }

    const startsAt = slot.startsAt.toISOString();
    const endsAt = slot.endsAt.toISOString();

    const intent = this.#encodeIntent({
      v: 1,
      mode,
      reference,
      slug: experience.slug,
      slotId: slot.id,
      startsAt,
      endsAt,
      guests: request.guests,
      quote,
      orderId: razorpay?.orderId ?? null,
      exp: expiresAt.getTime(),
    });

    return {
      mode,
      reference,
      intent,
      quote,
      slot: { id: slot.id, startsAt, endsAt },
      expiresAt: expiresAt.toISOString(),
      ...(razorpay ? { razorpay } : {}),
    };
  }

  // ── Confirm ──────────────────────────────────────────────────────────────

  /**
   * Turn a completed checkout into a confirmation.
   *
   * Test mode: the payment signature is verified against the order recorded in
   * the signed intent, so a payment for a different (cheaper) order cannot
   * confirm this one. Demo mode: the intent's own signature is the proof.
   *
   * Deterministic for one intent, so a retried request after a dropped
   * response returns the same reference rather than a second booking.
   */
  async confirm(slug: string, request: ConfirmRequest): Promise<BookingConfirmation> {
    const payload = this.#decodeIntent(request.intent);
    if (payload.slug !== slug || payload.mode !== this.#deps.mode) {
      throw new ValidationError("This checkout session is not valid. Please start again.");
    }

    let paymentId: string | null = null;
    if (payload.mode === "razorpay_test") {
      const payment = request.razorpay;
      if (!payment) throw new ValidationError("Payment details are missing.");

      const verified =
        payment.orderId === payload.orderId &&
        this.#deps.gateway!.verifyCheckoutSignature({
          orderId: payment.orderId,
          paymentId: payment.paymentId,
          signature: payment.signature,
        });
      if (!verified) {
        throw new ValidationError(
          "We could not verify this payment. If you were charged, contact support with your reference.",
        );
      }
      paymentId = payment.paymentId;
    }

    let experience: CheckoutExperience;
    try {
      experience = await this.#deps.findExperience(slug);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new ConflictError("This experience is no longer available.", {}, { cause: error });
      }
      throw error;
    }

    const lines = [
      experience.addressLine,
      [experience.city, experience.region].filter(Boolean).join(", "),
      experience.postalCode,
      experience.country,
    ]
      .map((line) => line?.trim())
      .filter((line): line is string => !!line);

    const hasPoint = experience.latitude !== null && experience.longitude !== null;

    return {
      reference: payload.reference,
      mode: payload.mode,
      experience: { slug: experience.slug, title: experience.title, hostName: experience.hostName },
      slot: { id: payload.slotId, startsAt: payload.startsAt, endsAt: payload.endsAt },
      guests: payload.guests,
      quote: payload.quote,
      venue: {
        lines,
        latitude: experience.latitude,
        longitude: experience.longitude,
        mapUrl: hasPoint
          ? `https://www.google.com/maps/search/?api=1&query=${experience.latitude},${experience.longitude}`
          : null,
      },
      paymentId,
      confirmedAt: this.#now().toISOString(),
    };
  }
}
