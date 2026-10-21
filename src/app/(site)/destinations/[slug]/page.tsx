import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { getDiscoveryService } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { parseFilters } from "@/modules/discovery/service";
import { toDestinationCard } from "@/lib/home-content";
import type { Destination } from "@/modules/discovery/ports";

/** Cached so metadata and the page share one read. */
const load = cache(async (slug: string): Promise<Destination | null> => {
  try {
    return await getDiscoveryService().getDestination(slug);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const destination = await load(slug);

  // Before the response streams, so the status is a real 404. See the note on
  // the experience page.
  if (!destination) notFound();

  return {
    title: destination.city,
    description: `Curated experiences in ${destination.city}.`,
  };
}

/** Experiences in one place (FR-01). Reuses the same filtered browse query. */
export default async function DestinationPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const destination = await load(slug);
  if (!destination) notFound();

  const pageParam = query.page;
  const page = await getDiscoveryService().browse(
    parseFilters({
      destination: slug,
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
          eyebrow="Destination"
          title={destination.city}
          description={[destination.region, destination.country].filter(Boolean).join(", ")}
          action={
            <Link
              href="/destinations"
              className="text-fg-muted hover:text-heading text-[13px] transition-colors"
            >
              ← All destinations
            </Link>
          }
        />

        <p className="text-fg-subtle text-[11px] tracking-[0.16em] uppercase">
          {page.total} {page.total === 1 ? "experience" : "experiences"}
        </p>

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
