import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { renderSVG } from "uqr";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { PricingUnit } from "@/modules/experiences/readiness";
import type { Journey } from "@/modules/journeys/data";

import type { PaymentGatewayPort } from "@/ports/payments";

import type { CheckoutMode, RazorpayPaymentResult } from "./contract";
import {
  JOURNEY_ACT_STATUS,
  JOURNEY_HOLDER_MAX,
  JOURNEY_PARTY_MAX,
  type JourneyPass,
  type JourneyPassAct,
  type JourneyPassIntent,
} from "./journey-pass-contract";
import { generateSecretKeyword } from "./keywords";

/**
 * Unified journey checkout — one transaction for every act, one VIP pass.
 *
 * **Two modes, one flow (ADR-0016, amended Phase 4).** `prepare` prices the
 * party from the live listings and signs a short-lived intent; `issue` turns
 * it into a pass.
 *
 * - `demo` (no Razorpay keys): no provider is called and nothing is charged.
 * - `razorpay_test`: `prepare` creates a Razorpay order for the server's total
 *   and `issue` refuses until the hosted checkout's HMAC-SHA256 payment
 *   signature verifies against *that* order.
 *
 * In every mode no row is written and nothing is reserved with any venue; the
 * pass says so in `simulated`, `payment` and `notice`. `off` refuses outright.
 *
 * **The browser chooses a journey and a party; the server decides the rest.**
 * Every act's listing is re-read through the discovery port — PostgreSQL in
 * production — so an unpublished venue refuses the pass, and the total is the
 * sum of live listing prices, never one the client sent (CLAUDE.md §6–7).
 *
 * The QR payload is signed with a server key, so a future host tool can tell
 * a pass this server issued from one someone typed.
 */

export const JOURNEY_PASS_NOTICE =
  "Simulation only. No payment was taken, and nothing is reserved with any venue yet.";

export const JOURNEY_PASS_TEST_NOTICE =
  "Razorpay test mode. No real money moved, and nothing is reserved with any venue yet.";

const INTENT_TTL_MS = 30 * 60_000;

/** Crockford base32: nothing a host can misread aloud. */
const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const PAYLOAD_PREFIX = "lavivenzia:journey-pass:v1?";

/** What the pass needs of a listing, read live at issue. */
export interface JourneyListing {
  readonly slug: string;
  readonly title: string;
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly pricingUnit: PricingUnit;
  readonly minGuests: number;
  readonly maxGuests: number | null;
}

export interface JourneyPassDependencies {
  readonly mode: CheckoutMode;
  readonly findJourney: (id: string) => Journey | undefined;
  /** Resolves a *published* listing only; throws NotFoundError otherwise. */
  readonly findListing: (slug: string) => Promise<JourneyListing>;
  /** Required in `razorpay_test`; unused otherwise. */
  readonly gateway?: PaymentGatewayPort | null;
  readonly razorpayKeyId?: string | null;
  /** Secret key for signing QR payloads. Never leaves the server. */
  readonly signingKey: string;
  /** Secret key for signing checkout intents; defaults to a label off `signingKey`. */
  readonly intentSigningKey?: string;
  readonly now?: () => Date;
  readonly random?: (size: number) => Uint8Array;
}

export interface JourneyPassRequest {
  readonly journeyId: string;
  readonly partySize: number;
  readonly holderName?: string | undefined;
  /** From `prepare`. Optional in demo; required in `razorpay_test`. */
  readonly intent?: string | undefined;
  /** What Razorpay's hosted checkout returned. Required in `razorpay_test`. */
  readonly razorpay?: RazorpayPaymentResult | undefined;
}

/** What the signed intent carries. Everything `issue` needs to trust, nothing more. */
interface PassIntentPayload {
  readonly v: 1;
  readonly mode: Exclude<CheckoutMode, "off">;
  readonly journeyId: string;
  readonly partySize: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly orderId: string | null;
  readonly exp: number;
}

