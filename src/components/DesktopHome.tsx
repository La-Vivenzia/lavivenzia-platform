import { AIGenieFeature } from "@/components/AIGenieFeature";
import { CategoryNavigation } from "@/components/CategoryNavigation";
import { DesktopHeader } from "@/components/DesktopHeader";
import { DesktopHero } from "@/components/DesktopHero";
import { DestinationCard } from "@/components/DestinationCard";
import { ExperienceCard } from "@/components/ExperienceCard";
import { Footer } from "@/components/Footer";
import { GenieSparkle, iconMap } from "@/components/icons";
import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import { pillars } from "@/data/content";
import type { HomeData } from "@/components/MobileHome";
import { cn } from "@/lib/cn";

const shell = "mx-auto w-full max-w-[1440px] px-8 xl:px-12 3xl:max-w-[1680px]";

/** Widths that give the popular-destination mosaic an editorial rhythm. */
const mosaic = [
  "xl:col-span-5",
  "xl:col-span-4",
  "xl:col-span-3",
  "xl:col-span-3",
  "xl:col-span-4",
  "xl:col-span-5",
];

/**
 * The desktop interpretation of the same brand system — wider grid, larger
 * imagery, more whitespace, and its own content order.
 */
export function DesktopHome(props: HomeData) {
  const { signedIn, accountHref, initials, curated, popular, stories, quickAccess, heroImage } =
    props;

  return (
    <div className="hidden lg:block">
      <DesktopHeader signedIn={signedIn} accountHref={accountHref} initials={initials} />

      <main id="d-top">
        <DesktopHero image={heroImage} />

        {/* Quick discovery */}
        <section aria-labelledby="lv-discovery" className={cn(shell, "pb-24")}>
          <Reveal>
            <h2
              id="lv-discovery"
              className="eyebrow border-t border-line pt-8 text-[11px] text-fg-subtle"
            >
              Quick Discovery
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <CategoryNavigation items={quickAccess} variant="expanded" className="mt-8" />
          </Reveal>
        </section>

        {/* Curated for you */}
        <section id="d-curated" aria-labelledby="lv-curated-desktop" className={cn(shell, "pb-28")}>
          <Reveal>
            <SectionHeader
              id="lv-curated-desktop"
              title="Curated for You"
              action="View All"
              href="/destinations"
              size="lg"
            />
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed font-light text-fg-muted">
              Chosen this month by our planners, based on where you have been looking and how you
              like to travel.
            </p>
          </Reveal>

          <ul className="mt-12 grid grid-cols-2 gap-6 xl:grid-cols-4 xl:gap-7">
            {curated.map((destination, index) => (
              <Reveal as="li" key={destination.id} delay={index * 70}>
                <DestinationCard
                  destination={destination}
                  href={destination.href}
                  sizes="(max-width: 1279px) 45vw, 22vw"
                />
              </Reveal>
            ))}
          </ul>
        </section>

        <AIGenieFeature />

        {/* Popular destinations — editorial mosaic */}
        <section id="d-popular" aria-labelledby="lv-popular-desktop" className={cn(shell, "py-28")}>
          <Reveal>
            <SectionHeader
              id="lv-popular-desktop"
              title="Popular Destinations"
              action="View All"
              href="/destinations"
              size="lg"
            />
          </Reveal>

          <ul className="mt-12 grid grid-cols-12 gap-6">
            {popular.map((destination, index) => (
              <Reveal
                as="li"
                key={destination.id}
                delay={(index % 3) * 70}
                className={cn("col-span-4 h-[340px] xl:h-[420px]", mosaic[index])}
              >
                <DestinationCard
                  destination={destination}
                  variant="overlay"
                  href={destination.href}
                  className="h-full w-full"
                  sizes="(max-width: 1279px) 33vw, 40vw"
                />
              </Reveal>
            ))}
          </ul>
        </section>

        {/* Signature experiences */}
        <section
          id="d-experiences"
          aria-labelledby="lv-experiences-desktop"
          className={cn(shell, "py-28")}
        >
          <Reveal>
            <SectionHeader
              id="lv-experiences-desktop"
              title="Signature Experiences"
              action="View All"
              href="#d-experiences"
              size="lg"
            />
          </Reveal>

          <ul className="mt-12 grid grid-cols-3 gap-6 xl:gap-7">
            {stories.map((experience, index) => (
              <Reveal
                as="li"
                key={experience.id}
                delay={index * 80}
                className="h-[480px] xl:h-[540px]"
              >
                <ExperienceCard
                  experience={experience}
                  href="#d-experiences"
                  className="h-full w-full"
                  sizes="(max-width: 1279px) 33vw, 30vw"
                />
              </Reveal>
            ))}
          </ul>
        </section>

        {/* Why La Vivenzia */}
        <section id="d-about" aria-labelledby="lv-about" className="bg-bg-soft">
          <div className={cn(shell, "py-24")}>
            <Reveal>
              <h2 id="lv-about" className="eyebrow text-[11px] text-fg-subtle">
                Why La Vivenzia
              </h2>
            </Reveal>
            <ul className="mt-10 grid grid-cols-3 gap-12 xl:gap-16">
              {pillars.map((pillar, index) => {
                const Icon =
                  pillar.icon === "genie"
                    ? GenieSparkle
                    : iconMap[pillar.icon as keyof typeof iconMap];
                return (
                  <Reveal as="li" key={pillar.title} delay={index * 80}>
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-primary ring-1 ring-line dark:text-accent">
                      <Icon className="h-6 w-6" strokeWidth={1.4} aria-hidden="true" />
                    </span>
                    <h3 className="mt-6 font-display text-[22px] leading-tight text-heading xl:text-2xl">
                      {pillar.title}
                    </h3>
                    <p className="mt-3 max-w-[36ch] text-[14.5px] leading-[1.7] font-light text-fg-muted">
                      {pillar.body}
                    </p>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
