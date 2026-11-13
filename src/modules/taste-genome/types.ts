import { CURATION_TRACKS, type CurationTrack } from "@/modules/discovery/curation";

/**
 * The Taste Genome — a patron's evening preferences as a weight vector.
 *
 * `moodWeights` is a probability distribution over the five curation tracks:
 * every weight is in [0, 1] and they sum to 1. Calibration seeds it from the
 * onboarding answers; telemetry then nudges it as the patron browses.
 *
 * Plain data with no imports beyond curation, so the onboarding modal can read
 * the option lists without pulling the repository into the browser bundle.
 */

export interface TasteGenome {
  /** `user:<id>` for a signed-in patron, `guest:<uuid>` otherwise. */
  readonly patronId: string;
  /** Normalised: every weight in [0, 1], summing to 1. */
  readonly moodWeights: Record<CurationTrack, number>;
  readonly palatePreferences: string[];
  readonly companionProfile: string;
  readonly activeHub: string;
  readonly calibrated: boolean;
  readonly interactionCount: number;
  /** ISO-8601. */
  readonly updatedAt: string;
}

export const TELEMETRY_EVENT_TYPES = [
  "card_view",
  "card_dwell",
  "card_click",
  "search_query",
  "category_filter",
] as const;

export type TelemetryEventType = (typeof TELEMETRY_EVENT_TYPES)[number];

export interface TelemetryEvent {
  readonly type: TelemetryEventType;
  readonly experienceId?: string;
  readonly track?: CurationTrack;
  readonly query?: string;
  readonly dwellSeconds?: number;
  /** ISO-8601. */
  readonly timestamp: string;
}

/* ------------------------------------------------------------ onboarding */

/** Step 1 reuses the curation tracks, so a mood is always a track. */
export const MOOD_OPTIONS: readonly CurationTrack[] = CURATION_TRACKS;

export const MOOD_LABELS: Readonly<Record<CurationTrack, string>> = {
  CONNOISSEUR: "Connoisseur",
  ALFRESCO_SUNDOWNER: "Alfresco Sundowner",
  HIGH_OCTANE_NIGHTLIFE: "High-Octane Nightlife",
  MINDFUL_WELLNESS: "Mindful Wellness",
  ARTISANAL_FOCUS: "Artisanal Focus",
};

export const PALATE_OPTIONS = [
  "ARTISANAL_CRAFT_WINE",
  "HAUTE_CUISINE",
  "VEGETARIAN_JAIN_FINE_DINING",
  "MODERN_GASTRONOMY",
] as const;

export type PalatePreference = (typeof PALATE_OPTIONS)[number];

export const PALATE_LABELS: Readonly<Record<PalatePreference, string>> = {
  ARTISANAL_CRAFT_WINE: "Artisanal Craft & Wine",
  HAUTE_CUISINE: "Haute Cuisine",
  VEGETARIAN_JAIN_FINE_DINING: "Vegetarian / Jain Fine Dining",
  MODERN_GASTRONOMY: "Modern Gastronomy",
};

export const COMPANION_OPTIONS = [
  "INTIMATE_DATE",
  "BUSINESS_DINNER",
  "SOCIAL_CIRCLE",
  "SOLO_DISCOVERY",
] as const;

export type CompanionProfile = (typeof COMPANION_OPTIONS)[number];

export const COMPANION_LABELS: Readonly<Record<CompanionProfile, string>> = {
  INTIMATE_DATE: "Intimate Date",
  BUSINESS_DINNER: "Business Dinner",
  SOCIAL_CIRCLE: "Social Circle",
  SOLO_DISCOVERY: "Solo Discovery",
};

/** Only the pilot corridor is live; the others are announced, not selectable. */
export const HUB_OPTIONS = ["EAST_PUNE"] as const;

export type DestinationHub = (typeof HUB_OPTIONS)[number];

export const HUB_LABELS: Readonly<Record<DestinationHub, string>> = {
  EAST_PUNE: "East Pune Pilot Corridor",
};

export const UPCOMING_HUBS: readonly string[] = ["Mumbai", "Delhi", "Dubai"];

export const DEFAULT_HUB: DestinationHub = "EAST_PUNE";

export interface CalibrationAnswers {
  readonly mood: CurationTrack;
  readonly palate: readonly PalatePreference[];
  readonly companion: CompanionProfile;
  readonly hub: DestinationHub;
}

/** Set once the patron has calibrated or skipped; its presence hides the modal. */
export const CALIBRATED_STORAGE_KEY = "lv_taste_genome_calibrated";
