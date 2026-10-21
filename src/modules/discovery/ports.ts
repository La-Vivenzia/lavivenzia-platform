import type { Page } from "@/modules/shared/pagination";
import type { PricingUnit } from "@/modules/experiences/readiness";
import type { ProximityFilter } from "@/modules/discovery/geo";

/**
 * Traveller-facing discovery (FR-01, FR-02).
 *
 * **Every method on this port returns published listings and nothing else.**
 * That is not a filter a caller may pass or omit — there is no status parameter
 * anywhere in this interface, so a draft, a listing awaiting review and a
 * suspended one are unreachable through it by construction rather than by
 * remembering to add a `where` clause.
 *
 * The operations port reads across every status and is gated on
 * `experience:read:all`. This one needs no permission, because everything it
 * can see is already public.
 */

/** A listing as a traveller browses it. Deliberately narrower than the host view. */
export interface ExperienceSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string;
  readonly categoryKey: string | null;
  readonly categoryName: string | null;
  readonly durationMinutes: number | null;
  readonly minGuests: number;
  readonly maxGuests: number | null;
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly pricingUnit: PricingUnit;
  readonly coverUrl: string | null;
  readonly coverAlt: string | null;
  readonly hostName: string;
  readonly publishedAt: Date | null;
  /**
   * Straight-line distance from the point the traveller searched from, in
   * metres. Null whenever the query carried no location, which is most of the
   * time — this is a property of the *search*, not of the listing.
   */
  readonly distanceMetres: number | null;
}

export interface ExperienceImage {
  readonly id: string;
  readonly url: string;
  readonly altText: string | null;
}

/**
 * A listing on its own page.
 *
 * Carries the host's public identity only — display name, headline, about,
 * city. The contact email, phone and legal name a host gave us are operational
 * detail and are deliberately absent from this shape, so no traveller-facing
 * template can render them by accident.
 */
export interface ExperienceDetail extends ExperienceSummary {
  readonly description: string | null;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly languages: readonly string[];
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly guestNotes: string | null;
  readonly images: readonly ExperienceImage[];
  readonly host: {
    readonly displayName: string;
    readonly headline: string | null;
    readonly about: string | null;
    readonly city: string | null;
    readonly isVerified: boolean;
  };
}

/**
 * A destination, derived rather than stored.
 *
 * There is no `Destination` table: destinations are the distinct cities that
 * currently have something published in them. See docs/ASSUMPTIONS.md → A-013
 * for why a destination entity is a content decision rather than an engineering
 * one, and what changes when it lands.
 */
export interface Destination {
  readonly slug: string;
  readonly city: string;
  readonly region: string | null;
  readonly country: string;
  readonly experienceCount: number;
  readonly coverUrl: string | null;
}

export interface CategorySummary {
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly experienceCount: number;
}

/**
 * Sort orders a traveller may ask for.
 *
 * `relevance` and `distance` are conditional: relevance needs a search term to
 * score against, and distance needs a location to measure from. Asking for
 * either without its input is not an error — the service falls back to
 * `recent`, because a browsing surface should show results rather than explain
 * itself.
 */
export const SORT_OPTIONS = [
  "relevance",
  "recent",
  "distance",
  "price_asc",
  "price_desc",
  "duration_asc",
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export interface DiscoveryFilters {
  /** Free text over title, summary, city and host name. */
  readonly search?: string;
  readonly categoryKey?: string;
  readonly destinationSlug?: string;
  readonly minPriceMinor?: number;
  readonly maxPriceMinor?: number;
  readonly maxDurationMinutes?: number;
  /**
   * Restrict to listings within a radius of a point (FR-03).
   *
   * Applied in PostgreSQL against the GiST-indexed `geo` column, never by
   * filtering rows in JavaScript: the index is the entire reason the spatial
   * column exists (ADR-0008).
   */
  readonly near?: ProximityFilter;
  readonly sort?: SortOption;
  readonly page: number;
  readonly pageSize: number;
}

export interface DiscoveryRepository {
  listExperiences(filters: DiscoveryFilters): Promise<Page<ExperienceSummary>>;
  /** By public slug, never by internal id — see the note in the service. */
  findExperienceBySlug(slug: string): Promise<ExperienceDetail | null>;
  /** A handful for the homepage, most recently published first. */
  featuredExperiences(limit: number): Promise<readonly ExperienceSummary[]>;
  listDestinations(limit?: number): Promise<readonly Destination[]>;
  findDestination(slug: string): Promise<Destination | null>;
  /** Only categories that currently have something published in them. */
  listCategories(): Promise<readonly CategorySummary[]>;
}
