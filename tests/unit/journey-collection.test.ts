import { describe, expect, it } from "vitest";

import { PILOT_EXPERIENCES } from "@/data/pune-pilot";
import {
  CHAPTER_ROLES,
  JOURNEY_OCCASIONS,
  JourneyDefinitionError,
  TRANSITION_MINUTES,
  findJourney,
  listCuratedJourneys,
  listJourneys,
  resolveCuratedJourneys,
} from "@/modules/journeys/data";

const catalogue = new Map(PILOT_EXPERIENCES.map((listing) => [listing.slug, listing]));

describe("curated journey collection", () => {
  const journeys = listCuratedJourneys();

  it("holds the featured four first, then the signature collection", () => {
    expect(journeys.map((journey) => journey.id)).toEqual([
      "nocturne-epicurean",
      "adrenaline-pulse",
      "mindful-sanctuary",
      "grand-date-night",
      "starlit-romance",
      "sunset-mindfulness-supper",
      "pune-craft-pilgrimage",
      "adrenaline-nightlife-sprint",
      "secret-mezzanine-date",
      "fast-fun-weekend",
      "artisanal-dessert-crawl",
    ]);
    expect(listJourneys().map((journey) => journey.id)).toEqual(
      journeys.filter((journey) => journey.featured).map((journey) => journey.id),
    );
    expect(listJourneys()).toHaveLength(4);
  });

  it("gives every journey two or three acts in arc order", () => {
    for (const journey of journeys) {
      expect([2, 3]).toContain(journey.chapters.length);
      expect(journey.chapters.map((chapter) => chapter.role)).toEqual(
        CHAPTER_ROLES.slice(0, journey.chapters.length),
      );
    }
    expect(journeys.some((journey) => journey.chapters.length === 2)).toBe(true);
  });

  it("leaves a realistic transition between consecutive acts", () => {
    for (const journey of journeys) {
      journey.chapters.forEach((chapter, index) => {
        const previous = journey.chapters[index - 1];
        if (!previous) return;
        const gap = chapter.startMinute - previous.endMinute;
        expect(gap).toBeGreaterThanOrEqual(TRANSITION_MINUTES.min);
        expect(gap).toBeLessThanOrEqual(TRANSITION_MINUTES.max);
      });
    }
  });

  it("copies price, pin and time saved from the listing", () => {
    for (const journey of journeys) {
      for (const chapter of journey.chapters) {
        const listing = catalogue.get(chapter.experienceSlug)!;
        expect(chapter.priceMinor).toBe(listing.basePriceMinor);
        expect(chapter.coordinates).toEqual({ lat: listing.latitude, lng: listing.longitude });
        expect(chapter.timeSavedMinutes).toBe(listing.curation.timeSavedMinutes);
        expect(chapter.privilege.confirmed).toBe(false);
      }
      expect(journey.totalPriceMinor).toBe(
        journey.chapters.reduce((sum, chapter) => sum + chapter.priceMinor, 0),
      );
      expect(journey.timeSavedMinutes).toBe(
        journey.chapters.reduce((sum, chapter) => sum + chapter.timeSavedMinutes, 0),
      );
    }
    // Pinned: the Starlit Romance is the ₹2,849 evening.
    expect(findJourney("starlit-romance")!.totalPriceMinor).toBe(135000 + 149900);
  });

  it("tags every journey with known occasions, and every occasion is answered", () => {
    const answered = new Set(journeys.flatMap((journey) => journey.occasions));
    for (const journey of journeys) {
      expect(journey.occasions.length).toBeGreaterThan(0);
      for (const occasion of journey.occasions) expect(JOURNEY_OCCASIONS).toContain(occasion);
    }
    expect([...answered].sort()).toEqual([...JOURNEY_OCCASIONS].sort());
  });

  it("finds a journey by id, and nothing for an unknown one", () => {
    expect(findJourney("fast-fun-weekend")?.title).toBe("The Twilight Bowling & Bidding Sprint");
    expect(findJourney("nope")).toBeUndefined();
  });

  it("refuses a transition that runs too long", () => {
    // Shortening the rooftop leaves the Starlit Romance a gap beyond the limit.
    const shorter = PILOT_EXPERIENCES.map((listing) =>
      listing.slug === "spice-factory-rooftop-cocktails-hadapsar"
        ? { ...listing, durationMinutes: 60 }
        : listing,
    );
    expect(() => resolveCuratedJourneys(shorter)).toThrow(JourneyDefinitionError);
    expect(() => resolveCuratedJourneys(shorter)).toThrow(/transitions run/);
  });
});
