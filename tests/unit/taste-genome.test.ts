import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as AuthContext from "@/lib/auth-context";
import { NotFoundError } from "@/lib/errors";
import { CURATION_TRACKS, type CurationTrack } from "@/modules/discovery/curation";
import { AuthService } from "@/modules/auth/service";
import type { UserRecord } from "@/modules/auth/ports";
import type { TasteGenomeAccountRepository } from "@/modules/taste-genome/ports";
import {
  DWELL_THRESHOLD_SECONDS,
  LEARNING_RATES,
  MAX_ACTIVE_SESSIONS,
  STORED_GENOME_VERSION,
  activeSessionCount,
  applyTelemetry,
  defaultGenome,
  foldTelemetry,
  getTasteGenome,
  inferTrackFromQuery,
  normalizeWeights,
  parseStoredGenome,
  resetTasteGenomeStore,
  saveTasteGenome,
  toStoredGenome,
  uniformWeights,
  type StoredTasteGenome,
} from "@/modules/taste-genome/repository";
import { TasteGenomeService, accountIdOf, calibratedWeights } from "@/modules/taste-genome/service";
import type { CalibrationAnswers, TelemetryEvent } from "@/modules/taste-genome/types";

// The routes reach the session lookup, the rate limiter and the container; none is under test.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/test";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "0123456789012345678901234567890123456789012345678901234567890123";

const NOW = new Date("2026-11-13T19:30:00.000Z");
const at = NOW.toISOString();

/** An in-memory stand-in for `users.preferences.tasteGenome` (and `full_name`). */
class FakeAccounts implements TasteGenomeAccountRepository {
  readonly rows = new Map<string, { tasteGenome?: unknown; fullName: string | null }>();
  failLoad = false;
  failSave = false;

  add(userId: string, fullName: string | null = null) {
    this.rows.set(userId, { fullName });
  }
  async load(userId: string) {
    if (this.failLoad) throw new Error("database unavailable");
    return this.rows.get(userId)?.tasteGenome ?? null;
  }
  async save(userId: string, genome: StoredTasteGenome) {
    if (this.failSave) throw new Error("database unavailable");
    const row = this.rows.get(userId);
    if (!row) throw new NotFoundError("That account is no longer available.");
    row.tasteGenome = structuredClone(genome);
  }
  async anchor(userId: string, genome: StoredTasteGenome, fullName: string | null) {
    await this.save(userId, genome);
    const row = this.rows.get(userId)!;
    if (!row.fullName?.trim()) row.fullName = fullName;
  }
}

const harness = vi.hoisted(() => ({
  userId: null as string | null,
  sessionFails: false,
  service: null as unknown,
  auth: {
    requestTravellerAccessOtp: async (_input: unknown) => undefined,
    verifyLoginOtp: async (_input: unknown): Promise<unknown> => undefined,
  },
}));

vi.mock("@/lib/auth-context", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthContext>()),
  getPrincipal: vi.fn(async () => {
    if (harness.sessionFails) throw new Error("database unavailable");
    return harness.userId ? { userId: harness.userId } : null;
  }),
  assertSameOrigin: vi.fn(async () => undefined),
  getRequestContext: vi.fn(async () => ({
    ipAddress: "203.0.113.7",
    userAgent: "vitest",
    correlationId: null,
  })),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceIpRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/container", () => ({
  getTasteGenomeService: () => harness.service,
  getAuthService: () => harness.auth,
}));

const sum = (weights: Record<CurationTrack, number>) =>
  CURATION_TRACKS.reduce((total, track) => total + weights[track], 0);

/** Re-normalising moves the last bits of a float, so weights compare by closeness. */
function expectSameGenome(
  actual: { trackAffinity: Record<CurationTrack, number> },
  expected: { trackAffinity: Record<CurationTrack, number> },
) {
  const { trackAffinity: a, ...restActual } = actual;
  const { trackAffinity: e, ...restExpected } = expected;
  expect(restActual).toEqual(restExpected);
  for (const track of CURATION_TRACKS) expect(a[track]).toBeCloseTo(e[track], 12);
}

const answers: CalibrationAnswers = {
  dietary: "JAIN_HAUTE",
  beverages: ["FINE_WINE_CHAMPAGNE"],
  seating: "ALFRESCO_ROOFTOP",
  acoustic: "LIVE_JAZZ_ACOUSTIC",
};

