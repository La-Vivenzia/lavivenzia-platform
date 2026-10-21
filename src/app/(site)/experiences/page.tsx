import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { EmptyState } from "@/components/ui/feedback";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { ResultsSkeleton } from "@/components/site/results-skeleton";
import { LocationField } from "@/components/site/location-field";
import { RADIUS_CHOICES_KM, RADIUS_METRES } from "@/modules/discovery/geo";
import { getDiscoveryService } from "@/lib/container";
import { toDestinationCard } from "@/lib/home-content";
import { parseFilters, resolveSort, type RawFilters } from "@/modules/discovery/service";
import { SORT_OPTIONS, type SortOption } from "@/modules/discovery/ports";

export const metadata: Metadata = {
  title: "Experiences",
  description: "Browse curated experiences across every destination.",
};

/**
 * Experience discovery (FR-01, FR-02).
 *
 * Filters live in the URL and are applied in PostgreSQL. A plain GET form
 * rather than a client component: the filter state is shareable and
 * bookmarkable, the page works without JavaScript, and there is no client store
 * to disagree with what the server returned.
 *
 * Every value is parsed by `parseFilters` in the domain — malformed input is
 * dropped rather than rejected, because a traveller arriving on a mangled link
 * should see experiences, not an error page.
 */

const SORT_LABELS: Readonly<Record<SortOption, string>> = {
  relevance: "Best match",
  recent: "Most recent",
  distance: "Nearest first",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
  duration_asc: "Shortest first",
};

/**
 * Sort orders that need something the query may not carry.
 *
 * Offering "Nearest first" with no location selected is offering a control that
 * silently does nothing, so each is shown only once its input exists. The
 * domain enforces the same rule in `resolveSort` — this is the UI agreeing with
 * it, not the place it is decided.
 */
const CONDITIONAL_SORTS: Readonly<Record<string, "search" | "location">> = {
  relevance: "search",
  distance: "location",
};

