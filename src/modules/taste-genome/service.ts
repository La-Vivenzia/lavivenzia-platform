import type { CurationTrack } from "@/modules/discovery/curation";
import {
  defaultGenome,
  getTasteGenome,
  normalizeWeights,
  recordTelemetry,
  saveTasteGenome,
} from "./repository";
import type {
  CalibrationAnswers,
  CompanionProfile,
  PalatePreference,
  TasteGenome,
  TelemetryEvent,
} from "./types";

/**
 * Taste Genome use cases: read, calibrate from onboarding, learn from browsing.
 *
 * The genome is a ranking hint only. Nothing here states availability, price
 * or policy (CLAUDE.md §7); it decides which curated tracks to lead with.
 */

/*
 * Calibration priors. Every track keeps a base weight so no mood is ever
 * ruled out by one quiz; the chosen mood dominates, and palate and companion
 * lean towards the tracks they most often pair with.
 */
const BASE_WEIGHT = 1;
const MOOD_WEIGHT = 3;
const PALATE_WEIGHT = 0.5;
const COMPANION_WEIGHT = 1;

const PALATE_TRACKS: Readonly<Record<PalatePreference, CurationTrack>> = {
  ARTISANAL_CRAFT_WINE: "ARTISANAL_FOCUS",
  HAUTE_CUISINE: "CONNOISSEUR",
  VEGETARIAN_JAIN_FINE_DINING: "MINDFUL_WELLNESS",
  MODERN_GASTRONOMY: "CONNOISSEUR",
};

const COMPANION_TRACKS: Readonly<Record<CompanionProfile, CurationTrack>> = {
  INTIMATE_DATE: "ALFRESCO_SUNDOWNER",
  BUSINESS_DINNER: "CONNOISSEUR",
  SOCIAL_CIRCLE: "HIGH_OCTANE_NIGHTLIFE",
  SOLO_DISCOVERY: "ARTISANAL_FOCUS",
};

export function calibratedWeights(answers: CalibrationAnswers): Record<CurationTrack, number> {
  const raw: Record<CurationTrack, number> = {
    CONNOISSEUR: BASE_WEIGHT,
    ALFRESCO_SUNDOWNER: BASE_WEIGHT,
    HIGH_OCTANE_NIGHTLIFE: BASE_WEIGHT,
    MINDFUL_WELLNESS: BASE_WEIGHT,
    ARTISANAL_FOCUS: BASE_WEIGHT,
  };
  raw[answers.mood] += MOOD_WEIGHT;
  for (const palate of new Set(answers.palate)) raw[PALATE_TRACKS[palate]] += PALATE_WEIGHT;
  raw[COMPANION_TRACKS[answers.companion]] += COMPANION_WEIGHT;
  return normalizeWeights(raw);
}

/** The stored genome, or an uncalibrated uniform one. Reading never creates a session. */
export function getGenome(patronId: string, now: Date = new Date()): TasteGenome {
  return getTasteGenome(patronId) ?? defaultGenome(patronId, now);
}

/**
 * Seed the genome from onboarding answers.
 *
 * Recalibrating replaces the weights — the patron has told us directly, which
 * outranks anything inferred — but keeps the interaction count, which is a
 * history rather than a preference.
 */
export function calibrate(
  patronId: string,
  answers: CalibrationAnswers,
  now: Date = new Date(),
): TasteGenome {
  const current = getGenome(patronId, now);
  return saveTasteGenome({
    ...current,
    moodWeights: calibratedWeights(answers),
    palatePreferences: [...new Set(answers.palate)],
    companionProfile: answers.companion,
    activeHub: answers.hub,
    calibrated: true,
    updatedAt: now.toISOString(),
  });
}

export function processTelemetry(
  patronId: string,
  events: readonly TelemetryEvent[],
  now: Date = new Date(),
): TasteGenome {
  return recordTelemetry(patronId, events, now);
}
