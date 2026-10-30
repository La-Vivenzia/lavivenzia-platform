import type { Metadata } from "next";
import { CopilotProvider } from "@/components/copilot/CopilotProvider";
import { DesktopHome } from "@/components/DesktopHome";
import { MobileHome } from "@/components/MobileHome";
import { getDiscoveryService } from "@/lib/container";
import { getPrincipal } from "@/lib/auth-context";
import { destinationForRoles } from "@/lib/destinations";
import {
  destinationToCard,
  initialsFor,
  toDestinationCard,
  toExperienceCard,
  toHeroImage,
  toQuickAccess,
} from "@/lib/home-content";
import { listJourneys } from "@/modules/journeys/data";

export const metadata: Metadata = {
  title: "La Vivenzia — Journeys Designed Around You",
  description:
    "Curated experiences led by the people who know a place best. Every host verified, every listing reviewed.",
};

/**
 * The traveller home screen (FR-01).
 *
 * The layout is the founder-approved design, ported from the demo that produced
 * the reference images rather than reinterpreted from them. **The content is
 * the live catalogue**, not the demo fixture: the rails render published
 * listings, the cards link to their real pages, the search submits to
 * `/experiences`, and the header reflects the actual session.
 *
 * A server component reading through the service directly, so the page arrives
 * complete rather than assembling itself from client fetches — and so the
 * session is resolved before anything renders, rather than flashing a signed-out
 * header at someone who is signed in.
 *
 * Two layouts, not one responsive tree: `MobileHome` and `DesktopHome` are
 * separate interpretations that swap at `lg`, which is how the approved design
 * is built. The desktop view is not the mobile one stretched wide.
 *
 * It sits outside the `(site)` route group deliberately — that group supplies a
 * shared header and footer, and this screen brings its own.
 */
export default async function HomePage() {
  const discovery = getDiscoveryService();

  const [featured, destinations, categories, principal] = await Promise.all([
    discovery.featured(12),
    discovery.destinations(8),
    discovery.categories(),
    getPrincipal(),
  ]);

  /*
   * `toDestinationCard` and friends return null for a listing with no
   * photograph. The approved design is photography-led throughout, and a grey
   * rectangle in a rail of images reads as a broken asset rather than as a
   * listing awaiting a photo.
   */
  const curated = featured
    .map(toDestinationCard)
    .filter((card): card is NonNullable<typeof card> => card !== null);

  const popular = destinations
    .map(destinationToCard)
    .filter((card): card is NonNullable<typeof card> => card !== null);

  const stories = featured
    .map(toExperienceCard)
    .filter((card): card is NonNullable<typeof card> => card !== null)
    .slice(0, 4);

  const session = {
    signedIn: principal !== null,
    accountHref: principal ? destinationForRoles(principal.roles) : "/sign-in",
    ...(principal?.email ? { initials: initialsFor(principal.email) } : {}),
    curated,
    popular,
    stories,
    quickAccess: toQuickAccess(categories),
    heroImage: toHeroImage(featured),
    journeys: listJourneys(),
  };

  return (
    <CopilotProvider>
      <MobileHome {...session} />
      <DesktopHome {...session} />
    </CopilotProvider>
  );
}
