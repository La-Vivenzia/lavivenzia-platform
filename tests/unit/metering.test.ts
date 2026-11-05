import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import {
  API_RATES,
  PAISE_PER_USD,
  calculateApiCost,
  formatInrPaise,
} from "@/modules/metering/rates";
import {
  MeteringService,
  getMeteringService,
  periodStart,
  recordUsageSafely,
  type UsageRecorder,
} from "@/modules/metering/service";
import {
  API_OPERATIONS,
  OPERATION_PROVIDER,
  type ApiOperation,
  type RecordUsageInput,
} from "@/modules/metering/types";
import { GoogleMapsAdapter } from "@/adapters/maps/google";
import { ResendEmailAdapter, type ResendSendClient } from "@/adapters/email/resend";
import { AnthropicLlmAdapter, anthropicPriceTier } from "@/adapters/llm/anthropic";
import { ValidationError } from "@/lib/errors";

/**
 * FinOps metering.
 *
 * What is pinned here is the money and the isolation: every rate to the exact
 * paisa and micro-dollar, the ring buffer's bounds, the period windows (IST),
 * the ₹5,000 alert, and — above all — that nothing in metering can fail the
 * request it observes.
 */

// The route pulls in the env parser via the logger; the secret is switched per
// test through this mutable state.
const envState = vi.hoisted(() => ({
  production: false,
  secret: undefined as string | undefined,
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return {
      NODE_ENV: envState.production ? "production" : "test",
      LOG_LEVEL: "info",
      METERING_SECRET_KEY: envState.secret,
    };
  },
  get isProduction() {
    return envState.production;
  },
  isTest: true,
}));

const SILENT_LOGGER = (() =>
  ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as Logger) as () => Logger;

/** 2026-11-05 12:00 IST — a Thursday. */
const NOON_IST = new Date("2026-11-05T06:30:00.000Z");

function clock(start: Date) {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    set: (value: Date | string) => {
      current = new Date(value).getTime();
    },
  };
}

function event(overrides: Partial<RecordUsageInput> = {}): RecordUsageInput {
  return {
    provider: "GOOGLE_PLACES",
    operation: "places.autocomplete",
    units: 1,
    latencyMs: 120,
    status: "SUCCESS",
    ...overrides,
  };
}

