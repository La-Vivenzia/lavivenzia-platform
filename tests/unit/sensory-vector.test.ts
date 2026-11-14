import { describe, expect, it } from "vitest";

import { CURATION_TRACKS, type CurationTrack } from "@/modules/discovery/curation";
import { listCuratedJourneys, type SensoryProfile } from "@/modules/journeys/data";
import type { TasteGenome, TasteProfile } from "@/modules/taste-genome/types";
import { computeSensoryMatch, describeSensoryProfile } from "@/modules/viveniq/sensory-vector";

const uniform = Object.fromEntries(
  CURATION_TRACKS.map((track) => [track, 1 / CURATION_TRACKS.length]),
) as Record<CurationTrack, number>;

function genome(taste: Partial<TasteProfile>, overrides: Partial<TasteGenome> = {}): TasteGenome {
  return {
    patronId: "guest:test",
    taste: { dietary: null, beverages: [], seating: null, acoustic: null, ...taste },
    trackAffinity: uniform,
    calibrated: true,
    interactionCount: 0,
    updatedAt: "2026-11-14T00:00:00.000Z",
    ...overrides,
  };
}

const journey = (profile: Partial<SensoryProfile>) => ({
  sensoryProfile: {
    acousticDecibels: 45,
    lightingLux: 55,
    seatingPrivacy: "secluded" as const,
    sensoryContrast: 0.5,
    secretRitual: "A ritual.",
    ...profile,
  },
});

describe("computeSensoryMatch", () => {
  const quietBooth = genome({ acoustic: "WHISPER_CONVERSATION", seating: "SECLUDED_BOOTH" });

  it("scores a near-perfect fit close to 100 with highlights", () => {
    const match = computeSensoryMatch(quietBooth, journey({}));
    expect(match.score).toBeGreaterThanOrEqual(90);
    expect(match.highlights).toContain("Quiet enough to talk without raising your voice");
    expect(match.highlights).toContain("Tucked-away tables, away from the floor");
  });

  it("scores a loud, open, bright evening low for a whisper-quiet booth patron", () => {
    const match = computeSensoryMatch(
      quietBooth,
      journey({ acousticDecibels: 85, lightingLux: 400, seatingPrivacy: "open" }),
    );
    expect(match.score).toBeLessThan(40);
    expect(match.highlights).not.toContain("Quiet enough to talk without raising your voice");
  });

  it("stays within 0–100 for every curated journey", () => {
    for (const curated of listCuratedJourneys()) {
      const { score } = computeSensoryMatch(quietBooth, curated);
      expect(score).not.toBeNull();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("returns null rather than a guess for an uncalibrated, unbrowsed genome", () => {
    const match = computeSensoryMatch(genome({}, { calibrated: false }), journey({}));
    expect(match).toEqual({ score: null, highlights: [], dimensions: {} });
  });

  it("scores only the dimensions the genome speaks to", () => {
    const match = computeSensoryMatch(
      genome({ acoustic: "UPBEAT_LOUNGE" }, { calibrated: false }),
      journey({ acousticDecibels: 80 }),
    );
    expect(Object.keys(match.dimensions).sort()).toEqual(["acoustic", "lighting"]);
    expect(match.dimensions.acoustic).toBe(1);
  });
});

describe("journey sensory profiles", () => {
  it("gives every curated journey a profile", () => {
    for (const curated of listCuratedJourneys()) {
      expect(curated.sensoryProfile.secretRitual.length).toBeGreaterThan(0);
    }
  });
});

describe("describeSensoryProfile", () => {
  it("describes the feel in words and never prints the raw figures", () => {
    for (const curated of listCuratedJourneys()) {
      const described = describeSensoryProfile(curated.sensoryProfile);
      const { acousticFeel, lighting, seatingPrivacy } = described;
      for (const text of [acousticFeel, lighting, seatingPrivacy]) {
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/\d/);
      }
      expect(described.secretRitual).toBe(curated.sensoryProfile.secretRitual);
    }
  });

  it("tells a quiet room from a loud one", () => {
    const quiet = describeSensoryProfile(journey({ acousticDecibels: 42 }).sensoryProfile);
    const loud = describeSensoryProfile(journey({ acousticDecibels: 85 }).sensoryProfile);
    expect(quiet.acousticFeel).toBe("Conversation-quiet");
    expect(loud.acousticFeel).not.toBe(quiet.acousticFeel);
  });
});
