import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { ResultsSkeleton } from "@/components/site/results-skeleton";
import { getDiscoveryService } from "@/lib/container";
import { toDestinationCard } from "@/lib/home-content";
import { cn } from "@/lib/cn";
import { parseFilters, type RawFilters } from "@/modules/discovery/service";

export const metadata: Metadata = {
  title: "Experiences",
  description: "Browse curated experiences across every destination.",
};

/**
 * Experience discovery (FR-01, FR-02).
 *
 * Browsing is a category pill bar over the grid; describing a moment in words
 * is VivenIQ's job (`/viveniq`). The filters still live in the URL and are
 * still applied in PostgreSQL, so an older shared link carrying `search`,
 * price or location parameters keeps working — it just has no controls here.
 *
 * Every value is parsed by `parseFilters` in the domain — malformed input is
 * dropped rather than rejected, because a traveller arriving on a mangled link
 * should see experiences, not an error page.
 */

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

  // The pills are small and needed to render the bar, so they are awaited
  // here. The results are the slow part and stream separately below.
  const categories = await discovery.categories();
  const activeCategory = readParam(params, "category");

  // A location counts as one filter, not as three query parameters.
  const hasLocation = filters.near !== undefined;

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

        {/* ── Categories ────────────────────────────────────────────── */}
        <nav
          aria-label="Categories"
          className="border-line flex flex-wrap items-center justify-between gap-4 border-b pb-6"
        >
          <ul className="flex flex-wrap items-center gap-2">
            <li>
              <CategoryPill href="/experiences" active={activeCategory === ""}>
                All
              </CategoryPill>
            </li>
            {categories.map((category) => (
              <li key={category.key}>
                <CategoryPill
                  href={`/experiences?${new URLSearchParams({ category: category.key }).toString()}`}
                  active={activeCategory === category.key}
                >
                  {category.name}
                </CategoryPill>
              </li>
            ))}
          </ul>

          <Link
            href="/viveniq"
            className="bg-cta text-cta-fg hover:bg-cta-hover focus-visible:outline-primary inline-flex h-10 items-center gap-2 rounded-pill px-5 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ask VivenIQ
          </Link>
        </nav>

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
            ? "See everything available, or describe the moment to VivenIQ instead."
            : "Every listing is reviewed by our team before it appears. The first ones are on their way."
        }
        action={
          active > 0 ? (
            <ButtonLink href="/experiences" variant="secondary" size="sm">
              See all experiences
            </ButtonLink>
          ) : undefined
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

/**
 * One category pill. The active one is filled in the primary green with a gold
 * hairline — the same pairing the approved references use for a selected
 * navigation item — so the current choice reads without a second colour.
 */
function CategoryPill({
  href,
  active,
  children,
}: {
  readonly href: string;
  readonly active: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center rounded-pill border px-5 text-[13px] transition-colors",
        "focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2",
        active
          ? "border-accent bg-primary text-text-inverse"
          : "border-line bg-surface text-fg hover:border-line-strong",
      )}
    >
      {children}
    </Link>
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
