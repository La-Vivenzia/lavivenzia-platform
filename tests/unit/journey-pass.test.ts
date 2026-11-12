import { describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  JOURNEY_PASS_NOTICE,
  JourneyPassService,
  formatPassReference,
  normaliseHolderName,
  type JourneyListing,
  type JourneyPassDependencies,
} from "@/modules/booking/journey-pass";
import { JOURNEY_ACT_STATUS } from "@/modules/booking/journey-pass-contract";
import {
  SECRET_KEYWORD_ADJECTIVES,
  SECRET_KEYWORD_NOUNS,
  generateSecretKeyword,
} from "@/modules/booking/keywords";
import { findJourney } from "@/modules/journeys/data";

describe("secret host keyword", () => {
  it("is two words from the lexicon, stable for one booking id", () => {
    const keyword = generateSecretKeyword("LV-7K2Q");
    const [adjective, noun, extra] = keyword.split(" ");
    expect(extra).toBeUndefined();
    expect(SECRET_KEYWORD_ADJECTIVES).toContain(adjective);
    expect(SECRET_KEYWORD_NOUNS).toContain(noun);
    expect(generateSecretKeyword("LV-7K2Q")).toBe(keyword);
    expect(generateSecretKeyword(" lv-7k2q ")).toBe(keyword);
  });

  it("spreads across the lexicon", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) seen.add(generateSecretKeyword(`LV-${i}`));
    expect(seen.size).toBeGreaterThan(60);
  });

  it("refuses an empty booking id", () => {
    expect(() => generateSecretKeyword("  ")).toThrow();
  });
});

describe("pass reference and holder", () => {
  it("formats LV- and four Crockford characters", () => {
    expect(formatPassReference(new Uint8Array([0, 1, 31, 32]))).toBe("LV-01Z0");
    expect(formatPassReference(new Uint8Array([200, 9, 18, 27]))).toMatch(
      /^LV-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
  });

  it("normalises the name printed on the pass", () => {
    expect(normaliseHolderName("  Aanya   Kapoor ")).toBe("Aanya Kapoor");
    expect(normaliseHolderName("")).toBe("Guest of La Vivenzia");
    expect(normaliseHolderName(undefined)).toBe("Guest of La Vivenzia");
    expect(normaliseHolderName("a\u0000b")).toBe("ab");
    expect(normaliseHolderName("x".repeat(200))).toHaveLength(60);
  });
});

describe("journey pass service", () => {
  const journey = findJourney("starlit-romance")!;

  /** Live listings as PostgreSQL would return them, repriced to prove the pass reads them. */
  const live = new Map<string, JourneyListing>(
    journey.chapters.map((chapter) => [
      chapter.experienceSlug,
      {
        slug: chapter.experienceSlug,
        title: chapter.experienceTitle,
        basePriceMinor: chapter.priceMinor + 10_000,
        currency: "INR",
        pricingUnit: "PER_PERSON",
        minGuests: 1,
        maxGuests: 8,
      },
    ]),
  );

  const deps = (overrides: Partial<JourneyPassDependencies> = {}): JourneyPassDependencies => ({
    mode: "demo",
    findJourney,
    findListing: async (slug) => {
      const listing = live.get(slug);
      if (!listing) throw new NotFoundError("Not found");
      return listing;
    },
    signingKey: "k".repeat(64),
    now: () => new Date("2026-11-12T12:00:00Z"),
    random: (size) => new Uint8Array(size).fill(7),
    ...overrides,
  });

  it("issues one combined, simulated pass priced from the live listings", async () => {
    const service = new JourneyPassService(deps());
    const pass = await service.issue({ journeyId: journey.id, partySize: 2, holderName: "Aanya" });

    expect(pass.simulated).toBe(true);
    expect(pass.reference).toBe("LV-7777");
    expect(pass.secretKeyword).toBe(generateSecretKeyword("LV-7777"));
    expect(pass.holderName).toBe("Aanya");
    expect(pass.acts.map((act) => act.slug)).toEqual(
      journey.chapters.map((chapter) => chapter.experienceSlug),
    );
    const perPerson = journey.totalPriceMinor + 20_000;
    expect(pass.payment).toEqual({
      status: "SIMULATED",
      provider: "none",
      perPersonMinor: perPerson,
      amountMinor: perPerson * 2,
      chargedMinor: 0,
      currency: "INR",
    });
    for (const act of pass.acts) {
      expect(act.status).toBe(JOURNEY_ACT_STATUS);
      expect(act.totalMinor).toBe(act.unitPriceMinor * 2);
      expect(act.hostInstruction).toContain(pass.secretKeyword);
      expect(act.hostInstruction).toContain("requested");
    }
    expect(pass.qr.dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(pass.notice).toBe(JOURNEY_PASS_NOTICE);
    expect(pass.issuedAt).toBe("2026-11-12T12:00:00.000Z");
  });

  it("signs the QR payload and rejects a tampered one", async () => {
    const service = new JourneyPassService(deps());
    const { qr } = await service.issue({ journeyId: journey.id, partySize: 2 });
    expect(service.verifyPassPayload(qr.payload)).toBe(true);
    expect(service.verifyPassPayload(qr.payload.replace("party=2", "party=9"))).toBe(false);
    expect(service.verifyPassPayload("lavivenzia:journey-pass:v1?ref=LV-0000")).toBe(false);
    const other = new JourneyPassService(deps({ signingKey: "z".repeat(64) }));
    expect(other.verifyPassPayload(qr.payload)).toBe(false);
  });

  it("is closed when checkout is off", async () => {
    const service = new JourneyPassService(deps({ mode: "off" }));
    await expect(service.issue({ journeyId: journey.id, partySize: 2 })).rejects.toThrow(
      ConflictError,
    );
  });

  it("refuses an unknown journey and an out-of-range party", async () => {
    const service = new JourneyPassService(deps());
    await expect(service.issue({ journeyId: "nope", partySize: 2 })).rejects.toThrow(NotFoundError);
    await expect(service.issue({ journeyId: journey.id, partySize: 0 })).rejects.toThrow(
      ValidationError,
    );
    await expect(service.issue({ journeyId: journey.id, partySize: 13 })).rejects.toThrow(
      ValidationError,
    );
  });

  it("refuses when an act is no longer published", async () => {
    const service = new JourneyPassService(
      deps({
        findListing: async (slug) => {
          if (slug === journey.chapters[1]!.experienceSlug) throw new NotFoundError("gone");
          return live.get(slug)!;
        },
      }),
    );
    await expect(service.issue({ journeyId: journey.id, partySize: 2 })).rejects.toThrow(
      /Centerpiece is not available/,
    );
  });

  it("refuses a party an act cannot host, and an act priced per group", async () => {
    const small = new JourneyPassService(
      deps({ findListing: async (slug) => ({ ...live.get(slug)!, maxGuests: 4 }) }),
    );
    await expect(small.issue({ journeyId: journey.id, partySize: 6 })).rejects.toThrow(
      /hosts parties of 1–4/,
    );
    const grouped = new JourneyPassService(
      deps({ findListing: async (slug) => ({ ...live.get(slug)!, pricingUnit: "PER_GROUP" }) }),
    );
    await expect(grouped.issue({ journeyId: journey.id, partySize: 2 })).rejects.toThrow(
      ConflictError,
    );
  });

  it("needs a signing key", () => {
    expect(() => new JourneyPassService(deps({ signingKey: "" }))).toThrow(ValidationError);
  });
});
