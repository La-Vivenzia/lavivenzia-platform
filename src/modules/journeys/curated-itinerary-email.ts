import { AppError } from "@/lib/errors";
import { formatClock, formatDuration } from "@/lib/format";
import { chapterNumeral } from "@/modules/booking/journey-chapters";
import { actDirectionsUrl } from "@/modules/booking/journey-pass-email";
import type { EmailTemplatePayloads } from "@/modules/notifications/email-templates";
import type { EmailPort, SendEmailResult } from "@/ports/email";

import type { Journey } from "./data";

/**
 * The itinerary email for a journey saved to "My Curations".
 *
 * Built from the catalogue journey and nothing else: no availability, price or
 * booking status is stated, because saving a curation reserves nothing
 * (CLAUDE.md §7).
 */

type ItineraryVariables = EmailTemplatePayloads["traveler.curated-itinerary"];

export function curatedItineraryEmailVariables(
  journey: Journey,
  partySize: number | null,
  appUrl: string,
): ItineraryVariables {
  const journeyUrl = new URL(`/journeys/${encodeURIComponent(journey.id)}`, appUrl);
  journeyUrl.searchParams.set("map", "1");
  return {
    journeyTitle: journey.title,
    mood: journey.mood,
    tagline: journey.tagline,
    duration: formatDuration(journey.totalDurationMinutes) ?? "",
    partySize,
    acts: journey.chapters.map((chapter, index) => ({
      heading: `Chapter ${chapterNumeral(index)} · ${chapter.label}`,
      title: chapter.experienceTitle,
      startsAt: formatClock(chapter.startMinute),
      addressLine: chapter.addressLine,
      privilege: chapter.privilege.title,
      privilegeConfirmed: chapter.privilege.confirmed,
      directionsUrl: actDirectionsUrl(chapter.coordinates),
    })),
    journeyUrl: journeyUrl.toString(),
  };
}

/** Send the itinerary, retrying once when the provider says a retry could succeed. */
export async function sendCuratedItinerary(
  email: EmailPort,
  input: {
    readonly to: string;
    readonly journey: Journey;
    readonly partySize: number | null;
    readonly appUrl: string;
  },
): Promise<SendEmailResult> {
  const message = {
    to: input.to,
    template: "traveler.curated-itinerary",
    variables: curatedItineraryEmailVariables(input.journey, input.partySize, input.appUrl),
  } as const;

  try {
    return await email.send(message);
  } catch (error) {
    if (error instanceof AppError && error.isRetryable) return email.send(message);
    throw error;
  }
}
