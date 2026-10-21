import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { getDiscoveryService } from "@/lib/container";
import { AppError } from "@/lib/errors";
import { parseFilters } from "@/modules/discovery/service";
import { toDestinationCard } from "@/lib/home-content";
import type { CategorySummary } from "@/modules/discovery/ports";

/** Cached so metadata and the page share one read. */
const load = cache(async (key: string): Promise<CategorySummary | null> => {
  try {
    return await getDiscoveryService().getCategory(key);
  } catch (error) {
    // A not-found and a malformed key are both "no such page" to a visitor.
    // Anything retryable is a real fault and must not be disguised as a 404.
    if (error instanceof AppError && !error.isRetryable) return null;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const category = await load(key);

  // Resolved before the response streams, so the status is a real 404 rather
  // than a 200 that later renders a not-found body.
  if (!category) notFound();

  return {
    title: category.name,
    description: category.description ?? `Curated ${category.name.toLowerCase()} experiences.`,
  };
}

/**
 * Experiences of one kind (FR-01).
 *
 * The same filtered browse query as everywhere else — a category page is a
 * saved filter with an editorial heading, not a second retrieval path. A link
 * through to the full filters is offered, so a traveller who wants to narrow by
 * price or location is not stranded here.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly key: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ key }, query] = await Promise.all([params, searchParams]);

  const category = await load(key);
  if (!category) notFound();

  const pageParam = query.page;
  const page = await getDiscoveryService().browse(
    parseFilters({
      category: key,
      page: (Array.isArray(pageParam) ? pageParam[0] : pageParam) ?? undefined,
    }),
  );

  const cards = page.items
    .map(toDestinationCard)
    .filter((card): card is NonNullable<typeof card> => card !== null);

  return (
    <PageBody>
      <div className="flex flex-col gap-10">
        <PageHeader
          eyebrow="Collection"
          title={category.name}
          {...(category.description ? { description: category.description } : {})}
          action={
            <Link
              href="/categories"
              className="text-fg-muted hover:text-heading text-[13px] transition-colors"
            >
              ← All collections
            </Link>
          }
        />

        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-fg-subtle text-[11px] tracking-[0.16em] uppercase">
            {page.total} {page.total === 1 ? "experience" : "experiences"}
          </p>
          <Link
            href={`/experiences?category=${encodeURIComponent(category.key)}`}
            className="text-accent-ink hover:text-heading text-[13px] transition-colors"
          >
            Refine with filters →
          </Link>
        </div>

        <CatalogueGrid
          items={cards}
          empty={{
            title: "Nothing published here yet",
            description: "Experiences appear as soon as our team approves them.",
          }}
        />
      </div>
    </PageBody>
  );
}
