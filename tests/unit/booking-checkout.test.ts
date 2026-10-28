import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RazorpayAdapter } from "@/adapters/payments/razorpay";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  ValidationError,
} from "@/lib/errors";
import {
  CheckoutService,
  formatReference,
  resolveCheckoutMode,
  type CheckoutDependencies,
  type CheckoutExperience,
} from "@/modules/booking/checkout";
import type { PaymentGatewayPort } from "@/ports/payments";

/**
 * Checkout (FR-09, FR-10, ADR-0016).
 *
 * What is pinned: the server re-prices and re-validates everything; a forged,
 * tampered or expired intent confirms nothing; a payment signature for any
 * other order confirms nothing; live keys are refused; and the venue appears
 * only in a verified confirmation.
 */

const NOW = new Date("2026-11-01T00:00:00Z");
const SLOT_ID = "6f1c1d1e-7f2a-4b4e-9a51-0b6b7a2a1c01";

const EXPERIENCE: CheckoutExperience = {
  id: "exp-1",
  slug: "old-pune-heritage-walk",
  title: "Old Pune heritage walk",
  hostName: "Asha",
  basePriceMinor: 150_000,
  currency: "INR",
  pricingUnit: "PER_PERSON",
  minGuests: 2,
  maxGuests: 6,
  addressLine: "Shaniwar Wada main gate",
  city: "Pune",
  region: "Maharashtra",
  postalCode: "411030",
  country: "India",
  latitude: 18.5195,
  longitude: 73.8553,
};

const SLOT = {
  id: SLOT_ID,
  startsAt: new Date("2026-11-02T03:30:00Z"),
  endsAt: new Date("2026-11-02T05:30:00Z"),
  seatsRemaining: 4,
};

const KEY_SECRET = "test_key_secret";

function fakeGateway(over: Partial<PaymentGatewayPort> = {}): PaymentGatewayPort {
  return {
    createOrder: vi
      .fn()
      .mockImplementation(({ amount }) =>
        Promise.resolve({ providerOrderId: "order_abc", amount, status: "created" }),
      ),
    verifyCheckoutSignature: vi.fn(
      ({ orderId, paymentId, signature }) =>
        signature ===
        createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex"),
    ),
    verifyWebhook: vi.fn(),
    fetchPayment: vi.fn(),
    ...over,
  };
}

function makeService(over: Partial<CheckoutDependencies> = {}) {
  let now = NOW;
  const deps: CheckoutDependencies = {
    mode: "demo",
    findExperience: vi.fn().mockResolvedValue(EXPERIENCE),
    listBookableSlots: vi.fn().mockResolvedValue([SLOT]),
    signingKey: "signing-key",
    now: () => now,
    random: () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
    ...over,
  };
  return {
    service: new CheckoutService(deps),
    deps,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

const sign = (orderId: string, paymentId: string) =>
  createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

describe("resolveCheckoutMode", () => {
  const keys = { razorpayKeyId: undefined, razorpayKeySecret: undefined };

  it("defaults to demo outside production and off in production", () => {
    expect(resolveCheckoutMode({ configured: undefined, isProduction: false, ...keys })).toBe(
      "demo",
    );
    expect(resolveCheckoutMode({ configured: undefined, isProduction: true, ...keys })).toBe("off");
  });

  it("honours an explicit choice", () => {
    expect(resolveCheckoutMode({ configured: "off", isProduction: false, ...keys })).toBe("off");
  });

  it("requires a full key pair for test mode", () => {
    expect(() =>
      resolveCheckoutMode({
        configured: "razorpay_test",
        isProduction: false,
        razorpayKeyId: "rzp_test_x",
        razorpayKeySecret: undefined,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses live keys", () => {
    expect(() =>
      resolveCheckoutMode({
        configured: "razorpay_test",
        isProduction: true,
        razorpayKeyId: "rzp_live_x",
        razorpayKeySecret: "secret",
      }),
    ).toThrow(/test keys only/);
  });

  it("accepts test keys", () => {
    expect(
      resolveCheckoutMode({
        configured: "razorpay_test",
        isProduction: false,
        razorpayKeyId: "rzp_test_x",
        razorpayKeySecret: "secret",
      }),
    ).toBe("razorpay_test");
  });
});

describe("formatReference", () => {
  it("prefixes by mode and avoids ambiguous characters", () => {
    const ref = formatReference(new Uint8Array([255, 254, 253, 252, 251, 250, 249, 248]), "demo");
    expect(ref).toMatch(/^DEMO-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(formatReference(new Uint8Array(8), "razorpay_test")).toBe("TEST-0000-0000");
  });
});

describe("CheckoutService.prepare", () => {
  it("prices on the server and signs a short-lived intent", async () => {
    const { service } = makeService();
    const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 3 });

    expect(intent.mode).toBe("demo");
    expect(intent.reference).toMatch(/^DEMO-/);
    expect(intent.quote.totalMinor).toBe(450_000);
    expect(intent.slot.id).toBe(SLOT_ID);
    expect(new Date(intent.expiresAt).getTime()).toBe(NOW.getTime() + 30 * 60_000);
    expect(intent.razorpay).toBeUndefined();
    // The intent carries no venue; that is only released on confirmation.
    expect(intent.intent).not.toContain("Shaniwar");
    expect(JSON.stringify(intent)).not.toContain("Shaniwar");
  });

  it("is closed when checkout is off", async () => {
    const { service } = makeService({ mode: "off" });
    await expect(service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 })).rejects.toThrow(
      ConflictError,
    );
  });

  it("refuses a slot that is not bookable", async () => {
    const { service } = makeService({ listBookableSlots: vi.fn().mockResolvedValue([]) });
    await expect(service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 })).rejects.toThrow(
      ConflictError,
    );
  });

  it.each([
    [1, /at least 2/],
    [7, /at most 6/],
    [5, /Only 4 seats/],
  ])("refuses %s guests", async (guests, message) => {
    const { service } = makeService();
    await expect(service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests })).rejects.toThrow(
      message,
    );
  });

  it("refuses a listing priced on request", async () => {
    const { service } = makeService({
      findExperience: vi.fn().mockResolvedValue({ ...EXPERIENCE, basePriceMinor: null }),
    });
    await expect(service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 })).rejects.toThrow(
      ValidationError,
    );
  });

  it("propagates not-found for an unpublished listing", async () => {
    const { service } = makeService({
      findExperience: vi.fn().mockRejectedValue(new NotFoundError("Experience not found.")),
    });
    await expect(service.prepare("draft", { slotId: SLOT_ID, guests: 2 })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("creates the provider order for the server's total in test mode", async () => {
    const gateway = fakeGateway();
    const { service } = makeService({
      mode: "razorpay_test",
      gateway,
      razorpayKeyId: "rzp_test_x",
    });
    const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });

    expect(gateway.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: { amountMinor: 300_000, currency: "INR" } }),
    );
    expect(intent.reference).toMatch(/^TEST-/);
    expect(intent.razorpay).toEqual({
      keyId: "rzp_test_x",
      orderId: "order_abc",
      amountMinor: 300_000,
      currency: "INR",
    });
  });

  it("refuses to construct test mode without a gateway", () => {
    expect(() => makeService({ mode: "razorpay_test" })).toThrow(ValidationError);
  });
});

