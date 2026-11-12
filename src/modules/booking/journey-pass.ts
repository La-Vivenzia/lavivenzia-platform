import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { renderSVG } from "uqr";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { PricingUnit } from "@/modules/experiences/readiness";
import type { Journey } from "@/modules/journeys/data";

import type { CheckoutMode } from "./contract";
import {
  JOURNEY_ACT_STATUS,
  JOURNEY_HOLDER_MAX,
  JOURNEY_PARTY_MAX,
  type JourneyPass,
  type JourneyPassAct,
} from "./journey-pass-contract";
import { generateSecretKeyword } from "./keywords";

/**
 * Unified journey checkout — one transaction for every act, one VIP pass.
 *
 * **Simulated, like the trip bundle (ADR-0016).** No payment provider is
 * called, no row is written and nothing is reserved with any venue; the pass
 * says so in `simulated`, `payment.chargedMinor` and `notice`. A closed
 * checkout (`off`, the production default) refuses outright.
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
  /** Secret key for signing QR payloads. Never leaves the server. */
  readonly signingKey: string;
  readonly now?: () => Date;
  readonly random?: (size: number) => Uint8Array;
}

export interface JourneyPassRequest {
  readonly journeyId: string;
  readonly partySize: number;
  readonly holderName?: string | undefined;
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
  readonly #now: () => Date;
  readonly #random: (size: number) => Uint8Array;

  constructor(deps: JourneyPassDependencies) {
    if (!deps.signingKey) throw new ValidationError("Journey pass signing key is not configured.");
    this.#deps = deps;
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

  async issue(request: JourneyPassRequest): Promise<JourneyPass> {
    const mode = this.#deps.mode;
    if (mode === "off") throw new ConflictError("Journey booking is not open yet.");

    const journey = this.#deps.findJourney(request.journeyId);
    if (!journey) throw new NotFoundError("That journey does not exist.");

    const { partySize } = request;
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

    const perPersonMinor = acts.reduce((sum, act) => sum + act.unitPriceMinor, 0);
    const fields = new URLSearchParams({
      ref: reference,
      journey: journey.id,
      party: String(partySize),
      simulated: "1",
    }).toString();
    const payload = `${PAYLOAD_PREFIX}${fields}&sig=${this.#sign(fields)}`;
    const svg = renderSVG(payload, { ecc: "M", border: 2 });

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
      payment: {
        status: "SIMULATED",
        provider: "none",
        perPersonMinor,
        amountMinor: perPersonMinor * partySize,
        chargedMinor: 0,
        currency: journey.currency,
      },
      qr: {
        payload,
        dataUri: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
      },
      timeSavedMinutes: journey.timeSavedMinutes,
      issuedAt: this.#now().toISOString(),
      notice: JOURNEY_PASS_NOTICE,
    };
  }
}
