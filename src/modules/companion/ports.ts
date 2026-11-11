import type { CurationTrack } from "@/modules/discovery/curation";
import type { DiscoveryService } from "@/modules/discovery/service";
import type { TravelPreferences } from "@/modules/user-profile/profile";
import type { EmailPort } from "@/ports/email";

/**
 * The in-journey live butler (companion engine).
 *
 * A traveller already at one of our experiences is the most valuable moment
 * to be useful: they are out, they are in the mood, and they are a short walk
 * from somewhere else we have curated. The companion reads where they are,
 * finds what complements it nearby, and writes to them like a butler would.
 *
 * It reads the catalogue only through discovery — published listings, by
 * construction — and speaks only through the email port. It never states
 * availability; the email points at the experience page, where slots are live.
 */

/** The slice of discovery the companion reads. */
export type CompanionCatalogue = Pick<DiscoveryService, "getExperience" | "browse">;

export interface CompanionDependencies {
  readonly catalogue: CompanionCatalogue;
  readonly email: EmailPort;
  /** Public origin used to build experience links, e.g. https://lavivenzia.com. */
  readonly appUrl: string;
}

export interface InJourneyRequest {
  /** The experience the traveller is at right now. */
  readonly activeExperienceSlug: string;
  readonly patronName?: string | undefined;
  readonly tastePreferences?: TravelPreferences | null | undefined;
  /** How many gems to return. Defaults to two; bounded by the service. */
  readonly limit?: number | undefined;
}

export type TravelMode = "walk" | "drive";

export interface CompanionRecommendation {
  readonly slug: string;
  readonly title: string;
  readonly categoryName: string | null;
  readonly track: CurationTrack;
  readonly trackLabel: string;
  /** Straight-line distance from the active venue. */
  readonly distanceMetres: number;
  readonly mode: TravelMode;
  /** Estimated minutes on foot or by car. An estimate, and labelled as one. */
  readonly minutes: number;
  /** e.g. "~6-min walk · 450 m". */
  readonly distanceOrTime: string;
  readonly vipPerk: string;
  readonly curatorSecret: string;
  readonly curatedPairing: string | null;
  readonly experienceUrl: string;
}

export interface InJourneyRecommendations {
  readonly active: {
    readonly slug: string;
    readonly title: string;
    /** The neighbourhood the traveller is in, e.g. "Kalyani Nagar". */
    readonly zone: string;
  };
  readonly patronName: string;
  /** A short, personal note composed from the facts below. */
  readonly butlerNote: string;
  readonly recommendations: readonly CompanionRecommendation[];
}

export interface CompanionDispatchInput extends InJourneyRequest {
  /** Recipient. The route decides who may be written to; the service does not. */
  readonly to: string;
}

export interface CompanionDispatchResult extends InJourneyRecommendations {
  readonly providerMessageId: string;
}
