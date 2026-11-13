import Link from "next/link";
import { ArrowRight, CalendarCheck, Compass, KeyRound, MapPin, ShieldCheck, Sparkles } from "lucide-react";

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

const steps = [
  {
    step: "01",
    title: "Curate or Compose",
    description:
      "Choose a choreographed 3-act evening crafted by local experts, or describe your desired mood to VivenIQ for a personalized sequence.",
    icon: Compass,
  },
  {
    step: "02",
    title: "One Seamless Pass",
    description:
      "Lock in every venue, table, and privilege in a single transaction. No disjointed apps, no juggling deposits, no surprise covers.",
    icon: CalendarCheck,
  },
  {
    step: "03",
    title: "VIP Entry & Companion Map",
    description:
      "Arrive at each destination with your digital pass and secret host keyword. Follow real-time walking or transit routing between every chapter.",
    icon: KeyRound,
  },
];

const standards = [
  {
    title: "Curator Vetted Only",
    body: "Every dining room, cocktail mezzanine, and sanctuary is inspected in person. We never list open directories or unverified spots.",
    icon: ShieldCheck,
  },
  {
    title: "Guaranteed Host Privileges",
    body: "Your reservation includes an exclusive touch — from the best table in the room to complimentary chef pours and priority seating.",
    icon: Sparkles,
  },
  {
    title: "Single Point of Care",
    body: "One concierge team coordinates with all venue managers on your behalf. Any timing adjustment is handled across the entire arc.",
    icon: MapPin,
  },
];

/**
 * The desktop product surface.
 * 6 Canonical Sections:
 * 1. Hero with curated proof points
 * 2. Signature Journeys (3-act arcs)
 * 3. The Collection (curated individual venues)
 * 4. How It Works (the 3-step luxury model)
 * 5. The La Vivenzia Standard
 * 6. Closing VivenIQ Invitation
 */
export function DesktopHome(props: HomeData) {
  const { signedIn, accountHref, initials, stories, heroImage, journeys } = props;

  return (
    <div className="hidden lg:block bg-bg text-fg">
      <DesktopHeader signedIn={signedIn} accountHref={accountHref} initials={initials} />

      <main id="d-top">
        {/* Section 1: Hero */}
        <DesktopHero image={heroImage} />

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
              <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed font-light text-fg-muted">
                Three venues sequenced into a harmonious evening across Amanora, Seasons, and
                Magarpatta. Reserved in one pass with exclusive patron privileges at each stop.
              </p>
            </Reveal>
            <Reveal delay={140}>
              <JourneyRail journeys={journeys} className="mt-10" />
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
          <Reveal delay={80}>
            <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed font-light text-fg-muted">
              Individual culinary, wellness, and nightlife venues in Pune, each with a verified host
              and exclusive La Vivenzia privilege.
            </p>
          </Reveal>

          <ul className="mt-12 grid grid-cols-3 gap-6 xl:gap-8">
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

        {/* Section 4: How It Works */}
        <section id="d-how-it-works" aria-labelledby="lv-how-desktop" className="border-y border-line bg-surface/50 py-24">
          <div className={shell}>
            <Reveal>
              <div className="text-center max-w-[640px] mx-auto">
                <span className="eyebrow text-[11px] text-accent tracking-[0.2em] uppercase">
                  Effortless Luxury
                </span>
                <h2 id="lv-how-desktop" className="mt-3 font-display text-3xl xl:text-4xl text-heading">
                  How La Vivenzia Works
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-fg-muted font-light">
                  No scattered reservations, no table lotteries. A choreographed evening from first
                  welcome to the final digestif.
                </p>
              </div>
            </Reveal>

            <div className="mt-16 grid grid-cols-3 gap-8 xl:gap-12">
              {steps.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.step} delay={idx * 90}>
                    <div className="relative rounded-card border border-line bg-surface p-8 shadow-card transition-all duration-300 hover:border-line-strong hover:shadow-raised">
                      <span className="font-display text-4xl font-extralight text-accent/50">
                        {item.step}
                      </span>
                      <div className="mt-6 flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/10 text-accent">
                          <Icon className="h-5 w-5" strokeWidth={1.6} />
                        </span>
                        <h3 className="font-display text-xl text-heading font-normal">
                          {item.title}
                        </h3>
                      </div>
                      <p className="mt-4 text-[14px] leading-relaxed text-fg-muted font-light">
                        {item.description}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 5: The La Vivenzia Standard */}
        <section id="d-standard" aria-labelledby="lv-standard-desktop" className="py-24">
          <div className={shell}>
            <Reveal>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-12 border-b border-line">
                <div>
                  <span className="eyebrow text-[11px] text-accent tracking-[0.2em] uppercase">
                    The Promise
                  </span>
                  <h2 id="lv-standard-desktop" className="mt-2 font-display text-3xl xl:text-4xl text-heading">
                    The La Vivenzia Standard
                  </h2>
                </div>
                <p className="max-w-[48ch] text-[14.5px] leading-relaxed text-fg-muted font-light">
                  Curated specifically for guests who value their evening too much to leave it to
                  chance or generic crowd-sourced reviews.
                </p>
              </div>
            </Reveal>

            <ul className="mt-12 grid grid-cols-3 gap-10 xl:gap-14">
              {standards.map((pillar, index) => {
                const Icon = pillar.icon;
                return (
                  <Reveal as="li" key={pillar.title} delay={index * 80}>
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/20">
                      <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <h3 className="mt-6 font-display text-[21px] leading-tight text-heading">
                      {pillar.title}
                    </h3>
                    <p className="mt-3 text-[14px] leading-[1.7] font-light text-fg-muted">
                      {pillar.body}
                    </p>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Section 6: Closing Invitation to VivenIQ */}
        <section id="d-cta" className={cn(shell, "pb-28")}>
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] border border-line-strong bg-gradient-to-br from-surface via-surface-2 to-surface p-12 xl:p-16 shadow-raised">
              <div className="relative z-10 max-w-[700px]">
                <span className="eyebrow inline-flex items-center gap-2 text-[11.5px] font-medium tracking-[0.2em] text-accent uppercase">
                  <Sparkles className="h-4 w-4" /> Personalized Curation
                </span>
                <h2 className="mt-4 font-display text-3xl xl:text-5xl text-heading leading-[1.15]">
                  Have a specific evening in mind? Let VivenIQ choreograph it.
                </h2>
                <p className="mt-5 text-[15.5px] leading-relaxed text-fg-muted font-light">
                  Tell our AI concierge what you are celebrating, your culinary taste, or who you
                  are with. We will sequence the ideal multi-venue itinerary in seconds.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    href="/viveniq"
                    className="inline-flex h-12 items-center gap-2.5 rounded-pill bg-accent px-8 text-[14px] font-medium text-accent-fg shadow-card transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-accent-ink"
                  >
                    Curate with VivenIQ
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/experiences"
                    className="inline-flex h-12 items-center justify-center rounded-pill border border-line-strong px-7 text-[14px] font-medium text-heading transition-colors hover:bg-surface-2"
                  >
                    Browse The Collection
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <Footer />
    </div>
  );
}