describe("CheckoutService.confirm", () => {
  it("confirms a demo intent and reveals the venue", async () => {
    const { service } = makeService();
    const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
    const confirmation = await service.confirm(EXPERIENCE.slug, { intent: intent.intent });

    expect(confirmation.reference).toBe(intent.reference);
    expect(confirmation.guests).toBe(2);
    expect(confirmation.quote.totalMinor).toBe(300_000);
    expect(confirmation.venue.lines).toEqual([
      "Shaniwar Wada main gate",
      "Pune, Maharashtra",
      "411030",
      "India",
    ]);
    expect(confirmation.venue.mapUrl).toContain("18.5195,73.8553");
    expect(confirmation.paymentId).toBeNull();
  });

  it("returns the same reference when confirmation is retried", async () => {
    const { service } = makeService();
    const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
    const first = await service.confirm(EXPERIENCE.slug, { intent: intent.intent });
    const second = await service.confirm(EXPERIENCE.slug, { intent: intent.intent });
    expect(second.reference).toBe(first.reference);
  });

  it("refuses a tampered intent — the total cannot be edited", async () => {
    const { service } = makeService();
    const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
    const [encoded, signature] = intent.intent.split(".");
    const payload = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8"));
    const forged = Buffer.from(
      JSON.stringify({ ...payload, quote: { ...payload.quote, totalMinor: 1 } }),
    ).toString("base64url");

    await expect(
      service.confirm(EXPERIENCE.slug, { intent: `${forged}.${signature}` }),
    ).rejects.toThrow(ValidationError);
  });

  it.each(["", "garbage", "a.b.c", "a.b"])("refuses a malformed intent %j", async (token) => {
    const { service } = makeService();
    await expect(service.confirm(EXPERIENCE.slug, { intent: token })).rejects.toThrow(
      ValidationError,
    );
  });

  it("refuses an intent signed with a different key", async () => {
    const other = makeService({ signingKey: "another-key" }).service;
    const intent = await other.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
    await expect(
      makeService().service.confirm(EXPERIENCE.slug, { intent: intent.intent }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses an intent for a different experience", async () => {
    const { service } = makeService();
    const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
    await expect(service.confirm("someone-else", { intent: intent.intent })).rejects.toThrow(
      ValidationError,
    );
  });

  it("refuses an expired intent", async () => {
    const { service, advance } = makeService();
    const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
    advance(30 * 60_000 + 1);
    await expect(service.confirm(EXPERIENCE.slug, { intent: intent.intent })).rejects.toThrow(
      /expired/,
    );
  });

  it("reports a listing withdrawn since checkout as a conflict", async () => {
    const findExperience = vi
      .fn()
      .mockResolvedValueOnce(EXPERIENCE)
      .mockRejectedValueOnce(new NotFoundError("gone"));
    const { service } = makeService({ findExperience });
    const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
    await expect(service.confirm(EXPERIENCE.slug, { intent: intent.intent })).rejects.toThrow(
      ConflictError,
    );
  });

  describe("in Razorpay test mode", () => {
    const testService = () =>
      makeService({ mode: "razorpay_test", gateway: fakeGateway(), razorpayKeyId: "rzp_test_x" })
        .service;

    it("confirms only with a valid payment signature for this order", async () => {
      const service = testService();
      const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
      const confirmation = await service.confirm(EXPERIENCE.slug, {
        intent: intent.intent,
        razorpay: {
          orderId: "order_abc",
          paymentId: "pay_1",
          signature: sign("order_abc", "pay_1"),
        },
      });
      expect(confirmation.paymentId).toBe("pay_1");
      expect(confirmation.mode).toBe("razorpay_test");
    });

    it("never trusts a client success without payment details", async () => {
      const service = testService();
      const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
      await expect(service.confirm(EXPERIENCE.slug, { intent: intent.intent })).rejects.toThrow(
        ValidationError,
      );
    });

    it("refuses a bad signature", async () => {
      const service = testService();
      const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
      await expect(
        service.confirm(EXPERIENCE.slug, {
          intent: intent.intent,
          razorpay: { orderId: "order_abc", paymentId: "pay_1", signature: "0".repeat(64) },
        }),
      ).rejects.toThrow(/could not verify/);
    });

    it("refuses a genuine payment for a different order", async () => {
      const service = testService();
      const intent = await service.prepare(EXPERIENCE.slug, { slotId: SLOT_ID, guests: 2 });
      await expect(
        service.confirm(EXPERIENCE.slug, {
          intent: intent.intent,
          razorpay: {
            orderId: "order_cheaper",
            paymentId: "pay_1",
            signature: sign("order_cheaper", "pay_1"),
          },
        }),
      ).rejects.toThrow(/could not verify/);
    });

    it("refuses a demo intent once the deployment is in test mode", async () => {
      const demoIntent = await makeService().service.prepare(EXPERIENCE.slug, {
        slotId: SLOT_ID,
        guests: 2,
      });
      await expect(
        testService().confirm(EXPERIENCE.slug, { intent: demoIntent.intent }),
      ).rejects.toThrow(ValidationError);
    });
  });
});

describe("RazorpayAdapter order creation", () => {
  const input = {
    amount: { amountMinor: 300_000, currency: "INR" },
    referenceId: "TEST-ABCD-1234",
  };
  const adapterWith = (fetchImpl: typeof fetch) =>
    new RazorpayAdapter({ keyId: "rzp_test_x", keySecret: KEY_SECRET, fetch: fetchImpl });
  const respond = (status: number, body: unknown) =>
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("posts the amount with basic auth and returns the order id", async () => {
    const fetchImpl = respond(200, {
      id: "order_1",
      amount: 300_000,
      currency: "INR",
      status: "created",
    });
    const order = await adapterWith(fetchImpl).createOrder(input);

    expect(order).toEqual({ providerOrderId: "order_1", amount: input.amount, status: "created" });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.headers.authorization).toBe(
      `Basic ${Buffer.from(`rzp_test_x:${KEY_SECRET}`).toString("base64")}`,
    );
    expect(JSON.parse(init.body)).toMatchObject({
      amount: 300_000,
      currency: "INR",
      receipt: "TEST-ABCD-1234",
    });
  });

  it("refuses an order whose amount differs from the request", async () => {
    const fetchImpl = respond(200, { id: "order_1", amount: 1, currency: "INR" });
    await expect(adapterWith(fetchImpl).createOrder(input)).rejects.toThrow(
      ProviderUnavailableError,
    );
  });

  it("treats a rejected credential as our misconfiguration", async () => {
    await expect(adapterWith(respond(401, {})).createOrder(input)).rejects.toThrow(InternalError);
  });

  it("treats a provider outage as retryable", async () => {
    await expect(adapterWith(respond(503, {})).createOrder(input)).rejects.toThrow(
      ProviderUnavailableError,
    );
  });

  it("maps a timeout", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const fetchImpl = vi.fn().mockRejectedValue(timeout) as unknown as typeof fetch;
    await expect(adapterWith(fetchImpl).createOrder(input)).rejects.toThrow(ProviderTimeoutError);
  });

  it("maps an unreadable response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    await expect(adapterWith(fetchImpl).createOrder(input)).rejects.toThrow(
      ProviderUnavailableError,
    );
  });

  it("refuses a non-integer amount before calling out", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      adapterWith(fetchImpl).createOrder({
        ...input,
        amount: { amountMinor: 10.5, currency: "INR" },
      }),
    ).rejects.toThrow(ValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verifies the checkout signature over order_id|payment_id", () => {
    const adapter = adapterWith(vi.fn() as unknown as typeof fetch);
    expect(
      adapter.verifyCheckoutSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature: sign("order_1", "pay_1"),
      }),
    ).toBe(true);
    expect(
      adapter.verifyCheckoutSignature({
        orderId: "order_1",
        paymentId: "pay_2",
        signature: sign("order_1", "pay_1"),
      }),
    ).toBe(false);
    expect(
      adapter.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: "" }),
    ).toBe(false);
  });
});