let accounts: FakeAccounts;
let service: TasteGenomeService;
const warnings: string[] = [];

beforeEach(() => {
  resetTasteGenomeStore();
  accounts = new FakeAccounts();
  warnings.length = 0;
  service = new TasteGenomeService({
    accounts,
    now: () => NOW,
    warn: (message) => warnings.push(message),
  });
  harness.service = service;
  harness.userId = null;
  harness.sessionFails = false;
});

describe("taste genome — repository", () => {
  it("starts empty and builds an uncalibrated uniform default with no declared taste", () => {
    expect(getTasteGenome("guest:a")).toBeNull();
    const genome = defaultGenome("guest:a", NOW);
    expect(genome).toMatchObject({
      calibrated: false,
      interactionCount: 0,
      taste: { dietary: null, beverages: [], seating: null, acoustic: null },
    });
    for (const track of CURATION_TRACKS) expect(genome.trackAffinity[track]).toBeCloseTo(0.2);
    expect(genome.updatedAt).toBe(at);
  });

  it("round-trips a saved genome and normalises its weights on save", () => {
    saveTasteGenome({
      ...defaultGenome("guest:a", NOW),
      trackAffinity: { ...uniformWeights(), CONNOISSEUR: 4 },
    });
    const stored = getTasteGenome("guest:a")!;
    expect(sum(stored.trackAffinity)).toBeCloseTo(1, 10);
    expect(stored.trackAffinity.CONNOISSEUR).toBeCloseTo(4 / 4.8);
  });

  it("normalises a degenerate vector to uniform", () => {
    const zero = Object.fromEntries(CURATION_TRACKS.map((t) => [t, 0])) as Record<
      CurationTrack,
      number
    >;
    expect(normalizeWeights(zero)).toEqual(uniformWeights());
    expect(normalizeWeights({ ...zero, CONNOISSEUR: Number.NaN })).toEqual(uniformWeights());
  });

  it("caps active sessions, evicting the least recently used", () => {
    for (let i = 0; i < MAX_ACTIVE_SESSIONS; i++) saveTasteGenome(defaultGenome(`guest:${i}`, NOW));
    getTasteGenome("guest:0"); // touch the oldest, so guest:1 becomes the eviction candidate
    saveTasteGenome(defaultGenome("guest:new", NOW));

    expect(activeSessionCount()).toBe(MAX_ACTIVE_SESSIONS);
    expect(getTasteGenome("guest:0")).not.toBeNull();
    expect(getTasteGenome("guest:1")).toBeNull();
    expect(getTasteGenome("guest:new")).not.toBeNull();
  });
});

describe("taste genome — stored JSON codec", () => {
  it("round-trips a genome through the stored shape", () => {
    const genome = {
      ...defaultGenome("user:1", NOW),
      taste: { ...answers, beverages: [...answers.beverages] },
      trackAffinity: calibratedWeights(answers),
      calibrated: true,
      interactionCount: 7,
    };
    const stored = toStoredGenome(genome);
    expect(stored.version).toBe(STORED_GENOME_VERSION);
    expect(stored).not.toHaveProperty("patronId");
    expectSameGenome(parseStoredGenome("user:1", JSON.parse(JSON.stringify(stored)))!, genome);
  });

  it("reads absent, foreign and older-version values as no genome", () => {
    expect(parseStoredGenome("user:1", null)).toBeNull();
    expect(parseStoredGenome("user:1", "nope")).toBeNull();
    // The mood-based v1 shape: the patron is asked the permanent questions again.
    expect(
      parseStoredGenome("user:1", { moodWeights: uniformWeights(), activeHub: "EAST_PUNE" }),
    ).toBeNull();
  });

  it("drops unknown options, re-normalises weights and sanitises the count", () => {
    const genome = parseStoredGenome("user:1", {
      version: STORED_GENOME_VERSION,
      taste: {
        dietary: "CARNIVORE_ONLY",
        beverages: ["FINE_WINE_CHAMPAGNE", "MOONSHINE", "FINE_WINE_CHAMPAGNE"],
        seating: "CHEF_COUNTER",
        acoustic: 42,
      },
      trackAffinity: { CONNOISSEUR: 3, ARTISANAL_FOCUS: 1, EVIL: 9 },
      calibrated: "yes",
      interactionCount: -5,
      updatedAt: "not a date",
    })!;

    expect(genome.taste).toEqual({
      dietary: null,
      beverages: ["FINE_WINE_CHAMPAGNE"],
      seating: "CHEF_COUNTER",
      acoustic: null,
    });
    expect(genome.trackAffinity.CONNOISSEUR).toBeCloseTo(0.75);
    expect(genome.trackAffinity).not.toHaveProperty("EVIL");
    expect(genome.calibrated).toBe(false);
    expect(genome.interactionCount).toBe(0);
    expect(Date.parse(genome.updatedAt)).not.toBeNaN();
  });
});

