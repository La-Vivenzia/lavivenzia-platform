import Link from "next/link";
import { ArrowRight, CalendarCheck, Compass, KeyRound, MapPin, ShieldCheck, Sparkles } from "lucide-react";

import { BottomNavigation } from "@/components/BottomNavigation";
import { ExperiencesSection } from "@/components/ExperiencesSection";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { JourneyRail } from "@/components/journeys/JourneyRail";
import { MobileHeader } from "@/components/MobileHeader";
import { Reveal } from "@/components/Reveal";
import { SearchBar } from "@/components/SearchBar";
import { SectionHeader } from "@/components/SectionHeader";
import type {
  HeroImage,
  LinkedDestination,
  LinkedExperience,
  QuickAccessItem,
} from "@/lib/home-content";
import type { Journey } from "@/modules/journeys/data";
import type { Trip } from "@/modules/trips/data";

const steps = [
  {
    step: "01",
    title: "Curate or Compose",
    description:
      "Choose a signature 3-act evening or describe your mood to VivenIQ for a personalized sequence.",
    icon: Compass,
  },
  {
    step: "02",
    title: "One Seamless Pass",
    description:
      "Lock in every venue, table, and privilege in a single transaction with zero split deposits.",
    icon: CalendarCheck,
  },
  {
    step: "03",
    title: "VIP Entry & Companion Map",
    description:
      "Arrive at each destination with your digital pass and secret host keyword. Follow real-time routing.",
    icon: KeyRound,
  },
];

const standards = [
  {
    title: "Curator Vetted Only",
    body: "Every dining room, cocktail lounge, and sanctuary is inspected in person.",
    icon: ShieldCheck,
  },
  {
    title: "Guaranteed Host Privileges",
    body: "Your reservation includes an exclusive touch — best table, chef pour, or priority seating.",
    icon: Sparkles,
  },
  {
    title: "Single Point of Care",
    body: "One concierge coordinates with all venue managers on your behalf.",
    icon: MapPin,
  },
];

/**
 * Mobile product surface: 6 Canonical Sections.
 * 1. Mobile Hero + Search Bar
 * 2. Signature Journeys (3-act arcs)
 * 3. The Collection (curated listings)
 * 4. How It Works (3 steps)
 * 5. The La Vivenzia Standard
 * 6. Closing VivenIQ Invitation
 */
export function MobileHome(props: HomeData) {
  const {
    signedIn,
    accountHref,
    initials,
    stories,
    heroImage,
    heroImages,
    journeys,
  } = props;

  return (
    <div className="lg:hidden bg-bg text-fg">
      <MobileHeader signedIn={signedIn} accountHref={accountHref} initials={initials} />

      <main id="m-top" className="pb-12">
        {/* Section 1: Hero */}
        <Hero images={heroImages ?? [heroImage]} />

        {/* Search bar riding over hero edge */}
        <div className="relative z-20 -mt-7 px-5">
          <SearchBar className="sm:max-w-[560px]" />
        </div>

        {/* Section 2: Signature Journeys */}
        {journeys.length > 0 ? (
          <section
            id="m-journeys"
            aria-labelledby="lv-journeys"
            className="scroll-mt-20 px-5 pt-12"
          >
            <Reveal>
              <SectionHeader
                id="lv-journeys"
                title="Signature Journeys"
                action="Explore All"
                href="/journeys"
              />
              <p className="mt-2 text-[13px] leading-relaxed font-light text-fg-muted">
                Three chapters, one evening in East Pune — each with a privilege of its own.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <JourneyRail journeys={journeys} className="mt-5" />
            </Reveal>
          </section>
        ) : null}

        {/* Section 3: The Collection */}
        <div className="pt-4">
          <ExperiencesSection items={stories} />
        </div>

        {/* Section 4: How It Works */}
        <section id="m-how-it-works" className="mt-12 border-y border-line bg-surface/50 px-5 py-10">
          <Reveal>
            <div className="text-center">
              <span className="eyebrow text-[10px] text-accent tracking-[0.2em] uppercase">
                Effortless Luxury
              </span>
              <h2 className="mt-2 font-display text-2xl text-heading">
                How It Works
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted font-light">
                A choreographed evening from welcome to digestif.
              </p>
            </div>
          </Reveal>

          <div className="mt-8 flex flex-col gap-4">
            {steps.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.step} delay={idx * 60}>
                  <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                    <div className="flex items-center gap-3">
                      <span className="font-display text-2xl font-light text-accent">
                        {item.step}
                      </span>
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-accent">
                        <Icon className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <h3 className="font-display text-[16px] text-heading font-medium">
                        {item.title}
                      </h3>
                    </div>
                    <p className="mt-2.5 text-[12.5px] leading-relaxed text-fg-muted font-light">
                      {item.description}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Section 5: The Standard */}
        <section id="m-standard" className="px-5 pt-12">
          <Reveal>
            <span className="eyebrow text-[10px] text-accent tracking-[0.2em] uppercase">
              The Promise
            </span>
            <h2 className="mt-1 font-display text-2xl text-heading">
              The La Vivenzia Standard
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-muted font-light">
              Curated for guests who value their evening too much to leave it to chance.
            </p>
          </Reveal>

          <div className="mt-6 flex flex-col gap-5">
            {standards.map((pillar, index) => {
              const Icon = pillar.icon;
              return (
                <Reveal key={pillar.title} delay={index * 60}>
                  <div className="flex gap-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/20">
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <div>
                      <h3 className="font-display text-[15px] font-medium text-heading">
                        {pillar.title}
                      </h3>
                      <p className="mt-1 text-[12.5px] leading-relaxed font-light text-fg-muted">
                        {pillar.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Section 6: Closing Invitation */}
        <section id="m-cta" className="px-5 pt-12">
          <Reveal>
            <div className="rounded-card border border-line-strong bg-surface p-6 shadow-card">
              <span className="eyebrow inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.16em] text-accent uppercase">
                <Sparkles className="h-3.5 w-3.5" /> Personalized Evening
              </span>
              <h2 className="mt-3 font-display text-xl text-heading leading-snug">
                Have a specific evening in mind? Let VivenIQ curate it.
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted font-light">
                Tell our AI concierge what you are celebrating or who you are with.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <Link
                  href="/viveniq"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-pill bg-accent px-5 text-[13.5px] font-medium text-accent-fg"
                >
                  Curate with VivenIQ
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/experiences"
                  className="inline-flex h-11 items-center justify-center rounded-pill border border-line px-5 text-[13px] font-medium text-heading"
                >
                  Browse The Collection
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <Footer />
      <BottomNavigation accountHref={accountHref} />
    </div>
  );
}

/** The live session and catalogue the home screen renders from. */
export interface HomeData {
  readonly signedIn: boolean;
  readonly accountHref: string;
  readonly initials?: string;
  readonly curated: readonly LinkedDestination[];
  readonly popular: readonly LinkedDestination[];
  readonly stories: readonly LinkedExperience[];
  readonly quickAccess: readonly QuickAccessItem[];
  readonly heroImage: HeroImage;
  /** The crossfading hero slides; falls back to `heroImage` alone. */
  readonly heroImages?: readonly HeroImage[];
  readonly journeys: readonly Journey[];
  readonly trips: readonly Trip[];
}
