import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { RazorpayAdapter } from "@/adapters/payments/razorpay";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  JOURNEY_PASS_NOTICE,
  JOURNEY_PASS_TEST_NOTICE,
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
import type { PaymentGatewayPort } from "@/ports/payments";

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
      paymentId: null,
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

describe("journey pass checkout — demo and Razorpay test mode", () => {
  const journey = findJourney("starlit-romance")!;
  const KEY_SECRET = "rzp_test_secret";
  const listing = (slug: string): JourneyListing => {
    const chapter = journey.chapters.find((candidate) => candidate.experienceSlug === slug)!;
    return {
      slug,
      title: chapter.experienceTitle,
      basePriceMinor: chapter.priceMinor,
      currency: "INR",
      pricingUnit: "PER_PERSON",
      minGuests: 1,
      maxGuests: 8,
    };
  };
  const total = journey.totalPriceMinor;

  /** Real HMAC-SHA256 verification from the adapter; a fake order endpoint. */
  const gateway = (): PaymentGatewayPort => {
    const adapter = new RazorpayAdapter({ keyId: "rzp_test_k", keySecret: KEY_SECRET });
    return {
      createOrder: vi
        .fn()
        .mockImplementation(({ amount }) =>
          Promise.resolve({ providerOrderId: "order_jrny", amount, status: "created" }),
        ),
      verifyCheckoutSignature: (input) => adapter.verifyCheckoutSignature(input),
      verifyWebhook: vi.fn(),
      fetchPayment: vi.fn(),
    };
  };
  const sign = (orderId: string, paymentId: string) =>
    createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  let now = new Date("2026-11-12T12:00:00Z");
  const deps = (overrides: Partial<JourneyPassDependencies> = {}): JourneyPassDependencies => ({
    mode: "demo",
    findJourney,
    findListing: async (slug) => listing(slug),
    signingKey: "k".repeat(64),
    now: () => now,
    random: (size) => new Uint8Array(size).fill(3),
    ...overrides,
  });
  const testDeps = (overrides: Partial<JourneyPassDependencies> = {}) =>
    deps({ mode: "razorpay_test", gateway: gateway(), razorpayKeyId: "rzp_test_k", ...overrides });

  it("prepares a demo intent with no provider, and issues from it", async () => {
    const service = new JourneyPassService(deps());
    const intent = await service.prepare({ journeyId: journey.id, partySize: 2 });
    expect(intent).toMatchObject({ mode: "demo", partySize: 2, amountMinor: total * 2 });
    expect(intent.razorpay).toBeUndefined();

    const pass = await service.issue({
      journeyId: journey.id,
      partySize: 2,
      intent: intent.intent,
    });
    expect(pass.payment.status).toBe("SIMULATED");
    expect(pass.payment.chargedMinor).toBe(0);
  });

  it("refuses an intent replayed for a different party or journey, or tampered", async () => {
    const service = new JourneyPassService(deps());
    const { intent } = await service.prepare({ journeyId: journey.id, partySize: 2 });
    await expect(service.issue({ journeyId: journey.id, partySize: 3, intent })).rejects.toThrow(
      ValidationError,
    );
    const [body, sig] = intent.split(".");
    await expect(
      service.issue({ journeyId: journey.id, partySize: 2, intent: `${body}x.${sig}` }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses an expired intent", async () => {
    now = new Date("2026-11-12T12:00:00Z");
    const service = new JourneyPassService(deps());
    const { intent } = await service.prepare({ journeyId: journey.id, partySize: 2 });
    now = new Date("2026-11-12T12:31:00Z");
    await expect(service.issue({ journeyId: journey.id, partySize: 2, intent })).rejects.toThrow(
      /expired/,
    );
    now = new Date("2026-11-12T12:00:00Z");
  });

  it("creates a Razorpay order for the server's total in test mode", async () => {
    const d = testDeps();
    const service = new JourneyPassService(d);
    const intent = await service.prepare({ journeyId: journey.id, partySize: 2 });
    expect(intent.razorpay).toEqual({
      keyId: "rzp_test_k",
      orderId: "order_jrny",
      amountMinor: total * 2,
      currency: "INR",
    });
    expect(d.gateway!.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: { amountMinor: total * 2, currency: "INR" } }),
    );
  });

  it("issues a test-paid pass only after the HMAC-SHA256 signature verifies", async () => {
    const service = new JourneyPassService(testDeps());
    const { intent } = await service.prepare({ journeyId: journey.id, partySize: 2 });

    const pass = await service.issue({
      journeyId: journey.id,
      partySize: 2,
      intent,
      razorpay: {
        orderId: "order_jrny",
        paymentId: "pay_1",
        signature: sign("order_jrny", "pay_1"),
      },
    });
    expect(pass.payment).toMatchObject({
      status: "PAID_TEST",
      provider: "razorpay",
      chargedMinor: total * 2,
      paymentId: "pay_1",
    });
    expect(pass.notice).toBe(JOURNEY_PASS_TEST_NOTICE);
  });

  it("refuses a missing intent, missing payment, forged signature or another order", async () => {
    const service = new JourneyPassService(testDeps());
    const { intent } = await service.prepare({ journeyId: journey.id, partySize: 2 });
    const base = { journeyId: journey.id, partySize: 2 };

    await expect(service.issue(base)).rejects.toThrow(ValidationError);
    await expect(service.issue({ ...base, intent })).rejects.toThrow(/Payment details/);
    await expect(
      service.issue({
        ...base,
        intent,
        razorpay: { orderId: "order_jrny", paymentId: "pay_1", signature: "0".repeat(64) },
      }),
    ).rejects.toThrow(/could not verify/);
    await expect(
      service.issue({
        ...base,
        intent,
        razorpay: {
          orderId: "order_cheap",
          paymentId: "pay_1",
          signature: sign("order_cheap", "pay_1"),
        },
      }),
    ).rejects.toThrow(/could not verify/);
  });

  it("refuses a demo intent in test mode", async () => {
    const { intent } = await new JourneyPassService(deps()).prepare({
      journeyId: journey.id,
      partySize: 2,
    });
    const service = new JourneyPassService(testDeps());
    await expect(
      service.issue({
        journeyId: journey.id,
        partySize: 2,
        intent,
        razorpay: {
          orderId: "order_jrny",
          paymentId: "pay_1",
          signature: sign("order_jrny", "pay_1"),
        },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("needs a gateway and key id in test mode", () => {
    expect(() => new JourneyPassService(deps({ mode: "razorpay_test" }))).toThrow(ValidationError);
  });
});
