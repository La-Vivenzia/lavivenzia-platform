import { NotFoundError, ValidationError } from "@/lib/errors";
import { normalisePaging, type Page } from "@/modules/shared/pagination";
import { parseMoneyToMinor } from "@/lib/format";
import { parseProximity, type ProximityFilter } from "@/modules/discovery/geo";
import {
  SORT_OPTIONS,
  type CategorySummary,
  type Destination,
  type DiscoveryFilters,
  type DiscoveryRepository,
  type ExperienceDetail,
  type ExperienceSummary,
  type SortOption,
} from "@/modules/discovery/ports";

/**
 * Traveller discovery (FR-01, FR-02).
 *
 * The one service in the codebase that takes no `Principal`, because everything
 * it returns is already public. That is a deliberate design statement rather
 * than an omission: adding an authorization check here would imply there is
 * something behind it to protect, and there is not — the port cannot reach an
 * unpublished listing at all.
 *
 * What this service does own is **input hygiene**. Every value reaching it came
 * from a query string a stranger controls.
 */

export interface DiscoveryDependencies {
  readonly discovery: DiscoveryRepository;
}

/** Bounds on caller-supplied filters. All of these arrive from a URL. */
export const DISCOVERY_LIMITS = {
  search: { max: 120 },
  /** Ten million major units — a ceiling, not a pricing policy. */
  price: { max: 1_000_000_000 },
  duration: { max: 60 * 24 * 14 },
  featured: { max: 12 },
  destinations: { max: 60 },
} as const;

export function isSortOption(value: string): value is SortOption {
  return (SORT_OPTIONS as readonly string[]).includes(value);
}

/**
 * Raw filter input, as it arrives from a query string.
 *
 * Everything is a string or absent, which is what a URL gives you. Turning that
 * into the typed `DiscoveryFilters` the repository takes is this module's job,
 * not a route handler's.
 */
export interface RawFilters {
  readonly search?: string | undefined;
  readonly category?: string | undefined;
  readonly destination?: string | undefined;
  readonly minPrice?: string | undefined;
  readonly maxPrice?: string | undefined;
  readonly maxDuration?: string | undefined;
  /** Latitude, longitude and radius in kilometres, as they appear in the URL. */
  readonly lat?: string | undefined;
  readonly lng?: string | undefined;
  readonly radiusKm?: string | undefined;
  readonly sort?: string | undefined;
  readonly page?: string | undefined;
}

/**
 * A price filter, as a person typed it.
 *
 * The query string carries **major units** — someone searching under four
 * thousand rupees types 4000, and that is what appears in the URL they share.
 * The domain works in minor units only, so the conversion happens here, once,
 * at the boundary between the two.
 *
 * Doing it in the page instead was the original mistake: the API route did not,
 * so the same parameter meant two different amounts depending on which entry
 * point read it.
 *
 * Currency is assumed INR while the platform is India-only. Filtering a
 * multi-currency catalogue by a single number is a product question, not an
 * engineering one; see docs/ASSUMPTIONS.md.
 */
function optionalPrice(value: string | undefined, maxMinor: number): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;

  const minor = parseMoneyToMinor(value, "INR");
  if (minor === null) return undefined;

  return Math.min(minor, maxMinor);
}

/** Parse a positive integer, or return undefined. Never throws on junk. */
function optionalInt(value: string | undefined, max: number): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return undefined;

  return Math.min(parsed, max);
}

/**
 * Choose the sort order actually used.
 *
 * Two of the six orders depend on something the query may not carry: relevance
 * needs a term to score against, distance needs a point to measure from. Asking
 * for one without its input is treated as a stale or hand-edited link rather
 * than as an error, and falls back to `recent`.
 *
 * The opposite default matters more. When a traveller types a search term and
 * expresses no preference, ranking by *relevance* is what they meant; ordering
 * by publication date would bury the exact title they typed under whatever was
 * approved most recently. Likewise, a search anchored to a location defaults to
 * nearest-first. `recent` remains the default only for undirected browsing.
 */
export function resolveSort(
  requested: string | undefined,
  context: { readonly hasSearch: boolean; readonly hasLocation: boolean },
): SortOption {
  if (requested && isSortOption(requested)) {
    if (requested === "relevance" && !context.hasSearch) return "recent";
    if (requested === "distance" && !context.hasLocation) return "recent";
    return requested;
  }

  if (context.hasSearch) return "relevance";
  if (context.hasLocation) return "distance";
  return "recent";
}

