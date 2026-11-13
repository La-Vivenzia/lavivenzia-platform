import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURATION_TRACKS, type CurationTrack } from "@/modules/discovery/curation";
import {
  DWELL_THRESHOLD_SECONDS,
  LEARNING_RATES,
  MAX_ACTIVE_SESSIONS,
  activeSessionCount,
  applyTelemetry,
  defaultGenome,
  getTasteGenome,
  inferTrackFromQuery,
  normalizeWeights,
  recordTelemetry,
  resetTasteGenomeStore,
  saveTasteGenome,
  uniformWeights,
} from "@/modules/taste-genome/repository";
import {
  calibrate,
  calibratedWeights,
  getGenome,
  processTelemetry,
} from "@/modules/taste-genome/service";
import type { CalibrationAnswers, TelemetryEvent } from "@/modules/taste-genome/types";

// The routes reach the session lookup and the rate limiter; neither is under test.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/test";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "0123456789012345678901234567890123456789012345678901234567890123";
const auth = vi.hoisted(() => ({ userId: null as string | null, sessionFails: false }));
vi.mock("@/lib/auth-context", () => ({
  getPrincipal: vi.fn(async () => {
    if (auth.sessionFails) throw new Error("database unavailable");
    return auth.userId ? { userId: auth.userId } : null;
  }),
  assertSameOrigin: vi.fn(async () => undefined),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceIpRateLimit: vi.fn(async () => undefined) }));

const NOW = new Date("2026-11-13T19:30:00.000Z");
const at = NOW.toISOString();

const sum = (weights: Record<CurationTrack, number>) =>
  CURATION_TRACKS.reduce((total, track) => total + weights[track], 0);

const answers: CalibrationAnswers = {
  mood: "ALFRESCO_SUNDOWNER",
  palate: ["ARTISANAL_CRAFT_WINE"],
  companion: "INTIMATE_DATE",
  hub: "EAST_PUNE",
};

beforeEach(() => {
  resetTasteGenomeStore();
  auth.userId = null;
  auth.sessionFails = false;
});

describe("taste genome — repository", () => {
  it("starts empty and builds an uncalibrated uniform default", () => {
    expect(getTasteGenome("guest:a")).toBeNull();
    const genome = defaultGenome("guest:a", NOW);
    expect(genome).toMatchObject({
      calibrated: false,
      interactionCount: 0,
      activeHub: "EAST_PUNE",
    });
    for (const track of CURATION_TRACKS) expect(genome.moodWeights[track]).toBeCloseTo(0.2);
    expect(genome.updatedAt).toBe(at);
  });

  it("round-trips a saved genome and normalises its weights on save", () => {
    saveTasteGenome({
      ...defaultGenome("guest:a", NOW),
      moodWeights: { ...uniformWeights(), CONNOISSEUR: 4 },
    });
    const stored = getTasteGenome("guest:a")!;
    expect(sum(stored.moodWeights)).toBeCloseTo(1, 10);
    expect(stored.moodWeights.CONNOISSEUR).toBeCloseTo(4 / 4.8);
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

  it("records telemetry into a new or existing genome and counts interactions", () => {
    const first = recordTelemetry(
      "guest:a",
      [event({ type: "card_click", track: "ARTISANAL_FOCUS" })],
      NOW,
    );
    expect(first.interactionCount).toBe(1);
    expect(first.moodWeights.ARTISANAL_FOCUS).toBeGreaterThan(0.2);

    const second = processTelemetry(
      "guest:a",
      [event({ type: "card_view" }), event({ type: "card_view" })],
      NOW,
    );
    expect(second.interactionCount).toBe(3);
    expect(second.moodWeights).toEqual(first.moodWeights);
  });
});

describe("taste genome — calibration", () => {
  it("weights the chosen mood highest and keeps every track possible", () => {
    const weights = calibratedWeights(answers);
    expect(sum(weights)).toBeCloseTo(1, 10);
    const ranked = [...CURATION_TRACKS].sort((a, b) => weights[b] - weights[a]);
    expect(ranked[0]).toBe("ALFRESCO_SUNDOWNER");
    for (const track of CURATION_TRACKS) expect(weights[track]).toBeGreaterThan(0);
  });

  it("saves a calibrated genome and keeps interaction history across recalibration", () => {
    processTelemetry("user:1", [{ type: "card_click", track: "CONNOISSEUR", timestamp: at }], NOW);
    const genome = calibrate("user:1", answers, NOW);

    expect(genome).toMatchObject({
      patronId: "user:1",
      calibrated: true,
      palatePreferences: ["ARTISANAL_CRAFT_WINE"],
      companionProfile: "INTIMATE_DATE",
      activeHub: "EAST_PUNE",
      interactionCount: 1,
    });
    expect(getGenome("user:1")).toEqual(genome);
  });

  it("reads an unknown patron as a default without creating a session", () => {
    expect(getGenome("guest:unknown").calibrated).toBe(false);
    expect(activeSessionCount()).toBe(0);
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

  it("GET issues a guest cookie and returns the default genome", async () => {
    const { GET } = await import("@/app/api/v1/taste-genome/route");
    const response = await GET(new Request("http://localhost/api/v1/taste-genome"), undefined);

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/lv_guest=[0-9a-f-]{36}.*HttpOnly/i);
    const { genome } = await response.json();
    expect(genome.patronId).toMatch(/^guest:/);
    expect(genome.calibrated).toBe(false);
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

    auth.userId = "u-42";
    const user = await GET(new Request("http://localhost/api/v1/taste-genome"), undefined);
    expect((await user.json()).genome.patronId).toBe("user:u-42");
  });

  it("GET ignores a malformed guest cookie and degrades to guest when the session lookup fails", async () => {
    const { GET } = await import("@/app/api/v1/taste-genome/route");
    auth.sessionFails = true;
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

  it("POST calibrate saves a calibrated genome that GET then returns", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/calibrate/route");
    const { GET } = await import("@/app/api/v1/taste-genome/route");
    const cookie = `lv_guest=${GUEST}`;

    const response = await POST(post("/api/v1/taste-genome/calibrate", answers, cookie), undefined);
    expect(response.status).toBe(200);
    expect((await response.json()).genome.calibrated).toBe(true);

    const read = await GET(
      new Request("http://localhost/api/v1/taste-genome", { headers: { cookie } }),
      undefined,
    );
    const { genome } = await read.json();
    expect(genome.calibrated).toBe(true);
    expect(genome.moodWeights.ALFRESCO_SUNDOWNER).toBeGreaterThan(genome.moodWeights.CONNOISSEUR);
  });

  it("POST calibrate rejects invalid answers", async () => {
    const { POST } = await import("@/app/api/v1/taste-genome/calibrate/route");
    expect(
      (await POST(post("/api/v1/taste-genome/calibrate", { ...answers, mood: "NOPE" }), undefined))
        .status,
    ).toBe(400);
    expect(
      (await POST(post("/api/v1/taste-genome/calibrate", { ...answers, hub: "MUMBAI" }), undefined))
        .status,
    ).toBe(400);
    expect(
      (await POST(post("/api/v1/taste-genome/calibrate", { ...answers, extra: 1 }), undefined))
        .status,
    ).toBe(400);
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
    expect(getTasteGenome(`guest:${GUEST}`)!.moodWeights.HIGH_OCTANE_NIGHTLIFE).toBeGreaterThan(
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
