import { toPage, type Page } from "@/modules/shared/pagination";
import { slugify } from "@/modules/experiences/slug";
import { CATEGORY_DEFINITIONS } from "@/modules/experiences/categories";
import { PILOT_EXPERIENCES, PILOT_HOST, PILOT_LANGUAGES } from "@/data/pune-pilot";
import type { UrlResolver } from "@/adapters/persistence/prisma/experience-repositories";
import type {
  CategorySummary,
  Destination,
  DiscoveryFilters,
  DiscoveryRepository,
  ExperienceDetail,
  ExperienceSummary,
} from "@/modules/discovery/ports";
import type { Coordinates } from "@/modules/discovery/geo";

/**
 * The Pune pilot catalogue, served from memory.
 *
 * **Only for when PostgreSQL cannot be reached, and never in production.** The
 * Prisma repository falls back to this when its connection fails and the
 * fallback has been enabled at wiring (see `createDiscoveryRepository`), so a
 * developer or a preview without a database still sees a working homepage and
 * copilot rather than a crash.
 *
 * Every fact here — price, duration, guests, coordinates — is the exact value
 * `scripts/seed-pune-pilot.ts` publishes, read from the same module. Nothing is
 * invented to fill the gap. What it does *not* have is availability or
 * booking state, and it does not pretend to: those live in the database and
 * fail honestly when it is down.
 *
 * Filtering mirrors the SQL stage, with two deliberate simplifications that
 * only matter at a scale this catalogue never reaches: keyword search is a
 * case-insensitive substring match without trigram typo tolerance, and
 * distance is great-circle on a sphere rather than on the spheroid.
 */

const EARTH_RADIUS_METRES = 6_371_008.8;

/** Haversine distance. Within a fraction of a per cent of PostGIS at city scale. */
function distanceBetween(a: Coordinates, b: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
}

const categoryByKey = new Map(CATEGORY_DEFINITIONS.map((category) => [category.key, category]));

