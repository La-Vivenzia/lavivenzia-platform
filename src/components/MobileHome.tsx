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

/**
 * Mobile product surface: 3 Canonical Sections.
 * 1. Mobile Hero + Search Bar
 * 2. Signature Journeys (3-act arcs)
 * 3. The Collection (curated listings)
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
            </Reveal>
            <Reveal delay={80}>
              <JourneyRail journeys={journeys} className="mt-4" />
            </Reveal>
          </section>
        ) : null}

        {/* Section 3: The Collection */}
        <div className="pt-4 pb-6">
          <ExperiencesSection items={stories} />
        </div>
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
