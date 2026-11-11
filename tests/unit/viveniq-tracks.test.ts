import { describe, expect, it } from "vitest";

import { createPilotDiscoveryRepository } from "@/adapters/persistence/prisma/pilot-discovery-fallback";
import type { ExperienceCuration } from "@/modules/discovery/curation";
import type {
  CategorySummary,
  DiscoveryFilters,
  ExperienceSummary,
} from "@/modules/discovery/ports";
import { DiscoveryService } from "@/modules/discovery/service";
import type { Page } from "@/modules/shared/pagination";
import type { TravelPreferences } from "@/modules/user-profile/profile";
import { VivenIQService, extractTerms } from "@/modules/viveniq/service";
import { detectMood, selectTrackPicks, trackOrder } from "@/modules/viveniq/tracks";
import type { LlmPort } from "@/ports/llm";

/**
 * Curated mood tracks. An experiential question ("mujhe beer pini hai") is
 * answered with contrasting evenings, each carrying the perks and time saved
 * that make booking through La Vivenzia worth it — and a stated taste profile
 * changes the answer only in ways the reply then admits to.
 */

const curation = (
  curationTrack: ExperienceCuration["curationTrack"],
  extra: Partial<ExperienceCuration> = {},
): ExperienceCuration => ({
  curationTrack,
  vipPerks: [`${curationTrack} perk one`, `${curationTrack} perk two`],
  curatorSecret: `${curationTrack} secret`,
  timeSavedMinutes: 30,
  ...extra,
});

function listing(overrides: Partial<ExperienceSummary> & { slug: string }): ExperienceSummary {
  return {
    id: overrides.slug,
    title: overrides.slug,
    summary: null,
    city: "Pune",
    region: "Maharashtra",
    country: "IN",
    categoryKey: "culinary",
    categoryName: "Culinary",
    durationMinutes: 120,
    minGuests: 1,
    maxGuests: 10,
    basePriceMinor: 149_900,
    currency: "INR",
    pricingUnit: "PER_PERSON",
    coverUrl: null,
    coverAlt: null,
    hostName: "Host",
    publishedAt: null,
    distanceMetres: null,
    curation: null,
    ...overrides,
  };
}

const brewery = listing({
  slug: "brewery",
  title: "Kalyani Brewery: Craft Beer Flight",
  curation: curation("CONNOISSEUR", { curatedPairing: "Witbier with sourdough pizza" }),
});
const terrace = listing({
  slug: "terrace",
  title: "Fountain Beer Terrace",
  curation: curation("ALFRESCO_SUNDOWNER", { timeSavedMinutes: 45 }),
});
const bidding = listing({
  slug: "bidding-bar",
  title: "Bidding Bar: Drinks and DJ Nights",
  categoryKey: "celebrations",
  curation: curation("HIGH_OCTANE_NIGHTLIFE"),
});
const spa = listing({
  slug: "spa",
  title: "Quiet Spa Ritual",
  categoryKey: "wellness",
  curation: curation("MINDFUL_WELLNESS"),
});

function page(items: readonly ExperienceSummary[]): Page<ExperienceSummary> {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    totalPages: 1,
  } as Page<ExperienceSummary>;
}

function fakeDiscovery(catalogue: readonly ExperienceSummary[]) {
  const searched: DiscoveryFilters[] = [];
  return {
    searched,
    discovery: {
      browse: async (filters: DiscoveryFilters) => {
        searched.push(filters);
        const term = filters.search?.toLowerCase();
        return page(
          term ? catalogue.filter((item) => item.title.toLowerCase().includes(term)) : catalogue,
        );
      },
      featured: async (limit = 6) => catalogue.slice(0, limit),
      categories: async (): Promise<CategorySummary[]> => [],
    },
  };
}

const CATALOGUE = [brewery, terrace, bidding, spa];
const CALM: TravelPreferences = {
  dietary: [],
  vibes: ["sunset_retreats", "culinary_tastings"],
  clusters: [],
};

