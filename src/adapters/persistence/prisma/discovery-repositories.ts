import type { PrismaClient } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { toPage, type Page } from "@/modules/shared/pagination";
import { slugify } from "@/modules/experiences/slug";
import type { UrlResolver } from "@/adapters/persistence/prisma/experience-repositories";
import type {
  CategorySummary,
  Destination,
  DiscoveryFilters,
  DiscoveryRepository,
  ExperienceDetail,
  ExperienceSummary,
  SortOption,
} from "@/modules/discovery/ports";
import type { ProximityFilter } from "@/modules/discovery/geo";

/**
 * Prisma implementation of traveller discovery.
 *
 * **The invariant this file exists to hold: only `PUBLISHED` rows leave it.**
 * `PUBLISHED_ONLY` is spread into every `where` in the module and there is no
 * parameter that can widen it, so a draft or a suspended listing cannot be
 * reached through any method here. An integration test asserts it per method
 * rather than trusting the reading.
 *
 * `listExperiences` selects rows with raw SQL, because neither PostGIS distance
 * nor trigram relevance can be expressed through Prisma's query builder. That
 * raises an obvious risk — the publication rule stated twice, in two dialects,
 * drifting apart. It is answered by structure rather than by care: the SQL
 * stage is the *only* row-selection stage, used for every browse query and not
 * just the geospatial ones, and `PUBLISHED_SQL` below is its single definition.
 * Prisma is then used purely to hydrate ids that stage already vetted, with the
 * status predicate reapplied as a second lock rather than as the first one.
 */

/** Spread into every Prisma query. One half of the publication rule. */
const PUBLISHED_ONLY = { status: "PUBLISHED" } as const;

/**
 * The same rule in SQL, for the one query Prisma cannot express.
 *
 * Defined once, immediately beside its Prisma twin, so the two cannot be edited
 * apart without the diff showing it. `tests/integration/discovery.test.ts`
 * asserts every non-published status is unreachable through each method, which
 * is what actually holds this — not the adjacency.
 */
const PUBLISHED_SQL = Prisma.sql`e.status = 'PUBLISHED'`;

/**
 * Trigram similarity weights for keyword relevance (FR-02).
 *
 * A match in the title is what someone typing a title meant; a match in the
 * host name is weaker evidence and must not outrank it. The weights are a
 * ranking heuristic and carry no business meaning — they are not a pending
 * founder decision, and changing them changes result order and nothing else.
 */
const RELEVANCE_WEIGHTS = {
  title: 1,
  summary: 0.6,
  city: 0.5,
  hostName: 0.4,
  /** Added when the term appears verbatim in the title. */
  exactTitleBoost: 0.5,
} as const;

/**
 * How close a misspelling has to be before it counts as a match.
 *
 * `word_similarity` rather than `similarity`, because the two answer different
 * questions. `similarity` compares whole strings, so "kerela" against "Kerala
 * backwater mornings" scores 0.14 — the extra words dilute it below any usable
 * threshold, and typo tolerance would only ever work on one-word titles.
 * `word_similarity` finds the best-matching run inside the target and scores
 * 0.43, which is the number a person means by "close enough".
 *
 * Stated as a function comparison rather than the `<%` operator on purpose. The
 * operator reads `pg_trgm.word_similarity_threshold` from session state, and
 * this application runs on a connection pool where session state is not ours to
 * rely on — a threshold that depends on which connection served the request is
 * a bug waiting for load. The cost is that this arm of the predicate does not
 * use the GIN index; the `ILIKE` arm still does, and at launch catalogue size
 * the difference is not measurable. Revisit if the catalogue passes roughly a
 * hundred thousand listings, where the scan starts to matter.
 */
const FUZZY_MATCH_THRESHOLD = 0.4;

/**
 * Escape the wildcards `LIKE` gives special meaning to.
 *
 * Binding a value as a parameter stops it being read as *SQL* — it does not stop
 * it being read as a *pattern*. `%` and `_` are wildcards inside the pattern
 * either way, so a traveller searching for "50% off" was searching for
 * "anything, followed by 50, anything, off, anything", and could never match a
 * literal per cent sign.
 *
 * Two consequences, one of each kind. The visible one is correctness: search now
 * finds what was typed. The quieter one is that a term made only of wildcards no
 * longer builds a pathological backtracking pattern on an unauthenticated
 * endpoint.
 *
 * The backslash must be escaped first, or it re-escapes the escapes that follow.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/[%_]/g, (match) => `\\${match}`);
}

function toNumber(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

/**
 * Newest first, for the homepage rail and for destination covers.
 *
 * `publishedAt` rather than `createdAt`: a listing drafted in January and
 * approved in June is new to a traveller in June. Browse ordering is not here —
 * it is decided in SQL by `orderExpression`, because two of the six orders are
 * computed columns Prisma cannot express.
 */