describe("calculateApiCost", () => {
  const cases: [ApiOperation, number, number, number][] = [
    // operation, units, expected paise, expected micro-dollars
    ["places.autocomplete", 1, 24, 2_830], // 2830 × 86 / 10^4 = 24.338
    ["places.autocomplete", 1_000, 24_338, 2_830_000],
    ["places.searchText", 1, 275, 32_000], // 275.2
    ["places.details", 1, 146, 17_000], // 146.2
    ["places.photos", 1, 60, 7_000], // 60.2
    ["gemini.flash_input", 1_000_000, 645, 75_000],
    ["gemini.flash_output", 1_000_000, 2_580, 300_000],
    ["gemini.flash_total", 1_000_000, 2_580, 300_000],
    ["gemini.flash_input", 1_000, 1, 75], // 0.645 paise rounds half-up to 1
    ["anthropic.sonnet_input", 1_000_000, 25_800, 3_000_000],
    ["anthropic.sonnet_output", 1_000_000, 129_000, 15_000_000],
    ["anthropic.sonnet_input", 1, 0, 3],
    ["anthropic.sonnet_output", 1_000, 129, 15_000],
    ["anthropic.haiku_input", 1_000_000, 6_880, 800_000],
    ["anthropic.haiku_input", 1, 0, 1], // 0.8 µ$ rounds half-up to 1
    ["anthropic.haiku_input", 10, 0, 8],
    ["anthropic.haiku_output", 1_000_000, 34_400, 4_000_000],
    ["whatsapp.utility_conv", 1, 11, 1_279], // 11 × 10^6 / 8600 = 1279.07
    ["whatsapp.marketing_conv", 1, 78, 9_070], // 9069.77
    ["whatsapp.service_conv", 1, 29, 3_372], // 3372.09
    ["whatsapp.outbound_message", 3, 33, 3_837], // 3837.21
    ["email.transactional_send", 1, 2, 280], // 2.408
    ["email.transactional_send", 1_000, 2_408, 280_000],
    ["razorpay.payment_fee", 100_000, 2_360, 274_419], // ₹1,000 → ₹23.60
    ["razorpay.payment_fee", 1, 0, 3], // 0.0236 paise = 2.744 µ$
    ["razorpay.payment_fee", 0, 0, 0],
  ];

  it.each(cases)("%s × %i = %i paise, %i µ$", (operation, units, paise, microUsd) => {
    expect(calculateApiCost(OPERATION_PROVIDER[operation], operation, units)).toEqual({
      costMinorInr: paise,
      costMicroUsd: microUsd,
    });
  });

  it("prices every declared operation", () => {
    for (const operation of API_OPERATIONS) {
      expect(API_RATES[operation]).toBeDefined();
      const cost = calculateApiCost(OPERATION_PROVIDER[operation], operation, 1_000_000);
      expect(Number.isSafeInteger(cost.costMinorInr)).toBe(true);
      expect(Number.isSafeInteger(cost.costMicroUsd)).toBe(true);
    }
  });

  it("matches the spec's Razorpay formula for arbitrary amounts", () => {
    for (const amountPaise of [1, 50, 99, 4_237, 123_456, 9_999_999, 1_234_567_891]) {
      expect(calculateApiCost("RAZORPAY", "razorpay.payment_fee", amountPaise).costMinorInr).toBe(
        Math.round((amountPaise * 236) / 10_000),
      );
    }
  });

  it("does not double-round the INR conversion", () => {
    // 1,000 autocompletes: rounding each call's 24.338 paise first would give 24,000.
    expect(calculateApiCost("GOOGLE_PLACES", "places.autocomplete", 1_000).costMinorInr).toBe(
      24_338,
    );
    expect(PAISE_PER_USD).toBe(8_600);
  });

  it("stays exact beyond float-safe intermediate products", () => {
    // 10^12 tokens × 15,000,000 µ$ overflows 2^53 as a float product.
    expect(calculateApiCost("ANTHROPIC", "anthropic.sonnet_output", 1_000_000_000_000)).toEqual({
      costMicroUsd: 15_000_000_000_000,
      costMinorInr: 129_000_000_000,
    });
  });

  it("makes an in-session service conversation free", () => {
    expect(
      calculateApiCost("META_WHATSAPP", "whatsapp.service_conv", 1, { inSession: true }),
    ).toEqual({ costMinorInr: 0, costMicroUsd: 0 });
    // The flag means nothing to other operations.
    expect(
      calculateApiCost("META_WHATSAPP", "whatsapp.utility_conv", 1, { inSession: true })
        .costMinorInr,
    ).toBe(11);
  });

  it("rejects a provider/operation mismatch", () => {
    expect(() => calculateApiCost("RESEND", "places.autocomplete", 1)).toThrow(ValidationError);
  });

  it("rejects unknown operations and unusable units", () => {
    expect(() => calculateApiCost("RESEND", "email.bulk" as ApiOperation, 1)).toThrow(
      ValidationError,
    );
    for (const units of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => calculateApiCost("RESEND", "email.transactional_send", units)).toThrow(
        ValidationError,
      );
    }
  });

  it("formats paise as rupees", () => {
    expect(formatInrPaise(4_250)).toBe("₹42.50");
    expect(formatInrPaise(0)).toBe("₹0.00");
    expect(formatInrPaise(12_345_678)).toBe("₹1,23,456.78");
  });
});