describe("mood detection", () => {
  it("reads Hinglish and English cravings", () => {
    expect(detectMood("mujhe beer pini hai")?.key).toBe("drinks");
    expect(detectMood("weekend plan")?.key).toBe("plan");
    expect(detectMood("romantic dinner for two")?.key).toBe("dining");
    expect(detectMood("i need to unwind")?.key).toBe("unwind");
    expect(detectMood("birthday party")?.key).toBe("nightlife");
  });

  it("leaves a specific request alone", () => {
    expect(detectMood("pottery wheel workshop")).toBeNull();
  });

  it("drops Hinglish filler so it never becomes a keyword scan", () => {
    expect(extractTerms("mujhe beer pini hai")).toEqual(["beer"]);
  });
});

describe("track order", () => {
  const drinks = detectMood("beer")!;

  it("follows the mood when no taste is known", () => {
    expect(trackOrder(drinks, null)).toEqual([
      "CONNOISSEUR",
      "ALFRESCO_SUNDOWNER",
      "HIGH_OCTANE_NIGHTLIFE",
    ]);
  });

  it("moves high energy last for a calm profile", () => {
    expect(trackOrder(drinks, { dietary: [], vibes: ["sunset_retreats"], clusters: [] })).toEqual([
      "ALFRESCO_SUNDOWNER",
      "CONNOISSEUR",
      "HIGH_OCTANE_NIGHTLIFE",
    ]);
  });
});

describe("selectTrackPicks", () => {
  const candidate = (experience: ExperienceSummary, score = 1) => ({
    experience,
    score,
    rank: 0,
    matched: new Set<string>(),
  });

  it("declines when the candidates cannot offer two contrasting moods", () => {
    expect(
      selectTrackPicks({
        candidates: [candidate(brewery)],
        mood: detectMood("beer")!,
        seen: new Set(),
        limit: 3,
      }),
    ).toBeNull();
  });

  it("ignores uncurated listings", () => {
    const plain = listing({ slug: "plain-bar", title: "Plain Beer Bar" });
    const selection = selectTrackPicks({
      candidates: [candidate(plain, 9), candidate(brewery), candidate(terrace)],
      mood: detectMood("beer")!,
      seen: new Set(),
      limit: 3,
    });
    expect(selection?.picks.map((pick) => pick.experience.slug)).toEqual(["brewery", "terrace"]);
  });
});

