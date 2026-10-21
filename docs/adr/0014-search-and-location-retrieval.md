# ADR-0014: Search and location retrieval in PostgreSQL

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decides:** how keyword, filter and proximity retrieval are executed, and where semantic retrieval attaches when a provider is chosen

## Context

Official Phase 5 requires keyword search, structured filters, sorting, location
search, autocomplete, geocoding, nearby discovery, distance-based results, maps
integration, relevance ranking, and a semantic search foundation (FR-02, FR-03).

Before this milestone, discovery ran a Prisma `findMany` with `contains` filters
over four columns and offered four sort orders. That is a filter, not a search:

- No relevance. Results came back in publication order regardless of how well
  they matched, so an exact title match could appear below an unrelated listing
  approved more recently.
- No tolerance for misspelling, which is most of what people type.
- The PostGIS `geo` column had existed since the first migration (ADR-0008),
  correctly generated and GiST-indexed, and **was never read by any query**.
- `pg_trgm` was installed and unused.

The infrastructure question was whether this needs a search engine. `PROJECT.md`
§9 puts a dedicated search cluster out of scope unless explicitly approved, and
`SYSTEM_DESIGN.md` §15 places it several steps down the scaling path.

## Decision

Retrieval stays in PostgreSQL, using extensions that were already installed.

**One row-selection stage, in SQL.** `listExperiences` runs a single
`$queryRaw` that decides which listings match, in what order, and how many there
are in total, then hydrates those ids through Prisma. Neither PostGIS distance
nor trigram relevance can be expressed through Prisma's query builder, and the
alternative — a Prisma path for ordinary browsing plus a raw path for
geospatial — would state the publication rule twice in two dialects. Making the
SQL stage the only selection stage means `status = 'PUBLISHED'` has exactly one
definition on the retrieval path.

**Keyword matching is two predicates.** `ILIKE` for the literal substring a
traveller expects, which the GIN trigram indexes accelerate; and
`word_similarity` above a named threshold for misspellings. `word_similarity`
rather than `similarity` because the latter compares whole strings — "kerela"
against "Kerala backwater mornings" scores 0.14, so whole-string similarity
would only ever tolerate typos in one-word titles.

**The threshold is a function comparison, not the `<%` operator.** The operator
reads `pg_trgm.word_similarity_threshold` from session state, and this
application runs on a connection pool where session state is not ours to rely
on. A relevance threshold that depends on which connection served the request is
a defect waiting for load.

**Proximity uses `ST_DWithin` on the `geography` column.** `ST_DWithin` is the
indexable form; a comparison against `ST_Distance` is not. `geography` rather
than `geometry` means distances come back in metres on the spheroid rather than
in degrees.

**Sort order is chosen from what the query carries.** A search term defaults to
relevance, a location defaults to nearest-first, and undirected browsing
defaults to most-recent. Asking for a sort whose input is absent falls back
rather than erroring.

**Location providers are two, with a fallback between them.** Google Places is
the primary when a key is configured. The catalogue itself is the other: it
resolves any city that has a published listing, from a grouped query with a
short in-process cache. With no key the catalogue provider serves alone, and
with a key it serves whenever Google is unavailable. Only retryable failures
fall back — a not-found is an answer, not an outage.

**Semantic retrieval is not built, and no vector column is added.** The
embeddings provider is unresolved (ADR-0007, A-006) and the chosen model fixes
the pgvector dimension. The abstraction that exists is `src/ports/embeddings.ts`
and the placeholder adapter that refuses to guess a provider. No further
machinery was written, because writing an unused composition layer against an
unknown vector dimension is speculation, not preparation — and `PROJECT.md` §3
forbids building before the requirement exists.

Where it attaches when the decision lands is fixed by this ADR: semantic
candidates join at the **row-selection stage** as an additional arm of the
`WHERE` predicate, and contribute an additional term to the relevance
expression. Both are single functions in
`src/adapters/persistence/prisma/discovery-repositories.ts`. Nothing above the
repository changes: `DiscoveryFilters` already carries a free-text term, and
`SortOption` already has a `relevance` member whose meaning widens rather than
changes.

## Consequences

Easier: nearby search, distance ordering and typo tolerance exist with no new
infrastructure to run, back up, or keep in sync with PostgreSQL. Location search
works with no Google account, which is the current state of this deployment.
Ranking weights are five constants in one file.

Harder: `listExperiences` is now two round trips rather than one, and its
selection stage is raw SQL — less readable than a Prisma `where`, and not
type-checked against the schema. The mitigation is that the publication
invariant is asserted per-method by integration tests against a real database,
which is what actually holds it.

Watched: the fuzzy arm of the keyword predicate does not use the GIN index, so
it scans the candidate set. That is not measurable at launch catalogue size and
becomes measurable somewhere around a hundred thousand listings.

The `%` operator on a `geography` column and the `word_similarity` threshold are
both places where a future contributor could reasonably "optimise" into
session-dependent behaviour. The reasoning is in the code beside them.

## Revisit when

- The founders select an embeddings provider (A-006), at which point the vector
  column and the semantic arm land together.
- Keyword search latency exceeds roughly 300 ms at p95, or the catalogue passes
  roughly a hundred thousand published listings — whichever comes first. That is
  the point at which a dedicated index (or a materialised `tsvector` column with
  a weighted `ts_rank`) earns its keep.
- A second country enters the catalogue, which breaks the India-only region
  restriction on autocomplete and the single-currency price filter (A-014).