describe("taste genome — telemetry re-weighting", () => {
  const event = (partial: Omit<TelemetryEvent, "timestamp">): TelemetryEvent => ({
    ...partial,
    timestamp: at,
  });

  it("adds each signal's learning rate to its track, then re-normalises", () => {
    const cases = [
      [event({ type: "card_click", track: "CONNOISSEUR" }), LEARNING_RATES.card_click],
      [
        event({ type: "card_dwell", track: "CONNOISSEUR", dwellSeconds: 8 }),
        LEARNING_RATES.card_dwell,
      ],
      [
        event({ type: "search_query", track: "CONNOISSEUR", query: "x" }),
        LEARNING_RATES.search_query,
      ],
      [event({ type: "category_filter", track: "CONNOISSEUR" }), LEARNING_RATES.category_filter],
    ] as const;

    for (const [signal, rate] of cases) {
      const next = applyTelemetry(uniformWeights(), [signal]);
      expect(next.CONNOISSEUR).toBeCloseTo((0.2 + rate) / (1 + rate), 10);
      expect(next.MINDFUL_WELLNESS).toBeCloseTo(0.2 / (1 + rate), 10);
      expect(sum(next)).toBeCloseTo(1, 10);
    }
  });

  it("ignores views, short dwells and events with no track", () => {
    const next = applyTelemetry(uniformWeights(), [
      event({ type: "card_view", track: "CONNOISSEUR" }),
      event({ type: "card_dwell", track: "CONNOISSEUR", dwellSeconds: DWELL_THRESHOLD_SECONDS }),
      event({ type: "card_click" }),
      event({ type: "search_query", query: "something unrelated" }),
    ]);
    expect(next).toEqual(uniformWeights());
  });

  it("infers a track from an unambiguous search query only", () => {
    expect(inferTrackFromQuery("Rooftop sunset drinks")).toBe("ALFRESCO_SUNDOWNER");
    expect(inferTrackFromQuery("spa and yoga")).toBe("MINDFUL_WELLNESS");
    expect(inferTrackFromQuery("rooftop club")).toBeNull();
    expect(inferTrackFromQuery("dinner")).toBeNull();

    const next = applyTelemetry(uniformWeights(), [
      event({ type: "search_query", query: "wine tasting" }),
    ]);
    expect(next.CONNOISSEUR).toBeGreaterThan(0.2);
  });

  it("converges towards a repeatedly clicked track without overshooting", () => {
    const clicks = Array.from({ length: 40 }, () =>
      event({ type: "card_click", track: "HIGH_OCTANE_NIGHTLIFE" }),
    );
    const next = applyTelemetry(uniformWeights(), clicks);
    expect(next.HIGH_OCTANE_NIGHTLIFE).toBeGreaterThan(0.9);
    expect(next.HIGH_OCTANE_NIGHTLIFE).toBeLessThan(1);
    expect(sum(next)).toBeCloseTo(1, 10);
  });

  it("folds events into a genome without touching declared taste", () => {
    const base = { ...defaultGenome("guest:a", NOW), taste: { ...answers } };
    const next = foldTelemetry(
      base,
      [event({ type: "card_click", track: "ARTISANAL_FOCUS" })],
      NOW,
    );
    expect(next.interactionCount).toBe(1);
    expect(next.trackAffinity.ARTISANAL_FOCUS).toBeGreaterThan(0.2);
    expect(next.taste).toEqual(base.taste);
  });
});