describe("MeteringService storage", () => {
  it("records a priced, frozen event", () => {
    const service = new MeteringService({ now: () => NOON_IST, generateId: () => "evt-1" });
    const stored = service.record(event({ metadata: { query: "pune" } }));

    expect(stored).toEqual({
      id: "evt-1",
      provider: "GOOGLE_PLACES",
      operation: "places.autocomplete",
      units: 1,
      costMinorInr: 24,
      costMicroUsd: 2_830,
      latencyMs: 120,
      status: "SUCCESS",
      timestamp: NOON_IST.toISOString(),
      metadata: { query: "pune" },
    });
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored!.metadata)).toBe(true);
  });

  it("does not bill failed calls but keeps them", () => {
    const service = new MeteringService({ now: () => NOON_IST });
    const stored = service.record(event({ status: "ERROR" }));
    expect(stored).toMatchObject({ costMinorInr: 0, costMicroUsd: 0, status: "ERROR" });
    expect(service.size).toBe(1);
  });

  it("normalises latency", () => {
    const service = new MeteringService({ now: () => NOON_IST });
    expect(service.record(event({ latencyMs: 12.6 }))!.latencyMs).toBe(13);
    expect(service.record(event({ latencyMs: -5 }))!.latencyMs).toBe(0);
    expect(service.record(event({ latencyMs: Number.NaN }))!.latencyMs).toBe(0);
  });

  it("returns recent events newest first, bounded by the limit", () => {
    let n = 0;
    const service = new MeteringService({ now: () => NOON_IST, generateId: () => `e${++n}` });
    for (let i = 0; i < 5; i += 1) service.record(event());

    expect(service.getRecentEvents(3).map((e) => e.id)).toEqual(["e5", "e4", "e3"]);
    expect(service.getRecentEvents(100)).toHaveLength(5);
    expect(service.getRecentEvents(0)).toEqual([]);
    expect(service.getRecentEvents(-4)).toEqual([]);
  });

  it("defaults to 10,000 slots", () => {
    expect(new MeteringService().capacity).toBe(10_000);
  });

  it("overwrites the oldest events once full", () => {
    let n = 0;
    const service = new MeteringService({
      capacity: 3,
      now: () => NOON_IST,
      generateId: () => `e${++n}`,
    });
    for (let i = 0; i < 7; i += 1) service.record(event());

    expect(service.size).toBe(3);
    expect(service.getRecentEvents(10).map((e) => e.id)).toEqual(["e7", "e6", "e5"]);
    expect(service.getSummary("all_time").totalRequests).toBe(3);
  });

  it("trims at the full 10,000 capacity", () => {
    let n = 0;
    const service = new MeteringService({ now: () => NOON_IST, generateId: () => `e${++n}` });
    for (let i = 0; i < 10_250; i += 1) service.record(event());

    expect(service.size).toBe(10_000);
    expect(service.getRecentEvents(1)[0]!.id).toBe("e10250");
    expect(service.getRecentEvents(10_000).at(-1)!.id).toBe("e251");
    expect(service.getSummary("all_time").totalCostInrPaise).toBe(10_000 * 24);
  });

  it("clears", () => {
    const service = new MeteringService({ now: () => NOON_IST });
    service.record(event());
    service.clear();
    expect(service.size).toBe(0);
    expect(service.getRecentEvents()).toEqual([]);
    expect(service.getSummary("all_time").totalRequests).toBe(0);
    service.record(event());
    expect(service.size).toBe(1);
  });

  it("refuses a nonsensical capacity", () => {
    expect(() => new MeteringService({ capacity: 0 })).toThrow(RangeError);
    expect(() => new MeteringService({ capacity: 1.5 })).toThrow(RangeError);
  });

  it("exposes one process-wide instance", () => {
    expect(getMeteringService()).toBe(getMeteringService());
  });
});