interface PricedJourney {
  readonly journey: Journey;
  readonly listings: readonly JourneyListing[];
  readonly perPersonMinor: number;
}

/** "LV-7K2Q". */
export function formatPassReference(bytes: Uint8Array): string {
  if (bytes.length < 4) throw new Error("formatPassReference needs four bytes");
  const body = Array.from(bytes.slice(0, 4), (byte) => REFERENCE_ALPHABET[byte % 32]).join("");
  return `LV-${body}`;
}

/** A holder name safe to print: trimmed, single-spaced, bounded. */
export function normaliseHolderName(name: string | undefined): string {
  const cleaned = (name ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, JOURNEY_HOLDER_MAX);
  return cleaned.length > 0 ? cleaned : "Guest of La Vivenzia";
}

function hostInstruction(
  keyword: string,
  act: { readonly privilege: { readonly title: string; readonly confirmed: boolean } },
): string {
  const privilege = act.privilege.confirmed
    ? `your ${act.privilege.title.toLowerCase()} is arranged`
    : `your ${act.privilege.title.toLowerCase()} has been requested`;
  return `Say “${keyword}” to the host, or show this pass — ${privilege}.`;
}

export class JourneyPassService {
  readonly #deps: JourneyPassDependencies;
  readonly #intentKey: string;
  readonly #now: () => Date;
  readonly #random: (size: number) => Uint8Array;

  constructor(deps: JourneyPassDependencies) {
    if (!deps.signingKey) throw new ValidationError("Journey pass signing key is not configured.");
    if (deps.mode === "razorpay_test" && (!deps.gateway || !deps.razorpayKeyId)) {
      throw new ValidationError("Razorpay test checkout needs a gateway and a key id.");
    }
    this.#deps = deps;
    this.#intentKey =
      deps.intentSigningKey ??
      createHmac("sha256", deps.signingKey).update("lv.journey-pass-intent.v1").digest("hex");
    this.#now = deps.now ?? (() => new Date());
    this.#random = deps.random ?? ((size) => randomBytes(size));
  }

  get mode(): CheckoutMode {
    return this.#deps.mode;
  }

  #sign(fields: string): string {
    return createHmac("sha256", this.#deps.signingKey)
      .update(fields)
      .digest("base64url")
      .slice(0, 22);
  }

  /** True only for a payload this server signed, unaltered. */
  verifyPassPayload(payload: string): boolean {
    if (!payload.startsWith(PAYLOAD_PREFIX)) return false;
    const query = payload.slice(PAYLOAD_PREFIX.length);
    const at = query.lastIndexOf("&sig=");
    if (at < 0) return false;
    const fields = query.slice(0, at);
    const provided = Buffer.from(query.slice(at + "&sig=".length));
    const expected = Buffer.from(this.#sign(fields));
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  // ── Intent signing ───────────────────────────────────────────────────────

  #signIntent(encoded: string): string {
    return createHmac("sha256", this.#intentKey).update(encoded).digest("base64url");
  }

  #encodeIntent(payload: PassIntentPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.#signIntent(encoded)}`;
  }

  #decodeIntent(token: string): PassIntentPayload {
    const invalid = new ValidationError("This checkout session is not valid. Please start again.");
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra !== undefined) throw invalid;