describe("taste genome — calibration weights", () => {
  it("is a distribution that keeps every track possible", () => {
    const weights = calibratedWeights(answers);
    expect(sum(weights)).toBeCloseTo(1, 10);
    for (const track of CURATION_TRACKS) expect(weights[track]).toBeGreaterThan(0);
  });

  it("leans towards the tracks the seating and acoustic answers point at", () => {
    // Rooftop and live jazz both point at the sundowner track.
    const weights = calibratedWeights(answers);
    const ranked = [...CURATION_TRACKS].sort((a, b) => weights[b] - weights[a]);
    expect(ranked[0]).toBe("ALFRESCO_SUNDOWNER");

    const quiet = calibratedWeights({
      dietary: "VEGAN_BOTANICAL",
      beverages: ["ZERO_PROOF_TEMPERANCE"],
      seating: "SECLUDED_BOOTH",
      acoustic: "WHISPER_CONVERSATION",
    });
    expect(quiet.MINDFUL_WELLNESS).toBeGreaterThan(quiet.HIGH_OCTANE_NIGHTLIFE);
  });

  it("shares the bar palate across choices, so ticking all cannot outweigh one seating answer", () => {
    const all = calibratedWeights({
      ...answers,
      beverages: [
        "SINGLE_MALT_SPIRITS",
        "CRAFT_BREW_ARTISANAL",
        "FINE_WINE_CHAMPAGNE",
        "BOTANICAL_MIXOLOGY",
        "ZERO_PROOF_TEMPERANCE",
      ],
    });
    const ranked = [...CURATION_TRACKS].sort((a, b) => all[b] - all[a]);
    expect(ranked[0]).toBe("ALFRESCO_SUNDOWNER");
  });

  it("gives a flexible omnivore no dietary lean", () => {
    const flexible = calibratedWeights({ ...answers, dietary: "OMNIVORE_FLEXIBLE" });
    const vegetarian = calibratedWeights({ ...answers, dietary: "PURE_VEGETARIAN" });
    expect(vegetarian.MINDFUL_WELLNESS).toBeGreaterThan(flexible.MINDFUL_WELLNESS);
  });
});

describe("taste genome — service persistence", () => {
  it("keeps a guest genome in memory only", async () => {
    const genome = await service.calibrate("guest:g", answers);
    expect(genome).toMatchObject({ calibrated: true, taste: answers });
    expect(getTasteGenome("guest:g")).toEqual(genome);
    expect(accounts.rows.size).toBe(0);
  });

  it("writes a signed-in patron's calibration to their account", async () => {
    accounts.add("u1");
    const genome = await service.calibrate("user:u1", answers);

    expectSameGenome(
      accounts.rows.get("u1")!.tasteGenome as StoredTasteGenome,
      toStoredGenome(genome),
    );
    // A fresh process (empty cache) reads it back from the account.
    resetTasteGenomeStore();
    expectSameGenome(await service.getGenome("user:u1"), genome);
  });

  it("fails calibration rather than claiming a save that did not happen", async () => {
    accounts.add("u1");
    accounts.failSave = true;
    await expect(service.calibrate("user:u1", answers)).rejects.toThrow("database unavailable");
    expect(getTasteGenome("user:u1")?.calibrated ?? false).toBe(false);
  });

  it("keeps the interaction count across recalibration", async () => {
    accounts.add("u1");
    await service.processTelemetry("user:u1", [
      { type: "card_click", track: "CONNOISSEUR", timestamp: at },
    ]);
    const genome = await service.calibrate("user:u1", answers);
    expect(genome.interactionCount).toBe(1);
  });

  it("persists telemetry for an account, and degrades when the write fails", async () => {
    accounts.add("u1");
    const click = { type: "card_click", track: "CONNOISSEUR", timestamp: at } as const;

    await service.processTelemetry("user:u1", [click]);
    expect((accounts.rows.get("u1")!.tasteGenome as StoredTasteGenome).interactionCount).toBe(1);

    accounts.failSave = true;
    const next = await service.processTelemetry("user:u1", [click]);
    expect(next.interactionCount).toBe(2);
    expect(warnings).toHaveLength(1);
  });

  it("serves the default when the account read fails, and retries next time", async () => {
    accounts.add("u1");
    await service.calibrate("user:u1", answers);
    resetTasteGenomeStore();

    accounts.failLoad = true;
    expect((await service.getGenome("user:u1")).calibrated).toBe(false);
    expect(warnings).toHaveLength(1);

    accounts.failLoad = false;
    expect((await service.getGenome("user:u1")).calibrated).toBe(true);
  });

  it("reads an unknown guest as a default without creating a session", async () => {
    expect((await service.getGenome("guest:unknown")).calibrated).toBe(false);
    expect(activeSessionCount()).toBe(0);
  });

  it("anchors a guest genome to an account, carrying browsing history and filling a blank name", async () => {
    accounts.add("u1");
    await service.calibrate("guest:g", answers);
    await service.processTelemetry("guest:g", [
      { type: "card_view", timestamp: at },
      { type: "card_view", timestamp: at },
    ]);

    const genome = await service.anchor({
      userId: "u1",
      guestPatronId: "guest:g",
      answers,
      fullName: "Aarav Mehta",
    });

    expect(genome).toMatchObject({ patronId: "user:u1", calibrated: true, interactionCount: 2 });
    expect(accounts.rows.get("u1")).toMatchObject({ fullName: "Aarav Mehta" });
    expect(getTasteGenome("guest:g")).toBeNull();
  });

  it("anchors from the submitted answers when the guest session is gone, and keeps an existing name", async () => {
    accounts.add("u1", "Existing Name");
    const genome = await service.anchor({
      userId: "u1",
      guestPatronId: "guest:evicted",
      answers,
      fullName: "Someone Else",
    });
    expect(genome.taste).toEqual(answers);
    expect(accounts.rows.get("u1")!.fullName).toBe("Existing Name");
  });

  it("maps patron ids to account ids", () => {
    expect(accountIdOf("user:abc")).toBe("abc");
    expect(accountIdOf("guest:abc")).toBeNull();
  });
});

