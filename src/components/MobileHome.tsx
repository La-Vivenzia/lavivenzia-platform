import { AIGenieSection } from "@/components/AIGenieSection";
import { BottomNavigation } from "@/components/BottomNavigation";
import { CategoryNavigation } from "@/components/CategoryNavigation";
import { CuratedSection } from "@/components/CuratedSection";
import { ExperiencesSection } from "@/components/ExperiencesSection";
import { Hero } from "@/components/Hero";
import { LiveTrackingSection } from "@/components/LiveTrackingFeature";
import { MobileHeader } from "@/components/MobileHeader";
import { PopularDestinations } from "@/components/PopularDestinations";
import { Reveal } from "@/components/Reveal";
import { SearchBar } from "@/components/SearchBar";
import { brand } from "@/data/content";
import type {
  HeroImage,
  LinkedDestination,
  LinkedExperience,
  QuickAccessItem,
} from "@/lib/home-content";

/**
 * The mobile product surface. Designed first, on its own terms — the desktop
 * layout is a separate interpretation rather than this stretched wide.
 */
export function MobileHome(props: HomeData) {
  const { signedIn, accountHref, initials, curated, popular, stories, quickAccess, heroImage } =
    props;

  return (
    <div className="lg:hidden">
      <MobileHeader signedIn={signedIn} accountHref={accountHref} initials={initials} />

      <main id="m-top" className="pb-32">
        <Hero image={heroImage} />

        {/* Rides up over the lower edge of the hero photograph. */}
        <div className="relative z-20 -mt-7 px-5">
          <SearchBar className="sm:max-w-[560px]" />
        </div>

        <Reveal className="px-5 pt-7" delay={60}>
          <CategoryNavigation items={quickAccess} />
        </Reveal>

        <CuratedSection items={curated} />
        <AIGenieSection />
        <LiveTrackingSection />
        <PopularDestinations items={popular} />
        <ExperiencesSection items={stories} />

        <Reveal className="px-5 pt-12">
          <p className="border-t border-line pt-7 text-center text-[9px] tracking-[0.16em] text-fg-subtle uppercase xs:text-[10px] xs:tracking-[0.2em] sm:tracking-[0.24em]">
            Travel <span className="mx-1.5 text-accent xs:mx-2">·</span> Explore
            <span className="mx-1.5 text-accent xs:mx-2">·</span> Experience
            <span className="mx-1.5 text-accent xs:mx-2">·</span> Belong
          </p>
          <p className="mt-4 text-center font-display text-[13px] text-fg-muted">{brand.tagline}</p>
        </Reveal>
      </main>

      <BottomNavigation />
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
}
