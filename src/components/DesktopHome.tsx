import { DesktopHeader } from "@/components/DesktopHeader";
import { DesktopHero } from "@/components/DesktopHero";
import { ExperienceCard } from "@/components/ExperienceCard";
import { Footer } from "@/components/Footer";
import { JourneyRail } from "@/components/journeys/JourneyRail";
import type { HomeData } from "@/components/MobileHome";
import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import { cn } from "@/lib/cn";

const shell = "mx-auto w-full max-w-[1440px] px-8 xl:px-12 3xl:max-w-[1680px]";

/**
 * The desktop product surface: 3 Canonical Sections.
 * 1. Hero with curated proof points
 * 2. Signature Journeys (3-act arcs)
 * 3. The Collection (curated individual venues)
 */
export function DesktopHome(props: HomeData) {
  const { signedIn, accountHref, initials, stories, heroImage, heroImages, journeys } = props;

  return (
    <div className="hidden lg:block bg-bg text-fg">
      <DesktopHeader signedIn={signedIn} accountHref={accountHref} initials={initials} />

      <main id="d-top">
        {/* Section 1: Hero */}
        <DesktopHero images={heroImages ?? [heroImage]} />

        {/* Section 2: Signature Journeys */}
        {journeys.length > 0 ? (
          <section
            id="d-journeys"
            aria-labelledby="lv-journeys-desktop"
            className={cn(shell, "scroll-mt-24 pt-16 pb-28")}
          >
            <Reveal>
              <SectionHeader
                id="lv-journeys-desktop"
                title="Signature Journeys"
                action="Explore All Journeys"
                href="/journeys"
                size="lg"
              />
            </Reveal>
            <Reveal delay={80}>
              <JourneyRail journeys={journeys} className="mt-8" />
            </Reveal>
          </section>
        ) : null}

        {/* Section 3: The Collection */}
        <section
          id="d-collection"
          aria-labelledby="lv-collection-desktop"
          className={cn(shell, "pb-28")}
        >
          <Reveal>
            <SectionHeader
              id="lv-collection-desktop"
              title="The Collection"
              action="View All Venues"
              href="/experiences"
              size="lg"
            />
          </Reveal>

          <ul className="mt-8 grid grid-cols-3 gap-6 xl:gap-8">
            {stories.slice(0, 6).map((experience, index) => (
              <Reveal
                as="li"
                key={experience.id}
                delay={index * 80}
                className="h-[460px] xl:h-[500px]"
              >
                <ExperienceCard
                  experience={experience}
                  href={experience.href}
                  className="h-full w-full"
                  sizes="(max-width: 1279px) 33vw, 30vw"
                />
              </Reveal>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}