export function createPilotDiscoveryRepository(urlFor: UrlResolver): DiscoveryRepository {
  // Built per repository rather than at module load, because `urlFor` depends
  // on the storage configuration the caller wired.
  const catalogue: readonly ExperienceDetail[] = PILOT_EXPERIENCES.map((input) => {
    const coverUrl = urlFor(input.coverImageKey);

    return {
      // Stable, recognisable, and impossible to confuse with a database uuid.
      id: `pilot-${input.slug}`,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      city: input.city,
      region: input.region,
      country: PILOT_HOST.country,
      categoryKey: categoryByKey.has(input.categoryKey) ? input.categoryKey : null,
      categoryName: categoryByKey.get(input.categoryKey)?.name ?? null,
      durationMinutes: input.durationMinutes,
      minGuests: input.minGuests,
      maxGuests: input.maxGuests,
      basePriceMinor: input.basePriceMinor,
      currency: "INR",
      pricingUnit: input.pricingUnit,
      coverUrl,
      coverAlt: input.altText,
      hostName: PILOT_HOST.displayName,
      // Unknown without the database. Null rather than a made-up date.
      publishedAt: null,
      distanceMetres: null,
      description: input.description,
      addressLine: input.addressLine,
      postalCode: input.postalCode,
      latitude: input.latitude,
      longitude: input.longitude,
      languages: PILOT_LANGUAGES,
      inclusions: input.inclusions,
      exclusions: input.exclusions,
      guestNotes: input.guestNotes,
      images: [{ id: `pilot-${input.slug}-cover`, url: coverUrl, altText: input.altText }],
      host: {
        displayName: PILOT_HOST.displayName,
        headline: PILOT_HOST.headline,
        about: PILOT_HOST.about,
        city: PILOT_HOST.city,
        isVerified: true,
      },
    };
  });

  /** The card shape, so a detail-only field never leaks into a list. */
  function toSummary(detail: ExperienceDetail, distanceMetres: number | null): ExperienceSummary {
    return {
      id: detail.id,
      slug: detail.slug,
      title: detail.title,
      summary: detail.summary,
      city: detail.city,
      region: detail.region,
      country: detail.country,
      categoryKey: detail.categoryKey,
      categoryName: detail.categoryName,
      durationMinutes: detail.durationMinutes,
      minGuests: detail.minGuests,
      maxGuests: detail.maxGuests,
      basePriceMinor: detail.basePriceMinor,
      currency: detail.currency,
      pricingUnit: detail.pricingUnit,
      coverUrl: detail.coverUrl,
      coverAlt: detail.coverAlt,
      hostName: detail.hostName,
      publishedAt: detail.publishedAt,
      distanceMetres,
    };
  }

  function matchesTerm(detail: ExperienceDetail, term: string): boolean {
    const needle = term.toLowerCase();
    return [detail.title, detail.summary, detail.city, detail.hostName].some((field) =>
      field?.toLowerCase().includes(needle),
    );
  }

  /** A title hit outranks a hit anywhere else, as the SQL weights intend. */
  function relevance(detail: ExperienceDetail, term: string | undefined): number {
    if (!term) return 0;
    return detail.title.toLowerCase().includes(term.toLowerCase()) ? 1 : 0;
  }

  function listDestinationsSync(limit?: number): readonly Destination[] {
    const byCity = new Map<string, { first: ExperienceDetail; count: number }>();

    for (const detail of catalogue) {
      if (!detail.city) continue;
      const entry = byCity.get(detail.city);
      if (entry) entry.count += 1;
      else byCity.set(detail.city, { first: detail, count: 1 });
    }

    const destinations = [...byCity.values()]
      .sort((a, b) => b.count - a.count)
      .map(({ first, count }) => ({
        slug: slugify(first.city!),
        city: first.city!,
        region: first.region,
        country: first.country,
        experienceCount: count,
        coverUrl: first.coverUrl,
      }));

    return limit === undefined ? destinations : destinations.slice(0, limit);
  }

  return {
    async listExperiences(filters: DiscoveryFilters): Promise<Page<ExperienceSummary>> {
      const term = filters.search?.trim();
      const near = filters.near;

      const matched = catalogue
        .filter((detail) => {
          if (
            filters.destinationSlug &&
            (!detail.city || slugify(detail.city) !== filters.destinationSlug)
          ) {
            return false;
          }
          if (filters.categoryKey && detail.categoryKey !== filters.categoryKey) return false;
          // A null price or duration fails a bound, as the SQL comparison does.
          if (
            filters.minPriceMinor !== undefined &&
            (detail.basePriceMinor === null || detail.basePriceMinor < filters.minPriceMinor)
          ) {
            return false;
          }
          if (
            filters.maxPriceMinor !== undefined &&
            (detail.basePriceMinor === null || detail.basePriceMinor > filters.maxPriceMinor)
          ) {
            return false;
          }
          if (
            filters.maxDurationMinutes !== undefined &&
            (detail.durationMinutes === null || detail.durationMinutes > filters.maxDurationMinutes)
          ) {
            return false;
          }
          if (term && !matchesTerm(detail, term)) return false;
          return true;
        })
        .map((detail) => {
          const distance =
            near && detail.latitude !== null && detail.longitude !== null
              ? distanceBetween(near, { latitude: detail.latitude, longitude: detail.longitude })
              : null;
          return { detail, distance };
        })
        // Without coordinates a listing cannot be said to be near.
        .filter(({ distance }) => !near || (distance !== null && distance <= near.radiusMetres));

      const sort = filters.sort ?? "recent";
      const last = Number.POSITIVE_INFINITY;

      // `Array.prototype.sort` is stable, so ties keep catalogue order — which
      // stands in for "most recently published" when no publish date is known.
      const ordered = [...matched].sort((a, b) => {
        switch (sort) {
          case "relevance":
            return relevance(b.detail, term) - relevance(a.detail, term);
          case "distance":
            return (a.distance ?? last) - (b.distance ?? last);
          case "price_asc":
            return (a.detail.basePriceMinor ?? last) - (b.detail.basePriceMinor ?? last);
          case "price_desc":
            return (b.detail.basePriceMinor ?? -last) - (a.detail.basePriceMinor ?? -last);
          case "duration_asc":
            return (a.detail.durationMinutes ?? last) - (b.detail.durationMinutes ?? last);
          case "recent":
            return 0;
        }
      });

      const start = (filters.page - 1) * filters.pageSize;
      const items = ordered
        .slice(start, start + filters.pageSize)
        .map(({ detail, distance }) => toSummary(detail, distance));

      return toPage(items, ordered.length, filters);
    },

    async findExperienceBySlug(slug: string): Promise<ExperienceDetail | null> {
      return catalogue.find((detail) => detail.slug === slug) ?? null;
    },

    async featuredExperiences(limit: number): Promise<readonly ExperienceSummary[]> {
      return catalogue.slice(0, limit).map((detail) => toSummary(detail, null));
    },

    async listDestinations(limit?: number): Promise<readonly Destination[]> {
      return listDestinationsSync(limit);
    },

    async findDestination(slug: string): Promise<Destination | null> {
      return listDestinationsSync().find((destination) => destination.slug === slug) ?? null;
    },

    async listCategories(): Promise<readonly CategorySummary[]> {
      const counts = new Map<string, number>();
      for (const detail of catalogue) {
        if (detail.categoryKey)
          counts.set(detail.categoryKey, (counts.get(detail.categoryKey) ?? 0) + 1);
      }

      // Taxonomy order, and only categories with something in them — the same
      // dead-end rule the database path applies.
      return CATEGORY_DEFINITIONS.filter((category) => counts.has(category.key)).map(
        (category) => ({
          key: category.key,
          name: category.name,
          description: category.description,
          experienceCount: counts.get(category.key)!,
        }),
      );
    },
  };
}
