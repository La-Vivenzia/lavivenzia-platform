import type { CurationTrack } from "@/modules/discovery/curation";

/**
 * The Taste Genome — who a patron is at the table, not how they feel tonight.
 *
 * Two halves. `taste` is the permanent identity the patron declares during
 * onboarding: dietary philosophy, bar palate, seating and acoustic comfort.
 * Those do not drift from one evening to the next, so they are stored as
 * answers, never decayed. `trackAffinity` is the ranking hint derived from
 * them — a probability distribution over the five curation tracks, seeded by
 * calibration and nudged by browsing telemetry.
 *
 * Mood is deliberately absent. An evening's mood is asked for in the moment
 * (search, copilot), where it belongs; baking it into an identity would make
 * every later visit lean towards one night's whim.
 *
 * Plain data with no runtime imports, so the onboarding modal can read the
 * option lists without pulling the repository into the browser bundle.
 */

/*
 * Option keys are what is stored; labels are what is shown. A key is never
 * renamed once shipped, because stored genomes would silently stop matching
 * it — add a new key and retire the old one instead.
 */

export const DIETARY_PHILOSOPHIES = [
  "PURE_VEGETARIAN",
  "JAIN_HAUTE",
  "SEAFOOD_CARNIVORE",
  "VEGAN_BOTANICAL",
  "OMNIVORE_FLEXIBLE",
] as const;

export type DietaryPhilosophy = (typeof DIETARY_PHILOSOPHIES)[number];

export const DIETARY_LABELS: Readonly<Record<DietaryPhilosophy, string>> = {
  PURE_VEGETARIAN: "Pure Vegetarian",
  JAIN_HAUTE: "Jain Haute Cuisine",
  SEAFOOD_CARNIVORE: "Seafood & Carnivore",
  VEGAN_BOTANICAL: "Vegan Botanical",
  OMNIVORE_FLEXIBLE: "Omnivore, Flexible",
};

export const BEVERAGE_PALATES = [
  "SINGLE_MALT_SPIRITS",
  "CRAFT_BREW_ARTISANAL",
  "FINE_WINE_CHAMPAGNE",
  "BOTANICAL_MIXOLOGY",
  "ZERO_PROOF_TEMPERANCE",
] as const;

export type BeveragePalate = (typeof BEVERAGE_PALATES)[number];

export const BEVERAGE_LABELS: Readonly<Record<BeveragePalate, string>> = {
  SINGLE_MALT_SPIRITS: "Single Malt & Spirits",
  CRAFT_BREW_ARTISANAL: "Craft & Artisanal Brews",
  FINE_WINE_CHAMPAGNE: "Fine Wine & Champagne",
  BOTANICAL_MIXOLOGY: "Botanical Mixology",
  ZERO_PROOF_TEMPERANCE: "Zero-Proof",
};

export const SEATING_PREFERENCES = [
  "SECLUDED_BOOTH",
  "ALFRESCO_ROOFTOP",
  "CHEF_COUNTER",
  "PRIVATE_DINING_SALON",
] as const;

export type SeatingPreference = (typeof SEATING_PREFERENCES)[number];

export const SEATING_LABELS: Readonly<Record<SeatingPreference, string>> = {
  SECLUDED_BOOTH: "Secluded Booth",
  ALFRESCO_ROOFTOP: "Alfresco Rooftop",
  CHEF_COUNTER: "Chef’s Counter",
  PRIVATE_DINING_SALON: "Private Dining Salon",
};

export const ACOUSTIC_COMFORTS = [
  "WHISPER_CONVERSATION",
  "LIVE_JAZZ_ACOUSTIC",
  "UPBEAT_LOUNGE",
] as const;

export type AcousticComfort = (typeof ACOUSTIC_COMFORTS)[number];

export const ACOUSTIC_LABELS: Readonly<Record<AcousticComfort, string>> = {
  WHISPER_CONVERSATION: "Whisper-Quiet Conversation",
  LIVE_JAZZ_ACOUSTIC: "Live Jazz & Acoustic",
  UPBEAT_LOUNGE: "Upbeat Lounge",
};

/** What onboarding asks. Beverage is multi-select; the rest are one answer each. */
export interface CalibrationAnswers {
  readonly dietary: DietaryPhilosophy;
  readonly beverages: readonly BeveragePalate[];
  readonly seating: SeatingPreference;
  readonly acoustic: AcousticComfort;
}

/** The declared half of a genome. Null until the patron calibrates. */
export interface TasteProfile {
  readonly dietary: DietaryPhilosophy | null;
  readonly beverages: readonly BeveragePalate[];
  readonly seating: SeatingPreference | null;
  readonly acoustic: AcousticComfort | null;
}

export interface TasteGenome {
  /** `user:<id>` for a signed-in patron, `guest:<uuid>` otherwise. */
  readonly patronId: string;
  readonly taste: TasteProfile;
  /** Normalised: every weight in [0, 1], summing to 1. */
  readonly trackAffinity: Record<CurationTrack, number>;
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

/**
 * Set once the patron has calibrated or skipped; its presence hides the modal.
 *
 * Versioned: the mood-based v1 quiz asked different questions, so anyone who
 * answered it is asked the permanent-taste questions once more.
 */
export const CALIBRATED_STORAGE_KEY = "lv_taste_genome_calibrated_v2";
