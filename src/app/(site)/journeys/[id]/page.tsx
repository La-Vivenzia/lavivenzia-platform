import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PageBody } from "@/components/PageHeader";
import {
  JourneyExperienceView,
  type JourneyActMedia,
} from "@/components/journeys/JourneyExperienceView";
import { GUEST_COOKIE, guestPatronIdOf } from "@/app/api/v1/taste-genome/_identity";
import { getPrincipal } from "@/lib/auth-context";
import { getCheckoutService, getDiscoveryService, getTasteGenomeService } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { getLogger } from "@/lib/logger";
import type { CheckoutMode } from "@/modules/booking/contract";
import { findJourney, type Journey } from "@/modules/journeys/data";
import {
  computeSensoryMatch,
  describeSensoryProfile,
  type SensoryMatch,
} from "@/modules/viveniq/sensory-vector";

/**
 * A curated journey as one experience (Signature Curated Experiences): the
 * arc, its sensory profile, the Digital VIP Pass and the companion map.
 *
 * The journey itself is static curation, so an unknown id is a 404 decided
 * before anything streams. Each act's cover and availability are read from the
 * live catalogue; if the catalogue cannot be read the page still renders,
 * without covers, and the pass endpoint re-checks every act at issue.
 */

/** The checkout mode, degrading to "off" rather than taking the page down (ADR-0016). */
function checkoutMode(): CheckoutMode {
  try {
    return getCheckoutService().mode;
  } catch (error) {
    getLogger().error(
      { err: error },
      "booking checkout is misconfigured; journey booking is closed",
    );
    return "off";
  }
}

async function actMedia(journey: Journey): Promise<JourneyActMedia[]> {
  return Promise.all(
    journey.chapters.map(async (chapter): Promise<JourneyActMedia> => {
      try {
        const listing = await getDiscoveryService().getExperience(chapter.experienceSlug);
        return { coverUrl: listing.coverUrl, coverAlt: listing.coverAlt ?? "", available: true };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { coverUrl: null, coverAlt: "", available: false };
        }
        getLogger().warn(
          { err: error, slug: chapter.experienceSlug },
          "journey page could not read an act's listing; rendering without it",
        );
        return { coverUrl: null, coverAlt: "", available: null };
      }
    }),
  );
}

/**
 * How the evening suits the visitor's Taste Genome, or null when there is no
 * genome to compare against. Personalisation is never a dependency: a failed
 * session or genome read renders the page without it.
 */
async function sensoryMatch(journey: Journey): Promise<SensoryMatch | null> {
  try {
    const principal = await getPrincipal();
    const patronId = principal
      ? `user:${principal.userId}`
      : guestPatronIdOf((await cookies()).get(GUEST_COOKIE)?.value);
    if (!patronId) return null;
    const match = computeSensoryMatch(await getTasteGenomeService().getGenome(patronId), journey);
    return match.score === null ? null : match;
  } catch (error) {
    getLogger().warn(
      { err: error, journey: journey.id },
      "journey page could not read the taste genome; rendering without a sensory match",
    );
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const journey = findJourney(id);
  // Decided before streaming, so an unknown id is a real 404 (route-structure.test.ts).
  if (!journey) notFound();

  return {
    title: `${journey.title} — Curated Experience`,
    description: journey.tagline,
    alternates: { canonical: `/journeys/${journey.id}` },
    openGraph: { title: journey.title, description: journey.tagline, type: "website" },
  };
}

export default async function JourneyPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { map } = await searchParams;
  const journey = findJourney(id);
  if (!journey) notFound();

  const [media, match] = await Promise.all([actMedia(journey), sensoryMatch(journey)]);

  return (
    <PageBody>
      <JourneyExperienceView
        journey={journey}
        media={media}
        sensory={describeSensoryProfile(journey.sensoryProfile)}
        sensoryMatch={match}
        checkoutMode={checkoutMode()}
        initialMapOpen={map === "1"}
      />
    </PageBody>
  );
}
