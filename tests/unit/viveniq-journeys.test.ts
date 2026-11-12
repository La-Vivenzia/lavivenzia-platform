import { describe, expect, it } from "vitest";

import { PILOT_EXPERIENCES } from "@/data/pune-pilot";
import type { DiscoveryFilters, ExperienceSummary } from "@/modules/discovery/ports";
import { listCuratedJourneys } from "@/modules/journeys/data";
import type { Page } from "@/modules/shared/pagination";
import {
  OCCASION_INTENTS,
  composeJourneyLead,
  detectOccasion,
  selectJourneys,
} from "@/modules/viveniq/journeys";
import { seenJourneyKey } from "@/modules/viveniq/options";
import { VivenIQService, acceptReply } from "@/modules/viveniq/service";

const journeys = listCuratedJourneys();
const occasion = (key: string) => OCCASION_INTENTS.find((intent) => intent.key === key)!;

/** The pilot catalogue as discovery would publish it. */
const published: ExperienceSummary[] = PILOT_EXPERIENCES.map((listing) => ({
  id: listing.slug,
  slug: listing.slug,
  title: listing.title,
  summary: listing.summary,
  city: "Pune",
  region: "Maharashtra",
  country: "IN",
  categoryKey: null,
  categoryName: null,
  durationMinutes: listing.durationMinutes,
  minGuests: 1,
  maxGuests: 10,
  basePriceMinor: listing.basePriceMinor,
  currency: "INR",
  pricingUnit: "PER_PERSON",
  coverUrl: `https://images.unsplash.com/${listing.slug}`,
  coverAlt: listing.altText,
  hostName: "Host",
  publishedAt: null,
  distanceMetres: null,
}));

function page(items: readonly ExperienceSummary[]): Page<ExperienceSummary> {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    totalPages: 1,
  } as Page<ExperienceSummary>;
}

const discovery = {
  browse: async (filters: DiscoveryFilters) => {
    const term = filters.search?.toLowerCase();
    return page(
      term ? published.filter((item) => item.title.toLowerCase().includes(term)) : published,
    );
  },
  featured: async (limit = 6) => published.slice(0, limit),
  categories: async () => [],
};

describe("occasion detection", () => {
  it("reads the occasion a traveller describes", () => {
    expect(detectOccasion("plan a date night for us")?.key).toBe("date");
    expect(detectOccasion("our anniversary is on friday")?.key).toBe("date");
    expect(detectOccasion("birthday plans for my brother")?.key).toBe("celebration");
    expect(detectOccasion("a chill evening")?.key).toBe("unwind");
    expect(detectOccasion("weekend plan in pune")?.key).toBe("weekend");
  });

  it("does not read a headcount or a specific craving as an occasion", () => {
    expect(detectOccasion("table for a party of 6")).toBeNull();
    expect(detectOccasion("mujhe craft beer pini hai")).toBeNull();
    expect(detectOccasion("thrilling 60-minute escape challenge")).toBeNull();
  });
});

describe("journey selection", () => {
  it("offers journeys that answer the occasion, leading ones first", () => {
    const picked = selectJourneys({
      journeys,
      occasion: occasion("date"),
      seen: new Set(),
      wantsMore: false,
      limit: 3,
    });
    expect(picked).toHaveLength(3);
    for (const journey of picked) expect(journey.occasions).toContain("date");
    expect(picked[0]!.occasions[0]).toBe("date");
  });

  it("drops journeys already shown when asked for something different", () => {
    const first = selectJourneys({
      journeys,
      occasion: occasion("date"),
      seen: new Set(),
      wantsMore: false,
      limit: 3,
    });
    const seen = new Set(first.map((journey) => seenJourneyKey(journey.id)));
    const again = selectJourneys({
      journeys,
      occasion: occasion("date"),
      seen,
      wantsMore: true,
      limit: 3,
    });
    for (const journey of again) expect(seen.has(seenJourneyKey(journey.id))).toBe(false);
  });

  it("lets a calm taste profile sink the high-energy arcs", () => {
    const picked = selectJourneys({
      journeys,
      occasion: occasion("weekend"),
      taste: { dietary: [], vibes: ["sunset_retreats"], clusters: [] },
      seen: new Set(),
      wantsMore: false,
      limit: 2,
    });
    for (const journey of picked) expect(journey.occasions).not.toContain("celebration");
  });

  it("writes a lead the factual-claim guard accepts", () => {
    const lead = composeJourneyLead(occasion("date"), journeys.slice(0, 3));
    expect(lead).toMatch(
      /^Rather than isolated venues, I have sequenced three complete evening arcs/,
    );
    expect(acceptReply({ reply: lead })).toBe(lead);
  });
});

describe("VivenIQ experience curation mode", () => {
  it("answers an occasion with whole journeys alongside the picks", async () => {
    const service = new VivenIQService({ discovery, journeys: listCuratedJourneys });
    const reply = await service.respond({ message: "Plan a romantic date night" });

    expect(reply.journeys?.length).toBeGreaterThan(0);
    expect(reply.reply).toMatch(/^Rather than isolated venues/);
    const first = reply.journeys![0]!;
    const source = journeys.find((journey) => journey.id === first.id)!;
    expect(first.acts.map((act) => act.slug)).toEqual(
      source.chapters.map((chapter) => chapter.experienceSlug),
    );
    expect(first.priceLabel).toContain("/ person");
    for (const act of first.acts) {
      expect(act.coverUrl).toBe(`https://images.unsplash.com/${act.slug}`);
      expect(act.privilegeConfirmed).toBe(false);
    }
  });

  it("offers no journeys without an occasion or without the collection", async () => {
    const withCollection = new VivenIQService({ discovery, journeys: listCuratedJourneys });
    expect((await withCollection.respond({ message: "Toit craft beer" })).journeys).toBeUndefined();

    const without = new VivenIQService({ discovery });
    expect((await without.respond({ message: "Plan a date night" })).journeys).toBeUndefined();
  });

  it("does not offer a journey an act cannot seat", async () => {
    const tight = {
      ...discovery,
      browse: async (filters: DiscoveryFilters) => {
        const result = await discovery.browse(filters);
        return page(result.items.map((item) => ({ ...item, maxGuests: 2 })));
      },
    };
    const service = new VivenIQService({ discovery: tight, journeys: listCuratedJourneys });
    const reply = await service.respond({ message: "birthday plan for 6 people" });
    expect(reply.journeys).toBeUndefined();
  });
});