describe("auth — traveller access code", () => {
  function makeAuth(existing: UserRecord | null) {
    const users = new Map<string, UserRecord>(existing ? [[existing.email, existing]] : []);
    const delivered: string[] = [];
    const audit: string[] = [];
    const auth = new AuthService({
      users: {
        findByEmail: async (email: string) => users.get(email) ?? null,
        createWithRole: async ({ email }: { email: string }) => {
          const user = {
            id: "new-user",
            email,
            passwordHash: null,
            emailVerifiedAt: null,
            status: "ACTIVE",
            deletedAt: null,
          } as unknown as UserRecord;
          users.set(email, user);
          return user;
        },
      } as never,
      otps: {
        consumeAllForEmail: async () => undefined,
        create: async () => undefined,
      } as never,
      sessions: {} as never,
      rateLimiter: { consume: async () => ({ allowed: true, retryAfterSeconds: 0 }) } as never,
      audit: {
        record: async (entry: { action: string }) => void audit.push(entry.action),
      } as never,
      now: () => NOW,
      deliverOtp: async (email) => void delivered.push(email),
    });
    return { auth, users, delivered, audit };
  }

  const context = { ipAddress: "203.0.113.7", userAgent: null, correlationId: null };

  it("creates a passwordless traveller for a new address and sends a code", async () => {
    const { auth, users, delivered, audit } = makeAuth(null);
    await auth.requestTravellerAccessOtp({ email: "new@example.com", context });
    expect(users.has("new@example.com")).toBe(true);
    expect(audit).toEqual(["auth.registered"]);
    expect(delivered).toEqual(["new@example.com"]);
  });

  it("sends a code to an existing traveller without creating anything", async () => {
    const existing = {
      id: "u1",
      email: "known@example.com",
      passwordHash: null,
      status: "ACTIVE",
      deletedAt: null,
    } as unknown as UserRecord;
    const { auth, delivered, audit } = makeAuth(existing);
    await auth.requestTravellerAccessOtp({ email: "known@example.com", context });
    expect(audit).toEqual([]);
    expect(delivered).toEqual(["known@example.com"]);
  });

  it("sends nothing to a password account, and does not say so", async () => {
    const host = {
      id: "h1",
      email: "host@example.com",
      passwordHash: "argon2-hash",
      status: "ACTIVE",
      deletedAt: null,
    } as unknown as UserRecord;
    const { auth, delivered } = makeAuth(host);
    await expect(
      auth.requestTravellerAccessOtp({ email: "host@example.com", context }),
    ).resolves.toBeUndefined();
    expect(delivered).toEqual([]);
  });
});

