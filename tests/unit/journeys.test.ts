import { describe, expect, it } from "vitest";

import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import { formatClock } from "@/lib/format";
import {
  ARCHETYPES,
  PROFILE_QUESTIONS,
  ProfileAnswerError,
  matchArchetype,
  passReference,
  scoreAnswers,
  type ProfileAnswers,
} from "@/modules/journeys/archetypes";
import {
  CHAPTER_ROLES,
  JourneyDefinitionError,
  listJourneys,
  resolveJourneys,
} from "@/modules/journeys/data";

const catalogue = new Map(PILOT_EXPERIENCES.map((listing) => [listing.slug, listing]));

describe("curated journeys", () => {
  const journeys = listJourneys();

  it("defines the four launch journeys", () => {
    expect(journeys.map((journey) => journey.title)).toEqual([
      "The Nocturne Epicurean",
      "The Adrenaline Pulse",
      "The Mindful Sanctuary",
      "The Grand Date Night",
    ]);
    expect(new Set(journeys.map((journey) => journey.id)).size).toBe(journeys.length);
  });

  it("sequences each journey as prelude, centerpiece, epilogue", () => {
    for (const journey of journeys) {
      expect(journey.chapters.map((chapter) => chapter.role)).toEqual(CHAPTER_ROLES);
      expect(journey.chapters.map((chapter) => chapter.label)).toEqual([
        "Prelude",
        "Centerpiece",
        "Epilogue",
      ]);
    }
  });

  it("uses the venues the founders specified, in order", () => {
    const venues = Object.fromEntries(
      journeys.map((journey) => [journey.id, journey.chapters.map((c) => c.experienceSlug)]),
    );
    expect(venues).toEqual({
      "nocturne-epicurean": [
        "third-wave-coffee-artisan-roastery-amanora",
        "effingut-brewhouse-craft-tasting-seasons",
        "spice-factory-rooftop-cocktails-hadapsar",
      ],
      "adrenaline-pulse": [
        "mystery-rooms-escape-challenge-amanora",
        "smaaash-vr-twilight-bowling-amanora",
        "the-beer-cafe-global-taps-amanora",
      ],
      "mindful-sanctuary": [
        "amanora-lake-sunset-walk-and-mindfulness",
        "o2-spa-aromatherapy-and-reflexology-seasons",
        "the-flour-works-european-garden-brunch",
      ],
      "grand-date-night": [
        "the-flour-works-european-garden-brunch",
        "cinepolis-vip-luxury-cinema-seasons",
        "absolute-barbecues-wish-grill-seasons",
      ],
    });
  });

  it("copies price, duration and title from the catalogue, never its own", () => {
    for (const journey of journeys) {
      for (const chapter of journey.chapters) {
        const listing = catalogue.get(chapter.experienceSlug)!;
        expect(chapter.priceMinor).toBe(listing.basePriceMinor);
        expect(chapter.durationMinutes).toBe(listing.durationMinutes);
        expect(chapter.experienceTitle).toBe(listing.title);
        expect(chapter.endMinute - chapter.startMinute).toBe(listing.durationMinutes);
      }
    }
  });

  it("totals the combined per-person price as the sum of chapter prices", () => {
    for (const journey of journeys) {
      const sum = journey.chapters.reduce((total, chapter) => total + chapter.priceMinor, 0);
      expect(journey.totalPriceMinor).toBe(sum);
      expect(Number.isInteger(journey.totalPriceMinor)).toBe(true);
      expect(journey.currency).toBe("INR");
    }
    // Pinned once, so a catalogue reprice is a visible change here.
    const nocturne = journeys.find((journey) => journey.id === "nocturne-epicurean")!;
    expect(nocturne.totalPriceMinor).toBe(45000 + 149900 + 135000);
  });

  it("runs chapters in order without overlap, and measures the whole evening", () => {
    for (const journey of journeys) {
      journey.chapters.forEach((chapter, index) => {
        const previous = journey.chapters[index - 1];
        if (previous) expect(chapter.startMinute).toBeGreaterThanOrEqual(previous.endMinute);
      });
      const first = journey.chapters[0]!;
      const last = journey.chapters[journey.chapters.length - 1]!;
      expect(journey.totalDurationMinutes).toBe(last.endMinute - first.startMinute);
    }
  });

  it("ships every privilege unconfirmed until a venue agrees to it", () => {
    for (const journey of journeys) {
      for (const chapter of journey.chapters) {
        expect(chapter.privilege.title.length).toBeGreaterThan(0);
        expect(chapter.privilege.detail.length).toBeGreaterThan(0);
        expect(chapter.privilege.confirmed).toBe(false);
      }
    }
  });

  it("refuses a journey that names a listing missing from the catalogue", () => {
    const withoutEffingut = PILOT_EXPERIENCES.filter(
      (listing) => listing.slug !== "effingut-brewhouse-craft-tasting-seasons",
    );
    expect(() => resolveJourneys(withoutEffingut)).toThrow(JourneyDefinitionError);
  });

  it("refuses to sum a chapter that is priced per group", () => {
    const grouped: PilotExperienceInput[] = PILOT_EXPERIENCES.map((listing) =>
      listing.slug === "cinepolis-vip-luxury-cinema-seasons"
        ? { ...listing, pricingUnit: "PER_GROUP" }
        : listing,
    );
    expect(() => resolveJourneys(grouped)).toThrow(/not priced per person/);
  });

  it("refuses a chapter that would overlap the one before it", () => {
    const longer = PILOT_EXPERIENCES.map((listing) =>
      listing.slug === "mystery-rooms-escape-challenge-amanora"
        ? { ...listing, durationMinutes: 240 }
        : listing,
    );
    expect(() => resolveJourneys(longer)).toThrow(/starts before/);
  });
});

