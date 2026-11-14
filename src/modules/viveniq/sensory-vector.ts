import type { CurationTrack } from "@/modules/discovery/curation";
import {
  SEATING_PRIVACY_LEVELS,
  type Journey,
  type SeatingPrivacy,
  type SensoryProfile,
} from "@/modules/journeys/data";
import type { AcousticComfort, SeatingPreference, TasteGenome } from "@/modules/taste-genome/types";

/**
 * Sensory match — how closely a journey's room feel suits a patron's declared
 * taste, as a 0–100 score with the reasons it scored well.
 *
 * Deterministic (CLAUDE.md §7): the genome's declared answers are mapped onto
 * fixed targets, and each dimension is a distance from that target. Nothing is
 * inferred about availability, price or the venue; the journey side is the
 * curators' editorial `SensoryProfile`, so the highlights describe a feel
 * ("conversation-quiet") and never quote decibels or lux as measurements.
 *
 * Four dimensions, each scored 0–1:
 *
 * - **acoustic** — profile decibels against the patron's acoustic comfort.
 * - **seating** — profile privacy against the patron's seating preference.
 * - **lighting** — profile lux against a target implied by those two answers,
 *   compared on a log scale because the eye reads light that way.
 * - **contrast** — how much the acts swing, against the swing implied by the
 *   patron's track affinity.
 *
 * A dimension the genome cannot speak to is left out and the remaining weights
 * renormalised. When none can be scored the match is `null` — a guess
 * presented as a percentage would be an invented number.
 */

export type SensoryDimension = "acoustic" | "seating" | "lighting" | "contrast";

export interface SensoryMatch {
  /** 0–100, or null when the genome declares nothing comparable. */
  readonly score: number | null;
  /** Why it matched, strongest first. Empty when nothing matched well. */
  readonly highlights: readonly string[];
  /** Each scored dimension in [0, 1]; an unscored dimension is absent. */
  readonly dimensions: Readonly<Partial<Record<SensoryDimension, number>>>;
}

const WEIGHTS: Readonly<Record<SensoryDimension, number>> = {
  acoustic: 0.35,
  seating: 0.3,
  lighting: 0.2,
  contrast: 0.15,
};

/** A dimension at or above this earns a highlight. */
export const HIGHLIGHT_THRESHOLD = 0.75;

/** Typical dB(A) each acoustic comfort is happiest at. */
const ACOUSTIC_TARGET_DB: Readonly<Record<AcousticComfort, number>> = {
  WHISPER_CONVERSATION: 45,
  LIVE_JAZZ_ACOUSTIC: 64,
  UPBEAT_LOUNGE: 80,
};

/** A room this many decibels off the target scores zero on acoustics. */
const ACOUSTIC_TOLERANCE_DB = 25;

const SEATING_TARGET_PRIVACY: Readonly<Record<SeatingPreference, SeatingPrivacy>> = {
  ALFRESCO_ROOFTOP: "open",
  CHEF_COUNTER: "semi-private",
  SECLUDED_BOOTH: "secluded",
  PRIVATE_DINING_SALON: "private",
};

const ACOUSTIC_TARGET_LUX: Readonly<Record<AcousticComfort, number>> = {
  WHISPER_CONVERSATION: 60,
  LIVE_JAZZ_ACOUSTIC: 100,
  UPBEAT_LOUNGE: 220,
};

const SEATING_TARGET_LUX: Readonly<Record<SeatingPreference, number>> = {
  ALFRESCO_ROOFTOP: 150,
  CHEF_COUNTER: 300,
  SECLUDED_BOOTH: 50,
  PRIVATE_DINING_SALON: 80,
};

/** A full order of magnitude off the target light scores zero. */
const LIGHTING_TOLERANCE_DECADES = 1;

/** How much swing between acts each track enjoys, 0 to 1. */
const TRACK_CONTRAST: Readonly<Record<CurationTrack, number>> = {
  CONNOISSEUR: 0.45,
  ALFRESCO_SUNDOWNER: 0.5,
  HIGH_OCTANE_NIGHTLIFE: 0.9,
  MINDFUL_WELLNESS: 0.2,
  ARTISANAL_FOCUS: 0.35,
};

const ACOUSTIC_HIGHLIGHTS: Readonly<Record<AcousticComfort, string>> = {
  WHISPER_CONVERSATION: "Quiet enough to talk without raising your voice",
  LIVE_JAZZ_ACOUSTIC: "A warm murmur, with room left for conversation",
  UPBEAT_LOUNGE: "The high-energy buzz you like in a room",
};

const SEATING_HIGHLIGHTS: Readonly<Record<SeatingPrivacy, string>> = {
  open: "Open, sociable seating",
  "semi-private": "Semi-private corners close to the action",
  secluded: "Tucked-away tables, away from the floor",
  private: "Settings kept to your party alone",
};

function lightingHighlight(lux: number): string {
  if (lux < 70) return "Candle-dim tables";
  if (lux < 200) return "Soft, low light";
  return "Bright, daylight-warm rooms";
}

function contrastHighlight(contrast: number): string {
  if (contrast < 0.4) return "One unbroken mood from first act to last";
  if (contrast < 0.7) return "Acts that shift gently in tone";
  return "A deliberate swing in energy from one act to the next";
}

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

