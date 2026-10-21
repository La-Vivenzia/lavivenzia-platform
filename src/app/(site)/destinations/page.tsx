import type { Metadata } from "next";

import { CatalogueGrid } from "@/components/CatalogueGrid";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { getDiscoveryService } from "@/lib/container";
import { destinationToCard } from "@/lib/home-content";

export const metadata: Metadata = {
  title: "Destinations",
  description: "The places with something worth travelling for.",
};

/**
 * Destination discovery (FR-01).
 *
 * Uses the shared masthead and catalogue grid, so a destination card here is
 * the same object as a destination card on the home rail — same radius, same
 * scrim, same hover. Before this milestone each surface had its own.
 */
export default async function DestinationsPage() {
  const destinations = await getDiscoveryService().destinations();

  const cards = destinations
    .map(destinationToCard)
    .filter((card): card is NonNullable<typeof card> => card !== null);

  return (
    <PageBody>
      <div className="flex flex-col gap-10">
        <PageHeader
          eyebrow="Where to go"
          title="Destinations"
          description="Places with something worth travelling for. A destination appears here as soon as it has a published experience in it."
        />

        <CatalogueGrid
          items={cards}
          empty={{
            title: "No destinations yet",
            description: "Destinations appear here as soon as an experience in them is approved.",
          }}
        />
      </div>
    </PageBody>
  );
}