    const expected = Buffer.from(this.#signIntent(encoded));
    const provided = Buffer.from(signature);
    // Verify before parsing: an unsigned payload is never read.
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw invalid;

    let payload: PassIntentPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PassIntentPayload;
    } catch {
      throw invalid;
    }
    if (payload.v !== 1) throw invalid;
    if (payload.exp <= this.#now().getTime()) {
      throw new ValidationError("This checkout session has expired. Please reserve again.");
    }
    return payload;
  }

  // ── Prepare ──────────────────────────────────────────────────────────────

  /**
   * Price a party from the live listings and return a signed intent. In test
   * mode this also creates the Razorpay order, for the server-computed amount —
   * the hosted checkout can only charge what the order says.
   */
  async prepare(request: {
    readonly journeyId: string;
    readonly partySize: number;
  }): Promise<JourneyPassIntent> {
    const { journey, perPersonMinor } = await this.#price(request.journeyId, request.partySize);
    const mode = this.#deps.mode as Exclude<CheckoutMode, "off">;
    const amountMinor = perPersonMinor * request.partySize;
    const expiresAt = new Date(this.#now().getTime() + INTENT_TTL_MS);

    let razorpay: JourneyPassIntent["razorpay"];
    if (mode === "razorpay_test") {
      const order = await this.#deps.gateway!.createOrder({
        amount: { amountMinor, currency: journey.currency },
        referenceId: `JRNY-${formatPassReference(this.#random(4))}`,
        notes: { journey: journey.id, party: String(request.partySize) },
      });
      razorpay = {
        keyId: this.#deps.razorpayKeyId!,
        orderId: order.providerOrderId,
        amountMinor,
        currency: journey.currency,
      };
    }

    const intent = this.#encodeIntent({
      v: 1,
      mode,
      journeyId: journey.id,
      partySize: request.partySize,
      amountMinor,
      currency: journey.currency,
      orderId: razorpay?.orderId ?? null,
      exp: expiresAt.getTime(),
    });

    return {
      mode,
      intent,
      partySize: request.partySize,
      amountMinor,
      currency: journey.currency,
      expiresAt: expiresAt.toISOString(),
      ...(razorpay ? { razorpay } : {}),
    };
  }

  // ── Issue ────────────────────────────────────────────────────────────────

  /**
   * Issue the pass. Demo mode accepts a bare request or a prepared intent; test
   * mode requires the prepared intent *and* a Razorpay payment whose signature
   * verifies against the order that intent recorded, so a payment for any
   * other (cheaper) order cannot issue this pass.
   */
  async issue(request: JourneyPassRequest): Promise<JourneyPass> {
    const mode = this.#deps.mode;
    if (mode === "off") throw new ConflictError("Journey booking is not open yet.");

    const invalid = () =>
      new ValidationError("This checkout session is not valid. Please start again.");
    let intent: PassIntentPayload | null = null;
    if (request.intent) {
      intent = this.#decodeIntent(request.intent);
      if (
        intent.mode !== mode ||
        intent.journeyId !== request.journeyId ||
        intent.partySize !== request.partySize
      ) {
        throw invalid();
      }
    } else if (mode === "razorpay_test") {
      throw invalid();
    }

    let paymentId: string | null = null;
    if (mode === "razorpay_test") {
      const payment = request.razorpay;
      if (!payment) throw new ValidationError("Payment details are missing.");
      const verified =
        payment.orderId === intent!.orderId &&
        this.#deps.gateway!.verifyCheckoutSignature({
          orderId: payment.orderId,
          paymentId: payment.paymentId,
          signature: payment.signature,
        });
      if (!verified) {
        throw new ValidationError(
          "We could not verify this payment. If you were charged, contact support.",
        );
      }
      paymentId = payment.paymentId;
    }

    const { journey, listings, perPersonMinor } = await this.#price(
      request.journeyId,
      request.partySize,
    );
    const { partySize } = request;

    const reference = formatPassReference(this.#random(4));
    const secretKeyword = generateSecretKeyword(reference);
    const holderName = normaliseHolderName(request.holderName);

    const acts = journey.chapters.map((chapter, index): JourneyPassAct => {
      const unitPriceMinor = listings[index]!.basePriceMinor!;
      return {
        role: chapter.role,
        label: chapter.label,
        slug: chapter.experienceSlug,
        title: listings[index]!.title,
        addressLine: chapter.addressLine,
        coordinates: chapter.coordinates,
        startMinute: chapter.startMinute,
        endMinute: chapter.endMinute,
        unitPriceMinor,
        totalMinor: unitPriceMinor * partySize,
        privilege: chapter.privilege,
        hostInstruction: hostInstruction(secretKeyword, chapter),
        status: JOURNEY_ACT_STATUS,
      };
    });

    const fields = new URLSearchParams({
      ref: reference,
      journey: journey.id,
      party: String(partySize),
      simulated: "1",
    }).toString();
    const payload = `${PAYLOAD_PREFIX}${fields}&sig=${this.#sign(fields)}`;
    const svg = renderSVG(payload, { ecc: "M", border: 2 });

    // What was charged is what the verified order was for, not a later re-read.
    const payment: JourneyPass["payment"] = paymentId
      ? {
          status: "PAID_TEST",
          provider: "razorpay",
          perPersonMinor,
          amountMinor: intent!.amountMinor,
          chargedMinor: intent!.amountMinor,
          currency: intent!.currency,
          paymentId,
        }
      : {
          status: "SIMULATED",
          provider: "none",
          perPersonMinor,
          amountMinor: perPersonMinor * partySize,
          chargedMinor: 0,
          currency: journey.currency,
          paymentId: null,
        };

    return {
      simulated: true,
      mode,
      reference,
      secretKeyword,
      holderName,
      partySize,
      journey: {
        id: journey.id,
        title: journey.title,
        mood: journey.mood,
        tagline: journey.tagline,
      },
      acts,
      payment,
      qr: {
        payload,
        dataUri: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
      },
      timeSavedMinutes: journey.timeSavedMinutes,
      issuedAt: this.#now().toISOString(),
      notice: paymentId ? JOURNEY_PASS_TEST_NOTICE : JOURNEY_PASS_NOTICE,
    };
  }

  // ── Pricing ──────────────────────────────────────────────────────────────

  /** Re-read every act's live listing and price the party. Never a client figure. */
  async #price(journeyId: string, partySize: number): Promise<PricedJourney> {
    if (this.#deps.mode === "off") throw new ConflictError("Journey booking is not open yet.");

    const journey = this.#deps.findJourney(journeyId);
    if (!journey) throw new NotFoundError("That journey does not exist.");

    if (!Number.isInteger(partySize) || partySize < 1 || partySize > JOURNEY_PARTY_MAX) {
      throw new ValidationError(
        `A journey pass covers between 1 and ${JOURNEY_PARTY_MAX} guests.`,
        {
          partySize,
          max: JOURNEY_PARTY_MAX,
        },
      );
    }

    const listings = await Promise.all(
      journey.chapters.map(async (chapter) => {
        try {
          return await this.#deps.findListing(chapter.experienceSlug);
        } catch (error) {
          if (error instanceof NotFoundError) {
            throw new ConflictError(
              `${chapter.label} is not available right now, so this journey cannot be booked.`,
              { act: chapter.role },
              { cause: error },
            );
          }
          throw error;
        }
      }),
    );

    listings.forEach((listing, index) => {
      const chapter = journey.chapters[index]!;
      if (
        listing.basePriceMinor === null ||
        listing.pricingUnit !== "PER_PERSON" ||
        listing.currency !== journey.currency
      ) {
        throw new ConflictError(
          `${chapter.label} is not priced for a combined journey right now.`,
          { act: chapter.role },
        );
      }
      if (
        partySize < listing.minGuests ||
        (listing.maxGuests !== null && partySize > listing.maxGuests)
      ) {
        const range =
          listing.maxGuests === null
            ? `at least ${listing.minGuests}`
            : `${listing.minGuests}–${listing.maxGuests}`;
        throw new ValidationError(`${chapter.label} hosts parties of ${range}.`, {
          act: chapter.role,
          partySize,
        });
      }
    });

    const perPersonMinor = listings.reduce((sum, listing) => sum + listing.basePriceMinor!, 0);
    return { journey, listings, perPersonMinor };
  }
}