describe("period windows (IST)", () => {
  it("starts the day at IST midnight", () => {
    expect(new Date(periodStart("today", NOON_IST)).toISOString()).toBe("2026-11-04T18:30:00.000Z");
    // 23:00 UTC on the 4th is already the 5th in India.
    expect(new Date(periodStart("today", new Date("2026-11-04T23:00:00Z"))).toISOString()).toBe(
      "2026-11-04T18:30:00.000Z",
    );
  });

  it("starts the week on Monday", () => {
    expect(new Date(periodStart("this_week", NOON_IST)).toISOString()).toBe(
      "2026-11-01T18:30:00.000Z",
    );
    // Sunday 8 Nov belongs to the same week; Monday 9 Nov starts a new one.
    const sunday = new Date("2026-11-08T12:00:00Z");
    const monday = new Date("2026-11-09T00:00:00Z");
    expect(periodStart("this_week", sunday)).toBe(periodStart("this_week", NOON_IST));
    expect(new Date(periodStart("this_week", monday)).toISOString()).toBe(
      "2026-11-08T18:30:00.000Z",
    );
  });

  it("starts the month on the 1st", () => {
    expect(new Date(periodStart("this_month", NOON_IST)).toISOString()).toBe(
      "2026-10-31T18:30:00.000Z",
    );
    expect(periodStart("all_time", NOON_IST)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("MeteringService summaries", () => {
  let time: ReturnType<typeof clock>;
  let service: MeteringService;

  beforeEach(() => {
    time = clock(NOON_IST);
    service = new MeteringService({ now: time.now });

    time.set("2026-10-20T06:30:00Z"); // last month
    service.record(event({ operation: "places.searchText" })); // 275
    time.set("2026-11-02T06:30:00Z"); // Monday this week
    service.record(event({ operation: "places.details" })); // 146
    time.set("2026-11-01T06:30:00Z"); // Sunday — this month, last week
    service.record(
      event({ provider: "META_WHATSAPP", operation: "whatsapp.marketing_conv", units: 10 }),
    ); // 780
    time.set("2026-11-05T05:00:00Z"); // today
    service.record(event()); // 24
    service.record(
      event({ provider: "RESEND", operation: "email.transactional_send", status: "ERROR" }),
    ); // 0
    service.record(
      event({ provider: "RAZORPAY", operation: "razorpay.payment_fee", units: 250_000 }),
    ); // 5900
    time.set(NOON_IST);
  });

  it("totals today", () => {
    const summary = service.getSummary("today");
    expect(summary).toMatchObject({
      period: "today",
      totalCostInrPaise: 24 + 5_900,
      totalCostInrFormatted: "₹59.24",
      totalCostMicroUsd: 2_830 + 686_047,
      totalRequests: 3,
      errorCount: 1,
    });
    expect(summary.providerBreakdown.RESEND).toEqual({
      requestCount: 1,
      costInrPaise: 0,
      costFormatted: "₹0.00",
    });
    expect(summary.providerBreakdown.RAZORPAY.costFormatted).toBe("₹59.00");
  });

  it("totals this week", () => {
    const summary = service.getSummary("this_week");
    expect(summary.totalRequests).toBe(4);
    expect(summary.totalCostInrPaise).toBe(146 + 24 + 5_900);
  });

  it("totals this month, and defaults to it", () => {
    const summary = service.getSummary();
    expect(summary.period).toBe("this_month");
    expect(summary.totalRequests).toBe(5);
    expect(summary.totalCostInrPaise).toBe(146 + 780 + 24 + 5_900);
  });

  it("totals all time", () => {
    const summary = service.getSummary("all_time");
    expect(summary.totalRequests).toBe(6);
    expect(summary.totalCostInrPaise).toBe(275 + 146 + 780 + 24 + 5_900);
  });

  it("breaks down by every provider, including idle ones", () => {
    const { providerBreakdown } = service.getSummary("this_month");
    expect(Object.keys(providerBreakdown).sort()).toEqual([
      "ANTHROPIC",
      "GOOGLE_GEMINI",
      "GOOGLE_PLACES",
      "META_WHATSAPP",
      "RAZORPAY",
      "RESEND",
    ]);
    expect(providerBreakdown.GOOGLE_PLACES).toEqual({
      requestCount: 2,
      costInrPaise: 170,
      costFormatted: "₹1.70",
    });
    expect(providerBreakdown.META_WHATSAPP.costInrPaise).toBe(780);
    expect(providerBreakdown.ANTHROPIC).toEqual({
      requestCount: 0,
      costInrPaise: 0,
      costFormatted: "₹0.00",
    });
  });

  it("measures the budget against this month whatever the period", () => {
    const today = service.getSummary("today").budgetAlert;
    const allTime = service.getSummary("all_time").budgetAlert;
    expect(today).toEqual(allTime);
    expect(today).toEqual({
      triggered: false,
      monthlyBudgetCapInr: 5_000,
      currentSpendInr: 68.5,
      percentageUsed: 1.37,
    });
  });
});

describe("budget alert", () => {
  /**
   * A service whose month so far is exactly `spendPaise` of Razorpay fees. The
   * smallest gross amount whose 2.36% fee rounds to `spendPaise` is the ceiling
   * of spend ÷ 2.36%: its fee overshoots by under 0.03 paise.
   */
  function serviceAt(spendPaise: number, cap?: number) {
    const service = new MeteringService({ now: () => NOON_IST, monthlyBudgetCapInr: cap });
    service.record(
      event({
        provider: "RAZORPAY",
        operation: "razorpay.payment_fee",
        units: Math.ceil((spendPaise * 10_000) / 236),
      }),
    );
    return service;
  }

  it("stays quiet below ₹5,000", () => {
    const service = new MeteringService({ now: () => NOON_IST });
    service.record(
      event({ provider: "META_WHATSAPP", operation: "whatsapp.utility_conv", units: 45_454 }),
    ); // 499,994 paise
    const alert = service.getSummary().budgetAlert;
    expect(alert.triggered).toBe(false);
    expect(alert.currentSpendInr).toBe(4_999.94);
    // 99.9988%, shown to two places — which is why `triggered` is the signal.
    expect(alert.percentageUsed).toBe(100);
    expect(serviceAt(499_999).getSummary().budgetAlert.triggered).toBe(false);
  });

  it("triggers at exactly ₹5,000", () => {
    const service = serviceAt(500_000);
    expect(service.getSummary().totalCostInrPaise).toBe(500_000);
    expect(service.getSummary().budgetAlert).toEqual({
      triggered: true,
      monthlyBudgetCapInr: 5_000,
      currentSpendInr: 5_000,
      percentageUsed: 100,
    });
  });

  it("reports overspend above 100%", () => {
    const service = new MeteringService({ now: () => NOON_IST });
    service.record(
      event({ provider: "ANTHROPIC", operation: "anthropic.sonnet_output", units: 5_000_000 }),
    ); // 645,000 paise
    const alert = service.getSummary("today").budgetAlert;
    expect(alert.triggered).toBe(true);
    expect(alert.percentageUsed).toBe(129);
  });

  it("forgets last month's spend", () => {
    const time = clock(new Date("2026-10-31T12:00:00Z"));
    const service = new MeteringService({ now: time.now });
    service.record(
      event({ provider: "ANTHROPIC", operation: "anthropic.sonnet_output", units: 5_000_000 }),
    );
    expect(service.getSummary().budgetAlert.triggered).toBe(true);
    time.set(NOON_IST);
    expect(service.getSummary().budgetAlert).toMatchObject({
      triggered: false,
      currentSpendInr: 0,
    });
  });

  it("honours a configured cap", () => {
    const service = serviceAt(10_000, 100);
    expect(service.getSummary().budgetAlert).toMatchObject({
      triggered: true,
      monthlyBudgetCapInr: 100,
      percentageUsed: 100,
    });
  });
});

describe("failure isolation", () => {
  it("drops invalid events with a warning instead of throwing", () => {
    const warn = vi.fn();
    const service = new MeteringService({ now: () => NOON_IST, warn });

    const bad: unknown[] = [
      event({ provider: "RESEND" }), // mismatch
      event({ units: -1 }),
      event({ units: 2.5 }),
      event({ operation: "places.teleport" as ApiOperation }),
      event({ status: "MAYBE" as "SUCCESS" }),
    ];
    for (const input of bad) {
      expect(service.record(input as RecordUsageInput)).toBeNull();
    }

    expect(service.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(bad.length);
    expect(warn.mock.calls[0]![1]).toBe("metering event dropped");
  });

  it("survives null input and a throwing logger", () => {
    const service = new MeteringService({
      warn: () => {
        throw new Error("logger down");
      },
    });
    expect(service.record(null as unknown as RecordUsageInput)).toBeNull();
  });

  it("survives a throwing id generator or clock", () => {
    const warn = vi.fn();
    const service = new MeteringService({
      warn,
      generateId: () => {
        throw new Error("no entropy");
      },
    });
    expect(service.record(event())).toBeNull();
    expect(service.size).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("recordUsageSafely swallows a recorder that throws", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const throwing: UsageRecorder = {
      record: () => {
        throw new Error("boom");
      },
    };
    expect(() => recordUsageSafely(throwing, event())).not.toThrow();
    expect(() => recordUsageSafely(undefined, event())).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("a throwing meter does not break a Places autocomplete", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const adapter = new GoogleMapsAdapter(
      { apiKey: "test-key" },
      {
        logger: SILENT_LOGGER,
        fetch: (async () =>
          Response.json({
            suggestions: [{ placePrediction: { placeId: "p1", text: { text: "Pune" } } }],
          })) as unknown as typeof fetch,
        metering: {
          record: () => {
            throw new Error("meter down");
          },
        },
      },
    );
    await expect(adapter.autocomplete("Pune", 5)).resolves.toEqual([
      { providerPlaceId: "p1", description: "Pune" },
    ]);
    spy.mockRestore();
  });

  it("a throwing meter does not break an email send", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client: ResendSendClient = {
      emails: { send: vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null }) },
    };
    const adapter = new ResendEmailAdapter(
      { from: "hello@example.com", apiKey: "test-key" },
      {
        logger: SILENT_LOGGER,
        client,
        metering: {
          record: () => {
            throw new Error("meter down");
          },
        },
      },
    );
    await expect(
      adapter.send({
        to: "traveller@example.com",
        template: "auth.login-code",
        variables: { code: "123456", expiresInMinutes: 10 },
      }),
    ).resolves.toEqual({ providerMessageId: "msg_1" });
    spy.mockRestore();
  });
});

describe("adapter instrumentation", () => {
  it("meters Places autocomplete and details, success and failure", async () => {
    const metering = new MeteringService({ now: () => NOON_IST });
    let status = 200;
    const adapter = new GoogleMapsAdapter(
      { apiKey: "test-key" },
      {
        logger: SILENT_LOGGER,
        metering,
        fetch: (async (url: string) =>
          status !== 200
            ? Response.json({ error: { status: "UNAVAILABLE" } }, { status })
            : String(url).includes("autocomplete")
              ? Response.json({ suggestions: [] })
              : Response.json({
                  location: { latitude: 18.52, longitude: 73.85 },
                })) as unknown as typeof fetch,
      },
    );

    await adapter.autocomplete("Pune", 5);
    await adapter.geocode("place-1");
    await adapter.autocomplete("P", 5); // under two characters: no request, no charge
    status = 503;
    await expect(adapter.autocomplete("Pune", 5)).rejects.toThrow();

    const events = metering.getRecentEvents();
    expect(events.map((e) => [e.operation, e.status, e.costMicroUsd])).toEqual([
      ["places.autocomplete", "ERROR", 0],
      ["places.details", "SUCCESS", 17_000],
      ["places.autocomplete", "SUCCESS", 2_830],
    ]);
    expect(events.every((e) => e.provider === "GOOGLE_PLACES")).toBe(true);
  });

  it("meters a Places network failure as an error", async () => {
    const metering = new MeteringService({ now: () => NOON_IST });
    const adapter = new GoogleMapsAdapter(
      { apiKey: "test-key" },
      {
        logger: SILENT_LOGGER,
        metering,
        fetch: (async () => {
          throw new TypeError("network down");
        }) as unknown as typeof fetch,
      },
    );
    await expect(adapter.geocode("place-1")).rejects.toThrow();
    expect(metering.getRecentEvents()[0]).toMatchObject({
      operation: "places.details",
      status: "ERROR",
    });
  });

  it("meters Resend sends without recording the recipient", async () => {
    const metering = new MeteringService({ now: () => NOON_IST });
    const send = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "msg_1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { name: "validation_error" } });
    const adapter = new ResendEmailAdapter(
      { from: "hello@example.com", apiKey: "test-key" },
      { logger: SILENT_LOGGER, client: { emails: { send } }, metering },
    );
    const message = {
      to: "traveller@example.com",
      template: "auth.login-code",
      variables: { code: "123456", expiresInMinutes: 10 },
    } as const;

    await adapter.send(message);
    await expect(adapter.send(message)).rejects.toThrow();

    const events = metering.getRecentEvents();
    expect(events.map((e) => [e.operation, e.status, e.costMicroUsd])).toEqual([
      ["email.transactional_send", "ERROR", 0],
      ["email.transactional_send", "SUCCESS", 280],
    ]);
    expect(events[1]!.metadata).toEqual({ template: "auth.login-code" });
    expect(JSON.stringify(events)).not.toContain("traveller@example.com");
  });

  it("meters Anthropic token usage by tier", () => {
    const metering = new MeteringService({ now: () => NOON_IST });
    const adapter = new AnthropicLlmAdapter({ metering });

    adapter.recordUsage({
      model: "claude-3-5-sonnet-latest",
      inputTokens: 2_000,
      outputTokens: 500,
      latencyMs: 900,
      status: "SUCCESS",
    });
    adapter.recordUsage({
      model: "claude-3-5-haiku-latest",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      latencyMs: 400,
      status: "SUCCESS",
    });

    const events = metering.getRecentEvents().reverse();
    expect(events.map((e) => [e.operation, e.units, e.costMicroUsd])).toEqual([
      ["anthropic.sonnet_input", 2_000, 6_000],
      ["anthropic.sonnet_output", 500, 7_500],
      ["anthropic.haiku_input", 1_000_000, 800_000],
      ["anthropic.haiku_output", 1_000_000, 4_000_000],
    ]);
    expect(metering.getSummary().providerBreakdown.ANTHROPIC.requestCount).toBe(4);
  });

  it("prices an unrecognised model at the dearer tier", () => {
    expect(anthropicPriceTier("claude-3-5-haiku-20241022")).toBe("haiku");
    expect(anthropicPriceTier("claude-3-5-sonnet-20241022")).toBe("sonnet");
    expect(anthropicPriceTier("some-future-model")).toBe("sonnet");
  });

  it("drops invalid Anthropic usage without throwing", () => {
    const metering = new MeteringService({ now: () => NOON_IST, warn: vi.fn() });
    const adapter = new AnthropicLlmAdapter({ metering });
    expect(() =>
      adapter.recordUsage({
        model: "claude-3-5-sonnet-latest",
        inputTokens: -3,
        outputTokens: Number.NaN,
        latencyMs: 0,
        status: "SUCCESS",
      }),
    ).not.toThrow();
    expect(metering.size).toBe(0);
  });
});

describe("/api/v1/ops/metering", () => {
  const SECRET = "metering-secret-for-tests-0123456789abcdef";
  const URL_BASE = "http://localhost/api/v1/ops/metering";

  function post(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request(URL_BASE, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  beforeEach(() => {
    envState.production = false;
    envState.secret = undefined;
    getMeteringService().clear();
  });

  it("GET returns the summary and recent events", async () => {
    getMeteringService().record(event());
    const { GET } = await import("@/app/api/v1/ops/metering/route");

    const response = await GET(new Request(`${URL_BASE}?period=today&limit=10`), undefined);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.summary).toMatchObject({
      period: "today",
      totalRequests: 1,
      totalCostInrPaise: 24,
    });
    expect(body.recentEvents).toHaveLength(1);
    expect(body.recentEvents[0].operation).toBe("places.autocomplete");
  });

  it("GET rejects bad query parameters", async () => {
    const { GET } = await import("@/app/api/v1/ops/metering/route");
    expect((await GET(new Request(`${URL_BASE}?period=decade`), undefined)).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?limit=-1`), undefined)).status).toBe(400);
  });

  it("POST ingests a WhatsApp event priced by the server", async () => {
    const { POST } = await import("@/app/api/v1/ops/metering/route");

    const response = await POST(
      post({
        provider: "META_WHATSAPP",
        operation: "whatsapp.marketing_conv",
        units: 2,
        latencyMs: 85,
        metadata: { source: "whatsapp-bot" },
      }),
      undefined,
    );
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.event).toMatchObject({
      provider: "META_WHATSAPP",
      operation: "whatsapp.marketing_conv",
      costMinorInr: 156,
      status: "SUCCESS",
    });
    expect(getMeteringService().getSummary().providerBreakdown.META_WHATSAPP.costInrPaise).toBe(
      156,
    );
  });

  it("POST honours an in-session service conversation", async () => {
    const { POST } = await import("@/app/api/v1/ops/metering/route");
    const response = await POST(
      post({
        provider: "META_WHATSAPP",
        operation: "whatsapp.service_conv",
        units: 1,
        metadata: { inSession: true },
      }),
      undefined,
    );
    expect((await response.json()).event.costMinorInr).toBe(0);
  });

  it("POST validates the payload", async () => {
    const { POST } = await import("@/app/api/v1/ops/metering/route");
    const invalid: unknown[] = [
      "{not json",
      { provider: "RESEND", operation: "places.autocomplete", units: 1 }, // mismatch
      { provider: "RESEND", operation: "email.transactional_send", units: -1 },
      { provider: "RESEND", operation: "email.transactional_send", units: 1.5 },
      { provider: "RESEND", operation: "email.transactional_send" },
      { provider: "SMS", operation: "email.transactional_send", units: 1 },
      // A caller has no field in which to claim a price.
      { provider: "RESEND", operation: "email.transactional_send", units: 1, costMinorInr: 0 },
      {
        provider: "RESEND",
        operation: "email.transactional_send",
        units: 1,
        metadata: { blob: "x".repeat(5_000) },
      },
    ];

    for (const body of invalid) {
      expect((await POST(post(body), undefined)).status).toBe(400);
    }
    expect(getMeteringService().size).toBe(0);
  });

  it("requires the secret once one is configured", async () => {
    envState.secret = SECRET;
    const { GET, POST } = await import("@/app/api/v1/ops/metering/route");
    const valid = { provider: "RESEND", operation: "email.transactional_send", units: 1 };

    expect((await GET(new Request(URL_BASE), undefined)).status).toBe(401);
    expect((await POST(post(valid), undefined)).status).toBe(401);
    expect((await POST(post(valid, { "x-metering-secret": "wrong" }), undefined)).status).toBe(401);

    expect((await POST(post(valid, { "x-metering-secret": SECRET }), undefined)).status).toBe(201);
    expect((await POST(post(valid, { authorization: `Bearer ${SECRET}` }), undefined)).status).toBe(
      201,
    );
    expect(
      (
        await GET(
          new Request(URL_BASE, { headers: { authorization: `Bearer ${SECRET}` } }),
          undefined,
        )
      ).status,
    ).toBe(200);
  });

  it("is closed in production when no secret is configured", async () => {
    envState.production = true;
    const { GET, POST } = await import("@/app/api/v1/ops/metering/route");

    expect((await GET(new Request(URL_BASE), undefined)).status).toBe(500);
    expect(
      (
        await POST(
          post({ provider: "RESEND", operation: "email.transactional_send", units: 1 }),
          undefined,
        )
      ).status,
    ).toBe(500);
    expect(getMeteringService().size).toBe(0);
  });
});
