import { ExperienceCard } from "@/components/ExperienceCard";
import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import type { LinkedExperience } from "@/lib/home-content";

/** Mobile "Signature Experiences" rail. */
export function ExperiencesSection({ items }: { readonly items: readonly LinkedExperience[] }) {
  if (items.length === 0) return null;

  return (
    <section id="m-experiences" aria-labelledby="lv-experiences" className="pt-10">
      <Reveal className="px-5">
        <SectionHeader
          id="lv-experiences"
          title="Signature Experiences"
          action="View All"
          href="#m-experiences"
        />
      </Reveal>

      <Reveal delay={80}>
        <ul className="rail mt-5 gap-3 px-5 pb-2">
          {items.map((experience) => (
            <li
              key={experience.id}
              className="rail-item aspect-[4/5] w-[248px] xs:w-[262px] sm:w-[300px]"
            >
              <ExperienceCard
                experience={experience}
                href="#m-experiences"
                className="h-full w-full"
                sizes="(max-width: 640px) 80vw, 320px"
              />
            </li>
          ))}
          <li aria-hidden="true" className="rail-item w-1" />
        </ul>
      </Reveal>
    </section>
  );
}