/** Shown as the unlabelled default in the radius select. Mirrors the domain default. */
const DEFAULT_RADIUS_KM = RADIUS_METRES.default / 1000;

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function ExperiencesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const discovery = getDiscoveryService();

  const raw: RawFilters = {
    search: readParam(params, "search"),
    category: readParam(params, "category"),
    destination: readParam(params, "destination"),
    // Major units, as typed. parseFilters converts to minor units once, so the
    // page and the API read the same parameter the same way.
    minPrice: readParam(params, "minPrice"),
    maxPrice: readParam(params, "maxPrice"),
    maxDuration: readParam(params, "maxDuration"),
    lat: readParam(params, "lat"),
    lng: readParam(params, "lng"),
    radiusKm: readParam(params, "radiusKm"),
    sort: readParam(params, "sort"),
    page: readParam(params, "page"),
  };

  const filters = parseFilters(raw);

  // The filter options are small and needed to render the form, so they are
  // awaited here. The results are the slow part and stream separately below.
  const [categories, destinations] = await Promise.all([
    discovery.categories(),
    discovery.destinations(),
  ]);

  // A location counts as one filter, not as three query parameters.
  const hasLocation = filters.near !== undefined;
  const hasSearch = filters.search !== undefined;

  // What the empty option in the sort control actually does. Labelling it
  // "Best match" while a location-only query is ordered nearest-first would
  // describe the control incorrectly — `resolveSort` in the domain decides
  // this, so the label asks it rather than restating the rule.
  const impliedSort = resolveSort(undefined, { hasSearch, hasLocation });

  const active =
    [raw.search, raw.category, raw.destination, raw.minPrice, raw.maxPrice, raw.maxDuration].filter(
      Boolean,
    ).length + (hasLocation ? 1 : 0);

  const carried: Record<string, string> = Object.fromEntries(
    Object.entries({
      search: readParam(params, "search"),
      category: readParam(params, "category"),
      destination: readParam(params, "destination"),
      minPrice: readParam(params, "minPrice"),
      maxPrice: readParam(params, "maxPrice"),
      maxDuration: readParam(params, "maxDuration"),
      place: readParam(params, "place"),
      lat: readParam(params, "lat"),
      lng: readParam(params, "lng"),
      radiusKm: readParam(params, "radiusKm"),
      sort: readParam(params, "sort"),
    }).filter(([, value]) => value),
  );

  return (
    <PageBody>
      <div className="flex flex-col gap-10">
        <PageHeader
          eyebrow="Browse"
          title="Experiences"
          description="Every listing is led by a verified host and reviewed by our team before it appears."
        />

        {/* ── Filters ───────────────────────────────────────────────── */}
        <form
          method="get"
          action="/experiences"
          className="border-line bg-surface shadow-card rounded-card flex flex-col gap-5 border p-5 sm:p-6"
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search">
              <Control
                type="search"
                name="search"
                defaultValue={readParam(params, "search")}
                placeholder="Title, place or host"
              />
            </Field>

            <Field label="Category">
              <Select
                name="category"
                defaultValue={readParam(params, "category")}
                anyLabel="Any category"
              >
                {categories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.name} ({category.experienceCount})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Destination">
              <Select
                name="destination"
                defaultValue={readParam(params, "destination")}
                anyLabel="Anywhere"
              >
                {destinations.map((destination) => (
                  <option key={destination.slug} value={destination.slug}>
                    {destination.city} ({destination.experienceCount})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Sort by">
              <Select
                name="sort"
                defaultValue={readParam(params, "sort")}
                anyLabel={SORT_LABELS[impliedSort]}
              >
                {SORT_OPTIONS.filter((option) => {
                  const needs = CONDITIONAL_SORTS[option];
                  if (needs === "search") return hasSearch;
                  if (needs === "location") return hasLocation;
                  // "Most recent" is the unlabelled default when nothing is
                  // searched, so it only earns a row once something else is.
                  return option !== "recent" || hasSearch || hasLocation;
                }).map((option) => (
                  <option key={option} value={option}>
                    {SORT_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/*
             * Location search (FR-03). A client component for the suggestion
             * list and the device-location button only — the coordinates it
             * writes are hidden inputs in this same GET form, so a shared URL
             * carries the location and pagination keeps it.
             */}
            <LocationField
              defaultLabel={readParam(params, "place")}
              defaultLat={readParam(params, "lat")}
              defaultLng={readParam(params, "lng")}
              controlClassName={CONTROL}
            />

            <Field label="Within">
              <Select
                name="radiusKm"
                defaultValue={readParam(params, "radiusKm")}
                anyLabel={`${DEFAULT_RADIUS_KM} km`}
              >
                {RADIUS_CHOICES_KM.filter((km) => km !== DEFAULT_RADIUS_KM).map((km) => (
                  <option key={km} value={km}>
                    {km} km
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Min price">
              <Control
                type="number"
                name="minPrice"
                min={0}
                defaultValue={readParam(params, "minPrice")}
                placeholder="Any"
              />
            </Field>
            <Field label="Max price">
              <Control
                type="number"
                name="maxPrice"
                min={0}
                defaultValue={readParam(params, "maxPrice")}
                placeholder="Any"
              />
            </Field>
            <Field label="Max duration (minutes)">
              <Control
                type="number"
                name="maxDuration"
                min={0}
                defaultValue={readParam(params, "maxDuration")}
                placeholder="Any"
              />
            </Field>
          </div>

          <div className="border-line flex flex-wrap items-center gap-4 border-t pt-4">
            <button
              type="submit"
              className="bg-cta text-cta-fg hover:bg-cta-hover inline-flex h-10 items-center rounded-pill px-6 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors"
            >
              Apply
            </button>
            {active > 0 ? (
              <Link
                href="/experiences"
                className="text-fg-muted hover:text-heading text-[12px] underline underline-offset-4"
              >
                Clear {active} filter{active === 1 ? "" : "s"}
              </Link>
            ) : null}
          </div>
        </form>

        {/*
         * Streamed. The boundary is here rather than in a segment-level
         * `loading.tsx`, which would also wrap `[slug]` and flush a 200 before
         * the detail page could return a real 404.
         *
         * Keyed on the filters so changing them shows the skeleton again
         * rather than the previous results while the new query runs.
         */}
        <Suspense key={JSON.stringify(carried)} fallback={<ResultsSkeleton />}>
          <Results filters={filters} active={active} carried={carried} />
        </Suspense>
      </div>
    </PageBody>
  );
}

/** The results, awaited inside the Suspense boundary above. */
async function Results({
  filters,
  active,
  carried,
}: {
  readonly filters: ReturnType<typeof parseFilters>;
  readonly active: number;
  readonly carried: Readonly<Record<string, string>>;
}) {
  const page = await getDiscoveryService().browse(filters);

  if (page.items.length === 0) {
    return (
      <EmptyState
        eyebrow={active > 0 ? "No matches" : "Nothing yet"}
        title={active > 0 ? "Nothing matches those filters" : "No experiences are published yet"}
        description={
          active > 0
            ? "Try widening the search, or clear the filters to see everything available."
            : "Every listing is reviewed by our team before it appears. The first ones are on their way."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="text-fg-subtle text-[11px] tracking-[0.16em] uppercase">
        {page.total} {page.total === 1 ? "experience" : "experiences"} available
      </p>
      <CatalogueGrid
        items={page.items
          .map(toDestinationCard)
          .filter((card): card is NonNullable<typeof card> => card !== null)}
      />
      <Pagination
        page={page.page}
        totalPages={page.totalPages}
        total={page.total}
        pageSize={page.pageSize}
        params={carried}
      />
    </div>
  );
}

// The filter controls reuse the token layer directly rather than the console's
// form components: those carry console-specific labelling, and the public site
// should not inherit changes made for an operator screen.
/*
 * Filter controls, in the approved language: a filled pill on the sunken
 * surface rather than an underlined field. The browse screen is the one place
 * a traveller meets many inputs at once, and underlines at that density read as
 * a form rather than as a set of choices.
 */
const CONTROL =
  "h-10 w-full rounded-pill border border-line bg-surface-2 px-4 text-[14px] " +
  "transition-[border-color,background-color] hover:border-line-strong " +
  "focus:border-line-strong focus:outline-none";

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-fg-subtle text-[10px] font-medium tracking-[0.16em] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function Control(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={CONTROL} />;
}

function Select({
  name,
  defaultValue,
  anyLabel,
  children,
}: {
  readonly name: string;
  readonly defaultValue: string;
  readonly anyLabel: string;
  readonly children: React.ReactNode;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={`${CONTROL} appearance-none`}>
      <option value="">{anyLabel}</option>
      {children}
    </select>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  params,
}: {
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  readonly pageSize: number;
  readonly params: Readonly<Record<string, string>>;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number): string =>
    `/experiences?${new URLSearchParams({ ...params, page: String(target) }).toString()}`;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="border-line flex flex-wrap items-center justify-between gap-4 border-t pt-6"
    >
      <p className="text-fg-muted text-[12px] tabular-nums">
        {first}–{last} of {total}
      </p>

      <div className="flex items-center gap-3">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            rel="prev"
            className="border-line bg-surface hover:border-line-strong inline-flex h-10 items-center rounded-pill border px-5 text-[11px] tracking-[0.1em] uppercase transition-colors"
          >
            Previous
          </Link>
        ) : null}
        <span className="text-fg-muted text-[12px] tabular-nums">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={href(page + 1)}
            rel="next"
            className="border-line bg-surface hover:border-line-strong inline-flex h-10 items-center rounded-pill border px-5 text-[11px] tracking-[0.1em] uppercase transition-colors"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