describe("VivenIQ curated tracks", () => {
  it("answers a craving with three contrasting tracks", async () => {
    const { discovery } = fakeDiscovery(CATALOGUE);
    const result = await new VivenIQService({ discovery }).respond({
      message: "mujhe beer pini hai",
    });

    expect(result.picks.map((pick) => pick.curation?.track)).toEqual([
      "CONNOISSEUR",
      "ALFRESCO_SUNDOWNER",
      "HIGH_OCTANE_NIGHTLIFE",
    ]);
    // The bidding bar has no "beer" in its title: only the catalogue sweep
    // finds it, and it says why it was chosen.
    expect(result.picks[2]!.reason).toBe("Curated for a craft pour");
  });

  it("puts perks, time saved and per-person price on every pick", async () => {
    const { discovery } = fakeDiscovery(CATALOGUE);
    const result = await new VivenIQService({ discovery }).respond({ message: "beer tonight" });

    for (const pick of result.picks) {
      expect(pick.curation?.vipPerks.length).toBeGreaterThan(0);
      expect(pick.curation?.timeSavedLabel).toMatch(/^Saves ~\d+ min/);
      expect(pick.priceLabel).toMatch(/\/ person$/);
    }
  });

  it("writes an editorial reply, not an index", async () => {
    const { discovery } = fakeDiscovery(CATALOGUE);
    const { reply } = await new VivenIQService({ discovery }).respond({ message: "beer" });

    expect(reply).toMatch(/^Three ways to take that pour/);
    expect(reply).toContain(
      "The Connoisseur’s Table: Kalyani Brewery — Witbier with sourdough pizza.",
    );
    expect(reply).toContain("saves up to 45 minutes");
    expect(reply).toContain("pay once at booking, then simply show up");
    expect(reply).not.toMatch(/For this, I’d begin|I’ve set aside/);
  });

  it("acknowledges a calm taste profile and keeps the high-decibel room out", async () => {
    const { discovery } = fakeDiscovery(CATALOGUE);
    const result = await new VivenIQService({ discovery }).respond({
      message: "beer",
      preferences: CALM,
    });

    expect(result.picks.map((pick) => pick.slug)).not.toContain("bidding-bar");
    expect(result.reply).toMatch(/^Two ways/);
    expect(result.reply).toContain(
      "Noticing your penchant for sunset retreats and culinary tastings",
    );
    expect(result.reply).toContain("set the high-decibel rooms aside");
  });

  it("says nothing about taste when the profile changed nothing", async () => {
    const { discovery } = fakeDiscovery(CATALOGUE);
    const result = await new VivenIQService({ discovery }).respond({
      message: "beer",
      preferences: { dietary: ["vegetarian"], vibes: [], clusters: [] },
    });

    expect(result.reply).not.toContain("penchant");
  });

  it("still filters tracks by party size", async () => {
    const { discovery } = fakeDiscovery([brewery, { ...terrace, maxGuests: 2 }, bidding]);
    const result = await new VivenIQService({ discovery }).respond({
      message: "beer for 6 people",
    });

    expect(result.picks.map((pick) => pick.slug)).toEqual(["brewery", "bidding-bar"]);
    expect(result.reply).toContain("Each one hosts a party of 6.");
  });

  it("adds no catalogue sweep when nothing found is curated", async () => {
    const plain = listing({ slug: "plain-bar", title: "Plain Beer Bar" });
    const { discovery, searched } = fakeDiscovery([plain]);
    const result = await new VivenIQService({ discovery }).respond({ message: "beer" });

    expect(searched.filter((filters) => filters.search === undefined)).toHaveLength(0);
    expect(result.reply).toBe("Plain Beer Bar, in Pune, Maharashtra, is where I’d begin.");
  });

  it("adds the curator's note to a specific request", async () => {
    const pottery = listing({
      slug: "pottery",
      title: "Clay Wheel Pottery",
      curation: curation("ARTISANAL_FOCUS", { curatorSecret: "Ask for the red clay" }),
    });
    const { discovery } = fakeDiscovery([pottery]);
    const { reply } = await new VivenIQService({ discovery }).respond({ message: "pottery" });

    expect(reply).toBe(
      "Clay Wheel Pottery, in Pune, Maharashtra, is where I’d begin. A note from our curators: Ask for the red clay.",
    );
  });

  it("shows the model the curation and taste, never asking it to choose", async () => {
    const calls: Parameters<LlmPort["generateStructured"]>[0][] = [];
    const llm: LlmPort = {
      generateStructured: (async (input) => {
        calls.push(input);
        return { reply: "Three evenings, three moods." };
      }) as LlmPort["generateStructured"],
    };
    const { discovery } = fakeDiscovery(CATALOGUE);
    const result = await new VivenIQService({ discovery, llm }).respond({
      message: "beer",
      preferences: CALM,
    });

    expect(result.reply).toBe("Three evenings, three moods.");
    const prompt = JSON.parse(calls[0]!.prompt) as {
      traveller: { tasteProfile: string[] };
      presentAsCuratedTracks: boolean;
      experiences: Record<string, unknown>[];
    };
    expect(prompt.presentAsCuratedTracks).toBe(true);
    expect(prompt.traveller.tasteProfile).toEqual(["Sunset retreats", "Culinary tastings"]);
    expect(prompt.experiences[0]).toMatchObject({
      curationTrack: "The Connoisseur’s Table",
      vipPerks: expect.any(Array),
      curatorSecret: expect.any(String),
    });
  });
});

describe("VivenIQ over the real pilot catalogue", () => {
  const discovery = new DiscoveryService({
    discovery: createPilotDiscoveryRepository((key) => key),
  });

  it("answers 'mujhe beer pini hai' with three different beer evenings", async () => {
    const result = await new VivenIQService({ discovery }).respond({
      message: "mujhe beer pini hai",
    });

    const tracks = result.picks.map((pick) => pick.curation?.track);
    expect(new Set(tracks).size).toBe(3);
    expect(result.picks.every((pick) => pick.curation !== null)).toBe(true);
  });

  it("answers 'weekend plan' across more than one category", async () => {
    const result = await new VivenIQService({ discovery }).respond({ message: "weekend plan" });

    expect(result.picks).toHaveLength(3);
    expect(new Set(result.picks.map((pick) => pick.categoryName)).size).toBeGreaterThan(1);
  });
});
