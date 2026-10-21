import { DestinationCard } from "@/components/DestinationCard";
import { EmptyState } from "@/components/ui/feedback";
import type { LinkedDestination } from "@/lib/home-content";

/**
 * The grid every browse surface renders results into.
 *
 * `/experiences`, `/destinations`, `/categories/[key]` and `/destinations/[slug]`
 * all showed a grid of listings, and each had grown its own column counts, gaps
 * and card treatment. One component now, so a change to the catalogue's
 * appearance is one edit rather than four that drift.
 *
 * It uses the approved `DestinationCard` — the same component the home rails
 * use — rather than a browse-specific variant. A listing should not change
 * shape depending on which page found it.
 */
export function CatalogueGrid({
  items,
  empty,
}: {
  readonly items: readonly LinkedDestination[];
  readonly empty?: { readonly title: string; readonly description: string };
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={empty?.title ?? "Nothing here yet"}
        description={
          empty?.description ??
          "Every listing is reviewed by our team before it appears. The first ones are on their way."
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
      {items.map((item, index) => (
        <li key={item.id}>
          <DestinationCard
            destination={item}
            href={item.href}
            sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 22vw"
            /* Only the first row is eager: below the fold, lazy is correct. */
            priority={index < 4}
          />
        </li>
      ))}
    </ul>
  );
}
