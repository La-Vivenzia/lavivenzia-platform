import { DestinationCard } from "@/components/DestinationCard";
import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import type { LinkedDestination } from "@/lib/home-content";

/** Mobile "Popular Destinations" — full-bleed overlay cards on a scroll rail. */
export function PopularDestinations({ items }: { readonly items: readonly LinkedDestination[] }) {
  if (items.length === 0) return null;

  return (
    <section id="m-popular" aria-labelledby="lv-popular" className="pt-10">
      <Reveal className="px-5">
        <SectionHeader
          id="lv-popular"
          title="Popular Destinations"
          action="View All"
          href="/destinations"
        />
      </Reveal>

      <Reveal delay={80}>
        <ul className="rail mt-5 gap-3 px-5 pb-2">
          {items.map((destination) => (
            <li
              key={destination.id}
              className="rail-item aspect-[5/4] w-[210px] xs:w-[224px] sm:w-[260px]"
            >
              <DestinationCard
                destination={destination}
                variant="overlay"
                href={destination.href}
                className="h-full w-full"
                sizes="(max-width: 640px) 70vw, 280px"
              />
            </li>
          ))}
          <li aria-hidden="true" className="rail-item w-1" />
        </ul>
      </Reveal>
    </section>
  );
}
