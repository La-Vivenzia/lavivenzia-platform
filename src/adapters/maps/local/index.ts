import type { PrismaClient } from "@/lib/db";
import type { Coordinates, MapsPort, PlaceSuggestion } from "@/ports/maps";
import { NotFoundError } from "@/lib/errors";
import { isValidLatitude, isValidLongitude } from "@/modules/discovery/geo";

/**
 * Location search resolved against our own catalogue.
 *
 * This is not a stub standing in for Google. It is a real provider with a
 * narrower scope: it can find any city that has a published experience in it,
 * because that is where its data comes from.
 *
 * It exists for two reasons.
 *
 * The first is availability. `PROJECT.md` §6 and `CLAUDE.md` §9 require every
 * external integration to degrade gracefully, and location search is on the
 * traveller's critical path. When Google is unconfigured, rate-limited, or
 * down, this keeps "search near Jaipur" working for every place we actually
 * sell — which is the set a traveller can do anything with.
 *
 * The second is cost. Every Places keystroke is billable. Serving the common
 * case from a table we already have is not a compromise; suggesting a city with
 * nothing in it would be the worse product.
 *
 * The place id is `city:<slug>` and is deliberately readable. It is ours, not a
 * provider's, and a caller that hands one to the Google adapter gets a
 * not-found rather than a confusing partial match.
 */

const PLACE_ID_PREFIX = "city:";

/**
 * Rows are cheap to compute and change only when a listing is published, so a
 * short in-process cache removes the per-keystroke query without introducing
 * anything to operate. Deliberately not Redis: this is one query against a
 * small grouped set, and ADR-0001 keeps that infrastructure out of the launch.
 */
const CACHE_TTL_MS = 60_000;

interface PlaceRow {
  readonly city: string;
  readonly region: string | null;
  readonly country: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

interface KnownPlace extends Coordinates {
  readonly slug: string;
  readonly description: string;
  /** Lowercased once, so matching does not re-case on every keystroke. */
  readonly haystack: string;
}

export interface LocalPlacesDeps {
  readonly now?: () => number;
}

export function createLocalPlacesAdapter(
  prisma: PrismaClient,
  slugify: (value: string) => string,
  deps: LocalPlacesDeps = {},
): MapsPort {
  const now = deps.now ?? (() => Date.now());

  let cache: { readonly at: number; readonly places: readonly KnownPlace[] } | null = null;

  /**
   * The cities we can offer, with a centroid for each.
   *
   * Averaged over the published listings in the city rather than stored: there
   * is no destination entity to hang a canonical coordinate on
   * (docs/ASSUMPTIONS.md → A-013), and the mean of the places a traveller could
   * actually book is a more useful centre than a civic one.
   *
   * `PUBLISHED` here for the same reason as everywhere else — an unpublished
   * listing must not reveal that a city exists in our catalogue.
   */
  async function loadPlaces(): Promise<readonly KnownPlace[]> {
    const cached = cache;
    if (cached && now() - cached.at < CACHE_TTL_MS) return cached.places;

    const rows = await prisma.$queryRaw<PlaceRow[]>`
      SELECT
        e.city AS city,
        MIN(e.region) AS region,
        MIN(e.country) AS country,
        AVG(e.latitude)::double precision AS latitude,
        AVG(e.longitude)::double precision AS longitude
      FROM experiences e
      WHERE e.status = 'PUBLISHED'
        AND e.city IS NOT NULL
        AND e.latitude IS NOT NULL
        AND e.longitude IS NOT NULL
      GROUP BY e.city
      ORDER BY COUNT(*) DESC
    `;

    const places: KnownPlace[] = [];

    for (const row of rows) {
      const { latitude, longitude } = row;
      // A city whose listings average to an invalid point is dropped rather
      // than offered: sending a traveller to a coordinate we do not trust is
      // worse than not offering the city.
      if (
        latitude === null ||
        longitude === null ||
        !isValidLatitude(latitude) ||
        !isValidLongitude(longitude)
      ) {
        continue;
      }

      const description = [row.city, row.region, row.country].filter(Boolean).join(", ");

      places.push({
        slug: slugify(row.city),
        description,
        haystack: description.toLowerCase(),
        latitude,
        longitude,
      });
    }

    cache = { at: now(), places };
    return places;
  }

  return {
    provider: "local",

    async autocomplete(query, limit) {
      const term = query.trim().toLowerCase();
      if (term.length < 2) return [];

      const places = await loadPlaces();

      // Prefix matches first: someone typing "jai" means Jaipur, not a city
      // with "jai" buried in its region. Ranked rather than filtered, so a
      // substring match still appears once the prefix matches run out.
      const matches = places
        .filter((place) => place.haystack.includes(term))
        .sort((a, b) => {
          const aPrefix = a.haystack.startsWith(term) ? 0 : 1;
          const bPrefix = b.haystack.startsWith(term) ? 0 : 1;
          return aPrefix - bPrefix || a.description.localeCompare(b.description);
        });

      return matches.slice(0, limit).map((place): PlaceSuggestion => ({
        providerPlaceId: `${PLACE_ID_PREFIX}${place.slug}`,
        description: place.description,
        // Already known, so choosing a suggestion costs no second request.
        coordinates: { latitude: place.latitude, longitude: place.longitude },
      }));
    },

    async geocode(providerPlaceId) {
      if (!providerPlaceId.startsWith(PLACE_ID_PREFIX)) {
        throw new NotFoundError("That place could not be found.");
      }

      const slug = providerPlaceId.slice(PLACE_ID_PREFIX.length);
      const place = (await loadPlaces()).find((candidate) => candidate.slug === slug);

      if (!place) throw new NotFoundError("That place could not be found.");

      return { latitude: place.latitude, longitude: place.longitude };
    },
  };
}