/**
 * Turn query-string input into filters the repository can trust.
 *
 * Malformed values are **dropped rather than rejected**. A traveller who lands
 * on a link with a mangled `sort` parameter should see experiences, not an
 * error page — this is a browsing surface, and the useful behaviour is to
 * ignore what cannot be understood. Anything that would change *which rows are
 * visible* is not decided here at all; that is fixed in the port.
 */
export function parseFilters(raw: RawFilters): DiscoveryFilters {
  const search = raw.search?.trim().slice(0, DISCOVERY_LIMITS.search.max);
  const minPrice = optionalPrice(raw.minPrice, DISCOVERY_LIMITS.price.max);
  const maxPrice = optionalPrice(raw.maxPrice, DISCOVERY_LIMITS.price.max);

  // An inverted range matches nothing and reads as a bug to the traveller.
  // Swapping is friendlier than an empty page and cannot mislead.
  const [lower, upper] =
    minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice
      ? [maxPrice, minPrice]
      : [minPrice, maxPrice];

  // A malformed coordinate drops the proximity filter rather than failing the
  // request: a traveller whose browser returned a junk position should see
  // everything, not an error page.
  const near: ProximityFilter | null = parseProximity(raw.lat, raw.lng, raw.radiusKm);

  return {
    ...normalisePaging({ page: optionalInt(raw.page, 100_000) ?? 1 }),
    ...(search ? { search } : {}),
    ...(near ? { near } : {}),
    ...(raw.category?.trim() ? { categoryKey: raw.category.trim() } : {}),
    ...(raw.destination?.trim() ? { destinationSlug: raw.destination.trim() } : {}),
    ...(lower !== undefined ? { minPriceMinor: lower } : {}),
    ...(upper !== undefined ? { maxPriceMinor: upper } : {}),
    ...(optionalInt(raw.maxDuration, DISCOVERY_LIMITS.duration.max) !== undefined
      ? { maxDurationMinutes: optionalInt(raw.maxDuration, DISCOVERY_LIMITS.duration.max)! }
      : {}),
    sort: resolveSort(raw.sort, { hasSearch: !!search, hasLocation: near !== null }),
  };
}

export class DiscoveryService {
  readonly #deps: DiscoveryDependencies;

  constructor(deps: DiscoveryDependencies) {
    this.#deps = deps;
  }

  browse(filters: DiscoveryFilters): Promise<Page<ExperienceSummary>> {
    return this.#deps.discovery.listExperiences(filters);
  }

  /**
   * One listing, by slug.
   *
   * By slug and not by id, deliberately. The slug is the public identifier a
   * host chose the title for; the UUID is internal. Keeping internal ids out of
   * traveller-facing URLs means the public surface reveals nothing about how
   * many listings exist or in what order they were created.
   */
  async getExperience(slug: string): Promise<ExperienceDetail> {
    const trimmed = slug.trim();
    if (trimmed === "" || trimmed.length > 120) {
      throw new ValidationError("That is not a valid experience address.");
    }

    const experience = await this.#deps.discovery.findExperienceBySlug(trimmed);

    // A listing that exists but is not published is reported as not found, the
    // same as one that never existed. Anything else would let a stranger probe
    // for listings awaiting review.
    if (!experience) throw new NotFoundError("Experience not found.");

    return experience;
  }

  featured(limit = 6): Promise<readonly ExperienceSummary[]> {
    return this.#deps.discovery.featuredExperiences(
      Math.min(Math.max(limit, 1), DISCOVERY_LIMITS.featured.max),
    );
  }

  destinations(limit?: number): Promise<readonly Destination[]> {
    return this.#deps.discovery.listDestinations(
      limit === undefined
        ? undefined
        : Math.min(Math.max(limit, 1), DISCOVERY_LIMITS.destinations.max),
    );
  }

  async getDestination(slug: string): Promise<Destination> {
    const destination = await this.#deps.discovery.findDestination(slug.trim());
    if (!destination) throw new NotFoundError("Destination not found.");
    return destination;
  }

  categories(): Promise<readonly CategorySummary[]> {
    return this.#deps.discovery.listCategories();
  }

  /**
   * One category, by its public key.
   *
   * Resolved from the same list the filter options are built from rather than
   * by a dedicated lookup, so a category page can exist only for a category
   * that actually has something published in it. A category with nothing in it
   * is not a 200 with an empty grid — it is a dead end, and reporting it as
   * not-found is the honest answer. Destinations behave the same way (A-013).
   */
  async getCategory(key: string): Promise<CategorySummary> {
    const trimmed = key.trim();
    if (trimmed === "" || trimmed.length > 120) {
      throw new ValidationError("That is not a valid category address.");
    }

    const category = (await this.categories()).find((entry) => entry.key === trimmed);
    if (!category) throw new NotFoundError("Category not found.");

    return category;
  }
}