describe("formatClock", () => {
  it("formats minutes after midnight as a 24-hour clock, wrapping past midnight", () => {
    expect(formatClock(16 * 60 + 30)).toBe("16:30");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(24 * 60 + 30)).toBe("00:30");
  });
});

describe("taste archetypes", () => {
  const journeyIds = new Set(listJourneys().map((journey) => journey.id));

  /** Answer every question with the option at `index`. */
  const allAt = (index: number): ProfileAnswers =>
    Object.fromEntries(PROFILE_QUESTIONS.map((q) => [q.id, q.options[index]!.id]));

  it("asks three questions", () => {
    expect(PROFILE_QUESTIONS).toHaveLength(3);
    for (const question of PROFILE_QUESTIONS) {
      expect(new Set(question.options.map((option) => option.id)).size).toBe(
        question.options.length,
      );
    }
  });

  it("points every archetype at a journey that exists, one each", () => {
    for (const archetype of ARCHETYPES) expect(journeyIds.has(archetype.journeyId)).toBe(true);
    expect(new Set(ARCHETYPES.map((archetype) => archetype.journeyId)).size).toBe(
      ARCHETYPES.length,
    );
  });

  it("matches a consistent profile to its archetype", () => {
    expect(matchArchetype(allAt(0)).id).toBe("epicure");
    expect(matchArchetype(allAt(1)).id).toBe("thrill-seeker");
    expect(matchArchetype(allAt(2)).id).toBe("restorer");
    expect(matchArchetype(allAt(3)).id).toBe("romantic");
  });

  it("makes every archetype reachable", () => {
    const reached = new Set<string>();
    const [a, b, c] = PROFILE_QUESTIONS;
    for (const x of a!.options)
      for (const y of b!.options)
        for (const z of c!.options)
          reached.add(matchArchetype({ [a!.id]: x.id, [b!.id]: y.id, [c!.id]: z.id }).id);
    expect([...reached].sort()).toEqual(ARCHETYPES.map((archetype) => archetype.id).sort());
  });

  it("lets a later answer outweigh the first", () => {
    // Restorer opening (3), then romantic pace (2) and romantic memory (2): 4 beats 3.
    expect(matchArchetype({ evening: "quiet", pace: "cinematic", memory: "look" }).id).toBe(
      "romantic",
    );
  });

  it("breaks ties by archetype order, deterministically", () => {
    // epicure 3+1 = 4 vs romantic 2+2 = 4 → epicure, which is listed first.
    const answers = { evening: "aroma", pace: "cinematic", memory: "look" };
    const scores = scoreAnswers(answers);
    expect(scores.epicure).toBe(scores.romantic);
    expect(matchArchetype(answers).id).toBe("epicure");
  });

  it("rejects an incomplete or invalid set of answers", () => {
    expect(() => matchArchetype({ evening: "aroma" })).toThrow(ProfileAnswerError);
    expect(() => matchArchetype({ ...allAt(0), pace: "nonsense" })).toThrow(ProfileAnswerError);
  });
});

describe("passReference", () => {
  it("is stable for the same inputs and differs across journeys", () => {
    const reference = passReference("epicure", "nocturne-epicurean");
    expect(reference).toMatch(/^LV-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(passReference("epicure", "nocturne-epicurean")).toBe(reference);
    expect(passReference("romantic", "grand-date-night")).not.toBe(reference);
  });
});
