import { DestinationCard } from "@/components/DestinationCard";
import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import type { LinkedDestination } from "@/lib/home-content";

/**
 * Mobile "Curated for You" — a horizontal rail that keeps the page gutter.
 *
 * Takes the published catalogue rather than the demo fixture it was ported
 * with. It renders nothing when there is nothing published: an empty rail with
 * a heading over it reads as a loading failure, and the page below it still
 * makes sense without this section.
 */
export function CuratedSection({ items }: { readonly items: readonly LinkedDestination[] }) {
  if (items.length === 0) return null;

  return (
    <section id="m-curated" aria-labelledby="lv-curated" className="pt-9">
      <Reveal className="px-5">
        <SectionHeader
          id="lv-curated"
          title="Curated for You"
          action="View All"
          href="/experiences"
        />
      </Reveal>

      <Reveal delay={80}>
        <ul className="rail mt-5 gap-3 px-5 pb-2">
          {items.map((destination, index) => (
            <li key={destination.id} className="rail-item xs:w-[164px] w-[156px] sm:w-[188px]">
              <DestinationCard
                destination={destination}
                href={destination.href}
                sizes="(max-width: 640px) 60vw, 200px"
                priority={index === 0}
              />
            </li>
          ))}
          {/* Trailing spacer so the last card can clear the gutter cleanly. */}
          <li aria-hidden="true" className="rail-item w-1" />
        </ul>
      </Reveal>
    </section>
  );
}