function scoreAcoustic(profile: SensoryProfile, comfort: AcousticComfort): number {
  const distance = Math.abs(profile.acousticDecibels - ACOUSTIC_TARGET_DB[comfort]);
  return clampUnit(1 - distance / ACOUSTIC_TOLERANCE_DB);
}

function scoreSeating(profile: SensoryProfile, preference: SeatingPreference): number {
  const steps = Math.abs(
    SEATING_PRIVACY_LEVELS.indexOf(profile.seatingPrivacy) -
      SEATING_PRIVACY_LEVELS.indexOf(SEATING_TARGET_PRIVACY[preference]),
  );
  return clampUnit(1 - steps / (SEATING_PRIVACY_LEVELS.length - 1));
}

/** Geometric mean of the targets the declared answers imply, or null. */
function lightingTarget(
  comfort: AcousticComfort | null,
  seating: SeatingPreference | null,
): number | null {
  const targets = [
    comfort ? ACOUSTIC_TARGET_LUX[comfort] : null,
    seating ? SEATING_TARGET_LUX[seating] : null,
  ].filter((lux): lux is number => lux !== null);
  if (targets.length === 0) return null;
  const meanLog = targets.reduce((sum, lux) => sum + Math.log10(lux), 0) / targets.length;
  return 10 ** meanLog;
}

function scoreLighting(profile: SensoryProfile, targetLux: number): number {
  const decades = Math.abs(Math.log10(profile.lightingLux) - Math.log10(targetLux));
  return clampUnit(1 - decades / LIGHTING_TOLERANCE_DECADES);
}

/**
 * The swing the patron's affinity implies, or null while the affinity is
 * still the untouched prior — neither calibrated nor nudged by browsing.
 */
function contrastTarget(genome: TasteGenome): number | null {
  if (!genome.calibrated && genome.interactionCount === 0) return null;
  let target = 0;
  let total = 0;
  for (const [track, weight] of Object.entries(genome.trackAffinity) as [CurationTrack, number][]) {
    if (!Number.isFinite(weight) || weight <= 0) continue;
    target += weight * TRACK_CONTRAST[track];
    total += weight;
  }
  return total > 0 ? target / total : null;
}

export function computeSensoryMatch(
  genome: TasteGenome,
  journey: Pick<Journey, "sensoryProfile">,
): SensoryMatch {
  const profile = journey.sensoryProfile;
  const { acoustic, seating } = genome.taste;

  const scored: { dimension: SensoryDimension; score: number; highlight: string }[] = [];

  if (acoustic) {
    scored.push({
      dimension: "acoustic",
      score: scoreAcoustic(profile, acoustic),
      highlight: ACOUSTIC_HIGHLIGHTS[acoustic],
    });
  }
  if (seating) {
    scored.push({
      dimension: "seating",
      score: scoreSeating(profile, seating),
      highlight: SEATING_HIGHLIGHTS[profile.seatingPrivacy],
    });
  }
  const targetLux = lightingTarget(acoustic, seating);
  if (targetLux !== null) {
    scored.push({
      dimension: "lighting",
      score: scoreLighting(profile, targetLux),
      highlight: lightingHighlight(profile.lightingLux),
    });
  }
  const targetContrast = contrastTarget(genome);
  if (targetContrast !== null) {
    scored.push({
      dimension: "contrast",
      score: clampUnit(1 - Math.abs(profile.sensoryContrast - targetContrast)),
      highlight: contrastHighlight(profile.sensoryContrast),
    });
  }

  if (scored.length === 0) return { score: null, highlights: [], dimensions: {} };

  const totalWeight = scored.reduce((sum, entry) => sum + WEIGHTS[entry.dimension], 0);
  const weighted = scored.reduce((sum, entry) => sum + WEIGHTS[entry.dimension] * entry.score, 0);

  const highlights = scored
    .filter((entry) => entry.score >= HIGHLIGHT_THRESHOLD)
    .sort((a, b) => WEIGHTS[b.dimension] * b.score - WEIGHTS[a.dimension] * a.score)
    .map((entry) => entry.highlight);

  return {
    score: Math.round((weighted / totalWeight) * 100),
    highlights,
    dimensions: Object.fromEntries(scored.map((entry) => [entry.dimension, entry.score])),
  };
}

/** A journey's sensory profile in words, for the page. Never the raw figures. */
export interface SensoryDescription {
  readonly acousticFeel: string;
  readonly lighting: string;
  readonly seatingPrivacy: string;
  readonly secretRitual: string;
}

function acousticFeel(decibels: number): string {
  if (decibels < 50) return "Conversation-quiet";
  if (decibels < 70) return "A warm murmur, room left to talk";
  return "A lively, high-energy buzz";
}

export function describeSensoryProfile(profile: SensoryProfile): SensoryDescription {
  return {
    acousticFeel: acousticFeel(profile.acousticDecibels),
    lighting: lightingHighlight(profile.lightingLux),
    seatingPrivacy: SEATING_HIGHLIGHTS[profile.seatingPrivacy],
    secretRitual: profile.secretRitual,
  };
}