const RECENT_FIRST = [{ publishedAt: "desc" as const }, { createdAt: "desc" as const }];

/** Fields every card needs, resolved on one statement — no query per row. */
const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  city: true,
  region: true,
  country: true,
  durationMinutes: true,
  minGuests: true,
  maxGuests: true,
  basePriceMinor: true,
  currency: true,
  pricingUnit: true,
  publishedAt: true,
  category: { select: { key: true, name: true } },
  host: { select: { displayName: true } },
  media: { select: { storageKey: true, altText: true }, orderBy: { position: "asc" }, take: 1 },
} as const;

export function createDiscoveryRepository(
  prisma: PrismaClient,
  urlFor: UrlResolver,
): DiscoveryRepository {
  type SummaryRow = {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    city: string | null;
    region: string | null;
    country: string;
    durationMinutes: number | null;
    minGuests: number;
    maxGuests: number | null;
    basePriceMinor: number | null;
    currency: string;
    pricingUnit: "PER_PERSON" | "PER_GROUP";
    publishedAt: Date | null;
    category: { key: string; name: string } | null;
    host: { displayName: string };
    media: { storageKey: string; altText: string | null }[];
  };

  function toSummary(row: SummaryRow, distanceMetres: number | null = null): ExperienceSummary {
    const cover = row.media[0];

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      city: row.city,
      region: row.region,
      country: row.country,
      categoryKey: row.category?.key ?? null,
      categoryName: row.category?.name ?? null,
      durationMinutes: row.durationMinutes,
      minGuests: row.minGuests,
      maxGuests: row.maxGuests,
      basePriceMinor: row.basePriceMinor,
      currency: row.currency,
      pricingUnit: row.pricingUnit,
      coverUrl: cover ? urlFor(cover.storageKey) : null,
      coverAlt: cover?.altText ?? null,
      hostName: row.host.displayName,
      publishedAt: row.publishedAt,
      distanceMetres,
    };
  }

  /**
   * Resolve a destination slug back to the city it stands for.
   *
   * Destinations are derived from `experiences.city`, so the slug has no row to
   * join against. Matching every published city and comparing slugs is exact —
   * unlike un-slugifying, which cannot recover "Chennai (Madras)" from
   * "chennai-madras".
   */
  async function cityForSlug(slug: string): Promise<string | null> {
    const rows = await prisma.experience.findMany({
      where: { ...PUBLISHED_ONLY, city: { not: null } },
      select: { city: true },
      distinct: ["city"],
    });

    return rows.find((row) => row.city && slugify(row.city) === slug)?.city ?? null;
  }

  /**
   * The keyword predicate.
   *
   * Two mechanisms, deliberately. `ILIKE` is the literal substring match a
   * traveller expects when they type an exact word, and it is what guarantees a
   * title containing the term always appears, and it is the arm the GIN trigram
   * indexes accelerate. `word_similarity` is what makes "kerela" find Kerala —
   * see `FUZZY_MATCH_THRESHOLD` for why it is the function and not the operator.
   *
   * Fuzzy matching is applied to `title` and the host name only. Extending it
   * to `summary` would let any paragraph containing a near-miss word qualify,
   * which returns almost everything — a worse failure than returning nothing.
   */
  function keywordPredicate(term: string): Prisma.Sql {
    const pattern = `%${escapeLikePattern(term)}%`;

    return Prisma.sql`(
      e.title ILIKE ${pattern}
      OR COALESCE(e.summary, '') ILIKE ${pattern}
      OR COALESCE(e.city, '') ILIKE ${pattern}
      OR h.display_name ILIKE ${pattern}
      OR word_similarity(${term}, e.title) >= ${FUZZY_MATCH_THRESHOLD}::real
      OR word_similarity(${term}, h.display_name) >= ${FUZZY_MATCH_THRESHOLD}::real
    )`;
  }

  /** The relevance score, or a constant when there is nothing to score against. */
  function relevanceExpression(term: string | undefined): Prisma.Sql {
    if (!term) return Prisma.sql`0::real`;

    const weights = RELEVANCE_WEIGHTS;

    // Every weight carries an explicit `::real`. Without it the driver infers a
    // parameter type from the JavaScript value, and a fractional weight sent as
    // an integer parameter fails at execution with `22P02` — which is how this
    // was found, in the integration suite rather than in production.
    return Prisma.sql`(
      GREATEST(
        word_similarity(${term}, e.title) * ${weights.title}::real,
        word_similarity(${term}, COALESCE(e.summary, '')) * ${weights.summary}::real,
        word_similarity(${term}, COALESCE(e.city, '')) * ${weights.city}::real,
        word_similarity(${term}, h.display_name) * ${weights.hostName}::real
      )
      + CASE WHEN e.title ILIKE ${`%${term}%`} THEN ${weights.exactTitleBoost}::real ELSE 0::real END
    )`;
  }

  /**
   * The distance expression, or NULL when the query carries no location.
   *
   * The column is `geography`, not `geometry`, so `ST_Distance` returns metres
   * on the spheroid rather than degrees. That choice (ADR-0008) is what stops
   * this being a units trap.
   */
  function distanceExpression(near: ProximityFilter | undefined): Prisma.Sql {
    if (!near) return Prisma.sql`NULL::double precision`;

    return Prisma.sql`ST_Distance(e.geo, ${pointFor(near)})`;
  }

  /** A `geography` point from a coordinate pair, as a bound parameter. */
  function pointFor(at: { latitude: number; longitude: number }): Prisma.Sql {
    return Prisma.sql`ST_SetSRID(ST_MakePoint(${at.longitude}::double precision, ${at.latitude}::double precision), 4326)::geography`;
  }

  /**
   * Build the filter predicates, or `null` when they can match nothing.
   *
   * `null` is returned when a destination slug does not name any city that has
   * something published. The caller short-circuits to an empty page rather than
   * issuing a query with a sentinel value: a magic string that "cannot match"
   * is a value someone can accidentally create, and it hides the intent.
   */
  async function buildConditions(filters: DiscoveryFilters): Promise<Prisma.Sql[] | null> {
    const conditions: Prisma.Sql[] = [PUBLISHED_SQL];

    if (filters.destinationSlug) {
      const city = await cityForSlug(filters.destinationSlug);
      // An unknown destination matches nothing. Dropping the filter instead
      // would show every listing to a traveller who believes they are looking
      // at one city.
      if (city === null) return null;
      conditions.push(Prisma.sql`e.city = ${city}`);
    }

    if (filters.categoryKey) {
      conditions.push(Prisma.sql`c.key = ${filters.categoryKey}`);
    }

    if (filters.minPriceMinor !== undefined) {
      conditions.push(Prisma.sql`e.base_price_minor >= ${filters.minPriceMinor}`);
    }

    if (filters.maxPriceMinor !== undefined) {
      conditions.push(Prisma.sql`e.base_price_minor <= ${filters.maxPriceMinor}`);
    }

    if (filters.maxDurationMinutes !== undefined) {
      conditions.push(Prisma.sql`e.duration_minutes <= ${filters.maxDurationMinutes}`);
    }

    const term = filters.search?.trim();
    if (term) conditions.push(keywordPredicate(term));

    if (filters.near) {
      // `ST_DWithin` is the indexable form; a comparison against `ST_Distance`
      // is not, and would scan. A listing with no coordinates is excluded rather
      // than treated as distant — we do not know that it is far away, only that
      // we cannot say it is near.
      conditions.push(Prisma.sql`e.geo IS NOT NULL`);
      conditions.push(
        Prisma.sql`ST_DWithin(e.geo, ${pointFor(filters.near)}, ${filters.near.radiusMetres}::double precision)`,
      );
    }

    return conditions;
  }

  /** The ORDER BY for a sort option, given what the query actually carries. */
  function orderExpression(sort: SortOption): Prisma.Sql {
    switch (sort) {
      case "relevance":
        return Prisma.sql`relevance DESC, e.published_at DESC NULLS LAST, e.created_at DESC`;
      case "distance":
        // NULLS LAST is defensive only: the proximity predicate already excludes
        // rows without coordinates, so a NULL distance cannot reach here.
        return Prisma.sql`distance_metres ASC NULLS LAST, e.published_at DESC NULLS LAST`;
      case "price_asc":
        return Prisma.sql`e.base_price_minor ASC NULLS LAST, e.published_at DESC NULLS LAST`;
      case "price_desc":
        return Prisma.sql`e.base_price_minor DESC NULLS LAST, e.published_at DESC NULLS LAST`;
      case "duration_asc":
        return Prisma.sql`e.duration_minutes ASC NULLS LAST, e.published_at DESC NULLS LAST`;
      case "recent":
        return Prisma.sql`e.published_at DESC NULLS LAST, e.created_at DESC`;
    }
  }

  interface SelectedRow {
    readonly id: string;
    readonly distance_metres: number | null;
    readonly total_count: bigint | number | string;
  }

  /**
   * The row-selection stage: which listings match, in what order, and how many.
   *
   * `COUNT(*) OVER ()` rather than a second `count` query — one statement, and
   * no window in which the page and the total could disagree.
   *
   * Every interpolation goes through `Prisma.sql`, so each value is a bound
   * parameter. Nothing a traveller types reaches the statement as SQL.
   */
  async function selectMatching(filters: DiscoveryFilters): Promise<{
    readonly ids: readonly string[];
    readonly distances: ReadonlyMap<string, number | null>;
    readonly total: number;
  }> {
    const conditions = await buildConditions(filters);
    if (conditions === null) return { ids: [], distances: new Map(), total: 0 };

    const rows = await prisma.$queryRaw<SelectedRow[]>`
      SELECT
        e.id::text AS id,
        ${distanceExpression(filters.near)} AS distance_metres,
        ${relevanceExpression(filters.search?.trim())} AS relevance,
        COUNT(*) OVER () AS total_count
      FROM experiences e
      JOIN hosts h ON h.id = e.host_id
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY ${orderExpression(filters.sort ?? "recent")}
      LIMIT ${filters.pageSize}
      OFFSET ${(filters.page - 1) * filters.pageSize}
    `;

    // `COUNT(*) OVER ()` is bigint, which the driver returns as a BigInt or a
    // string depending on the column. `Number` is safe here: it is a row count,
    // not money, and the page-size clamp bounds what can be reached anyway.
    const total = rows.length === 0 ? 0 : Number(rows[0]!.total_count);

    return {
      ids: rows.map((row) => row.id),
      distances: new Map(
        rows.map((row) => [
          row.id,
          row.distance_metres === null ? null : Number(row.distance_metres),
        ]),
      ),
      total,
    };
  }

  return {
    async listExperiences(filters): Promise<Page<ExperienceSummary>> {
      const { ids, distances, total } = await selectMatching(filters);
      if (ids.length === 0) return toPage([], total, filters);

      // Hydration only. These ids came from a statement that already applied
      // the publication rule; `PUBLISHED_ONLY` is repeated here as a second
      // lock, so a listing suspended between the two statements cannot slip out.
      const rows = await prisma.experience.findMany({
        where: { id: { in: [...ids] }, ...PUBLISHED_ONLY },
        select: SUMMARY_SELECT,
      });

      // `IN` does not preserve order, and the order is the entire result of the
      // ranking above. It is re-imposed from the id list rather than re-sorted.
      const byId = new Map(rows.map((row) => [row.id, row]));

      const items = ids
        .map((id) => {
          const row = byId.get(id);
          return row ? toSummary(row, distances.get(id) ?? null) : null;
        })
        .filter((item): item is ExperienceSummary => item !== null);

      return toPage(items, total, filters);
    },

    async findExperienceBySlug(slug): Promise<ExperienceDetail | null> {
      const row = await prisma.experience.findFirst({
        // Slug is unique, but the status predicate is what makes an unpublished
        // listing unreachable — `findUnique` on slug alone would return it.
        where: { slug, ...PUBLISHED_ONLY },
        select: {
          ...SUMMARY_SELECT,
          description: true,
          addressLine: true,
          postalCode: true,
          latitude: true,
          longitude: true,
          languages: true,
          inclusions: true,
          exclusions: true,
          guestNotes: true,
          media: {
            select: { id: true, storageKey: true, altText: true },
            orderBy: { position: "asc" },
          },
          host: {
            select: {
              displayName: true,
              headline: true,
              about: true,
              city: true,
              verificationStatus: true,
            },
          },
        },
      });

      if (!row) return null;

      const cover = row.media[0];

      return {
        ...toSummary({
          ...row,
          media: cover ? [cover] : [],
          host: { displayName: row.host.displayName },
        }),
        description: row.description,
        addressLine: row.addressLine,
        postalCode: row.postalCode,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        languages: row.languages,
        inclusions: row.inclusions,
        exclusions: row.exclusions,
        guestNotes: row.guestNotes,
        images: row.media.map((image) => ({
          id: image.id,
          url: urlFor(image.storageKey),
          altText: image.altText,
        })),
        // Public identity only. The contact email, phone and legal name the host
        // supplied are operational detail and never leave the console.
        host: {
          displayName: row.host.displayName,
          headline: row.host.headline,
          about: row.host.about,
          city: row.host.city,
          isVerified: row.host.verificationStatus === "VERIFIED",
        },
      };
    },

    async featuredExperiences(limit): Promise<readonly ExperienceSummary[]> {
      const rows = await prisma.experience.findMany({
        where: PUBLISHED_ONLY,
        orderBy: RECENT_FIRST,
        take: limit,
        select: SUMMARY_SELECT,
      });

      return rows.map(toSummary);
    },

    async listDestinations(limit): Promise<readonly Destination[]> {
      // Grouped in PostgreSQL rather than counted per city in JavaScript.
      const grouped = await prisma.experience.groupBy({
        by: ["city", "region", "country"],
        where: { ...PUBLISHED_ONLY, city: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { id: "desc" } },
        ...(limit === undefined ? {} : { take: limit }),
      });

      const cities = grouped.map((entry) => entry.city).filter((city): city is string => !!city);

      /*
       * One cover per city, chosen in PostgreSQL.
       *
       * This previously selected *every* published listing in those cities and
       * picked the first per city in JavaScript. Correct, and O(catalogue): at
       * a hundred thousand listings the homepage would load a hundred thousand
       * rows to render a dozen images. `DISTINCT ON` asks the database for one
       * row per city, which is the shape of the answer — and it has no Prisma
       * equivalent, which is why this one is raw.
       *
       * The ordering inside `DISTINCT ON` decides *which* listing wins, so it
       * has to state the intent: the most recently published one that actually
       * has a photograph.
       */
      const covers =
        cities.length === 0
          ? []
          : await prisma.$queryRaw<{ city: string; storage_key: string }[]>`
              SELECT DISTINCT ON (e.city)
                e.city AS city,
                m.storage_key AS storage_key
              FROM experiences e
              JOIN experience_media m ON m.experience_id = e.id
              WHERE ${PUBLISHED_SQL}
                AND e.city IN (${Prisma.join(cities)})
              ORDER BY e.city, e.published_at DESC NULLS LAST, m.position ASC
            `;

      const coverByCity = new Map<string, string>(
        covers.map((row) => [row.city, urlFor(row.storage_key)]),
      );

      return grouped
        .filter((entry): entry is typeof entry & { city: string } => entry.city !== null)
        .map((entry) => ({
          slug: slugify(entry.city),
          city: entry.city,
          region: entry.region,
          country: entry.country,
          experienceCount: entry._count._all,
          coverUrl: coverByCity.get(entry.city) ?? null,
        }));
    },

    async findDestination(slug): Promise<Destination | null> {
      const all = await this.listDestinations();
      return all.find((destination) => destination.slug === slug) ?? null;
    },

    async listCategories(): Promise<readonly CategorySummary[]> {
      const [categories, counts] = await Promise.all([
        prisma.category.findMany({
          where: { isActive: true },
          orderBy: [{ position: "asc" }, { name: "asc" }],
          select: { id: true, key: true, name: true, description: true },
        }),
        prisma.experience.groupBy({
          by: ["categoryId"],
          where: PUBLISHED_ONLY,
          _count: { _all: true },
        }),
      ]);

      const countById = new Map(counts.map((row) => [row.categoryId, row._count._all]));

      // Categories with nothing published are omitted: a traveller following an
      // empty category has been sent to a dead end.
      return categories
        .map((category) => ({
          key: category.key,
          name: category.name,
          description: category.description,
          experienceCount: countById.get(category.id) ?? 0,
        }))
        .filter((category) => category.experienceCount > 0);
    },
  };
}