describe("taste genome — API routes", () => {
  const GUEST = "6f1c2c1e-6b1d-4a5e-9a51-2d1f4f7b9c10";
  const post = (path: string, body: unknown, cookie?: string) =>
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  it("GET issues a guest cookie and returns the default, unanchored genome", async () => {
    const { GET } = await import("@/app/api/v1/taste-genome/route");
    const response = await GET(new Request("http://localhost/api/v1/taste-genome"), undefined);

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/lv_guest=[0-9a-f-]{36}.*HttpOnly/i);
    const body = await response.json();
    expect(body.anchored).toBe(false);
    expect(body.genome.patronId).toMatch(/^guest:/);
    expect(body.genome.calibrated).toBe(false);
  });

  it("GET reuses a valid guest cookie and keys a signed-in patron by user id", async () => {
    const { GET } = await import("@/app/api/v1/taste-genome/route");
    const guest = await GET(
      new Request("http://localhost/api/v1/taste-genome", {
        headers: { cookie: `lv_guest=${GUEST}` },
      }),
      undefined,
    );
    expect(guest.headers.get("set-cookie")).toBeNull();
    expect((await guest.json()).genome.patronId).toBe(`guest:${GUEST}`);

    harness.userId = "u-42";
    const user = await GET(new Request("http://localhost/api/v1/taste-genome"), undefined);
    const body = await user.json();
    expect(body.genome.patronId).toBe("user:u-42");
    expect(body.anchored).toBe(true);
  });

  it("GET ignores a malformed guest cookie and degrades to guest when the session lookup fails", async () => {
    const { GET } = await import("@/app/api/v1/taste-genome/route");
    harness.sessionFails = true;
    const response = await GET(
      new Request("http://localhost/api/v1/taste-genome", {
        headers: { cookie: "lv_guest=../../evil" },
      }),
      undefined,
    );
    expect(response.status).toBe(200);
    const { genome } = await response.json();
    expect(genome.patronId).not.toContain("evil");
    expect(response.headers.get("set-cookie")).toMatch(/lv_guest=/);
  });

  it("POST calibrate holds a guest genome on the device and reports it unanchored", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/calibrate/route");
    const { GET } = await import("@/app/api/v1/taste-genome/route");
    const cookie = `lv_guest=${GUEST}`;

    const response = await POST(post("/api/v1/taste-genome/calibrate", answers, cookie), undefined);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ anchored: false, genome: { calibrated: true, taste: answers } });

    const read = await GET(
      new Request("http://localhost/api/v1/taste-genome", { headers: { cookie } }),
      undefined,
    );
    const { genome } = await read.json();
    expect(genome.trackAffinity.ALFRESCO_SUNDOWNER).toBeGreaterThan(
      genome.trackAffinity.HIGH_OCTANE_NIGHTLIFE,
    );
  });

  it("POST calibrate saves a signed-in patron's genome to their account", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/calibrate/route");
    accounts.add("u-42");
    harness.userId = "u-42";

    const response = await POST(post("/api/v1/taste-genome/calibrate", answers), undefined);
    expect(response.status).toBe(200);
    expect((await response.json()).anchored).toBe(true);
    expect(accounts.rows.get("u-42")!.tasteGenome).toMatchObject({ taste: answers });
  });

  it("POST calibrate rejects mood, hub, missing beverages and unknown fields", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/calibrate/route");
    const path = "/api/v1/taste-genome/calibrate";
    for (const body of [
      { ...answers, mood: "CONNOISSEUR" },
      { ...answers, hub: "EAST_PUNE" },
      { ...answers, dietary: "NOPE" },
      { ...answers, beverages: [] },
      { dietary: answers.dietary, seating: answers.seating, acoustic: answers.acoustic },
    ]) {
      expect((await POST(post(path, body), undefined)).status).toBe(400);
    }
  });

  it("POST anchor sends a code, normalising the address, and answers 202", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/anchor/route");
    const request = vi.fn(async (_input: unknown) => undefined);
    harness.auth.requestTravellerAccessOtp = request;

    const response = await POST(
      post("/api/v1/taste-genome/anchor", { name: "Aarav", email: "Aarav@Example.com" }),
      undefined,
    );
    expect(response.status).toBe(202);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ email: "aarav@example.com" }));
  });

  it("POST anchor rejects a blank name or bad email before sending anything", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/anchor/route");
    const request = vi.fn(async (_input: unknown) => undefined);
    harness.auth.requestTravellerAccessOtp = request;
    const path = "/api/v1/taste-genome/anchor";

    expect((await POST(post(path, { name: "  ", email: "a@b.com" }), undefined)).status).toBe(400);
    expect((await POST(post(path, { name: "A", email: "nope" }), undefined)).status).toBe(400);
    expect(request).not.toHaveBeenCalled();
  });

  it("POST anchor/verify signs in, seals the guest genome to the account and sets the session", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/anchor/verify/route");
    accounts.add("u-7");
    await service.calibrate(`guest:${GUEST}`, answers);
    harness.auth.verifyLoginOtp = async () => ({
      token: "session-token",
      sessionId: "s1",
      userId: "u-7",
      expiresAt: NOW,
      lifetime: { absoluteMs: 3_600_000, idleMs: 600_000 },
      mfaRequired: false,
    });

    const response = await POST(
      post(
        "/api/v1/taste-genome/anchor/verify",
        { name: "Aarav", email: "aarav@example.com", code: "123456", answers },
        `lv_guest=${GUEST}`,
      ),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      anchored: true,
      genome: { patronId: "user:u-7", taste: answers },
    });
    expect(response.headers.get("set-cookie")).toMatch(/lv_session=session-token/);
    expect(accounts.rows.get("u-7")).toMatchObject({ fullName: "Aarav" });
    expect(getTasteGenome(`guest:${GUEST}`)).toBeNull();
  });

  it("POST anchor/verify still sets the session when the genome write fails", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/anchor/verify/route");
    // No account row: the write fails as it would for a just-deleted account.
    harness.auth.verifyLoginOtp = async () => ({
      token: "session-token",
      sessionId: "s1",
      userId: "u-missing",
      expiresAt: NOW,
      lifetime: { absoluteMs: 3_600_000, idleMs: 600_000 },
      mfaRequired: false,
    });

    const response = await POST(
      post("/api/v1/taste-genome/anchor/verify", {
        name: "Aarav",
        email: "aarav@example.com",
        code: "123456",
        answers,
      }),
      undefined,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).anchored).toBe(false);
    expect(response.headers.get("set-cookie")).toMatch(/lv_session=/);
  });

  it("POST anchor/verify writes nothing when the code is wrong", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/anchor/verify/route");
    const { UnauthenticatedError } = await import("@/lib/errors");
    accounts.add("u-7");
    harness.auth.verifyLoginOtp = async () => {
      throw new UnauthenticatedError("That code is not valid.");
    };

    const response = await POST(
      post("/api/v1/taste-genome/anchor/verify", {
        name: "Aarav",
        email: "aarav@example.com",
        code: "000000",
        answers,
      }),
      undefined,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(accounts.rows.get("u-7")!.tasteGenome).toBeUndefined();
  });

  it("POST telemetry folds a batch into the genome", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/telemetry/route");
    const cookie = `lv_guest=${GUEST}`;
    const response = await POST(
      post(
        "/api/v1/taste-genome/telemetry",
        {
          events: [
            {
              type: "card_view",
              experienceId: "sky-bar",
              track: "HIGH_OCTANE_NIGHTLIFE",
              timestamp: at,
            },
            {
              type: "card_click",
              experienceId: "sky-bar",
              track: "HIGH_OCTANE_NIGHTLIFE",
              timestamp: at,
            },
          ],
        },
        cookie,
      ),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: 2, interactionCount: 2 });
    expect(getTasteGenome(`guest:${GUEST}`)!.trackAffinity.HIGH_OCTANE_NIGHTLIFE).toBeGreaterThan(
      0.2,
    );
  });

  it("POST telemetry accepts a text/plain beacon body", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/telemetry/route");
    const request = new Request("http://localhost/api/v1/taste-genome/telemetry", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8", cookie: `lv_guest=${GUEST}` },
      body: JSON.stringify({ events: [{ type: "search_query", query: "rooftop", timestamp: at }] }),
    });
    expect((await POST(request, undefined)).status).toBe(200);
  });

  it("POST telemetry rejects empty, oversized and malformed batches", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/telemetry/route");
    const path = "/api/v1/taste-genome/telemetry";
    const many = Array.from({ length: 51 }, () => ({ type: "card_view", timestamp: at }));

    expect((await POST(post(path, { events: [] }), undefined)).status).toBe(400);
    expect((await POST(post(path, { events: many }), undefined)).status).toBe(400);
    expect(
      (await POST(post(path, { events: [{ type: "hover", timestamp: at }] }), undefined)).status,
    ).toBe(400);
    expect(
      (
        await POST(
          post(path, { events: [{ type: "card_view", timestamp: "yesterday" }] }),
          undefined,
        )
      ).status,
    ).toBe(400);
  });
});
