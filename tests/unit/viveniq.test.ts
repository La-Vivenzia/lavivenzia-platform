import { describe, expect, it } from "vitest";

import type {
  CategorySummary,
  DiscoveryFilters,
  ExperienceSummary,
} from "@/modules/discovery/ports";
import type { Page } from "@/modules/shared/pagination";
import {
  VivenIQService,
  extractTerms,
  mentionsTime,
  parsePartySize,
  priceLabel,
} from "@/modules/viveniq/service";

/**
 * VivenIQ interprets and ranks; discovery decides what exists. These tests pin
 * the rule from CLAUDE.md §7 — every fact on a pick is the listing's own — and
 * the interpretation that turns a sentence into keyword queries.
 */

function listing(overrides: Partial<ExperienceSummary> & { slug: string }): ExperienceSummary {
  return {
    id: overrides.slug,
    title: overrides.slug,
    summary: null,
    city: "Pune",
    region: "Maharashtra",
    country: "IN",
    categoryKey: null,
    categoryName: null,
    durationMinutes: 120,
    minGuests: 1,
    maxGuests: 10,
    basePriceMinor: 250_000,
    currency: "INR",
    pricingUnit: "PER_PERSON",
    coverUrl: "https://example.test/cover.jpg",
    coverAlt: null,
    hostName: "Host",
    publishedAt: null,
    distanceMetres: null,
    ...overrides,
  };
}

function page(items: readonly ExperienceSummary[]): Page<ExperienceSummary> {
  return {
    items,
    page: 1,
    pageSize: 12,
    total: items.length,
    totalPages: 1,
  } as Page<ExperienceSummary>;
}

/** A discovery fake: a keyword matches a listing when it appears in its title. */
function fakeDiscovery(
  catalogue: readonly ExperienceSummary[],
  categories: readonly CategorySummary[] = [],
) {
  const searched: DiscoveryFilters[] = [];
  return {
    searched,
    discovery: {
      browse: async (filters: DiscoveryFilters) => {
        searched.push(filters);
        if (filters.categoryKey) {
          return page(catalogue.filter((item) => item.categoryKey === filters.categoryKey));
        }
        const term = filters.search?.toLowerCase() ?? "";
        return page(catalogue.filter((item) => item.title.toLowerCase().includes(term)));
      },
      featured: async (limit = 6) => catalogue.slice(0, limit),
      categories: async () => categories,
    },
  };
}

describe("VivenIQ interpretation", () => {
  it("keeps the meaningful words of a sentence", () => {
    expect(extractTerms("Poolside Sunday brunch in Viman Nagar")).toEqual([
      "poolside",
      "brunch",
      "viman",
      "nagar",
    ]);
  });

  it("drops filler and numbers", () => {
    expect(extractTerms("Table for 2 around 7 PM?")).toEqual([]);
  });

  it("reads a party size in digits or words", () => {
    expect(parsePartySize("Table for 2 around 7 PM?")).toBe(2);
    expect(parsePartySize("something for four of us")).toBe(4);
    expect(parsePartySize("6 people, rooftop")).toBe(6);
  });

  it("does not mistake a duration or a time for a party", () => {
    expect(parsePartySize("Thrilling 60-minute escape challenge")).toBeNull();
    expect(parsePartySize("dinner for 90 minutes")).toBeNull();
  });

  it("notices a question about time", () => {
    expect(mentionsTime("around 7 PM?")).toBe(true);
    expect(mentionsTime("wood-fired pizza")).toBe(false);
  });

  it("labels the pricing unit the host chose", () => {
    expect(priceLabel(listing({ slug: "a" }))).toMatch(/2,500 \/ person$/);
    expect(priceLabel(listing({ slug: "b", pricingUnit: "PER_GROUP" }))).toMatch(/ \/ group$/);
    expect(priceLabel(listing({ slug: "c", basePriceMinor: null }))).toBeNull();
  });
});

describe("VivenIQService.respond", () => {
  const brunch = listing({
    slug: "poolside-brunch",
    title: "Poolside Brunch",
    basePriceMinor: 300_000,
  });
  const pizza = listing({ slug: "wood-fired-pizza", title: "Craft Brews and Pizza", maxGuests: 1 });
  const spa = listing({
    slug: "spa",
    title: "Quiet Spa",
    categoryKey: "wellness",
    categoryName: "Wellness",
  });

  it("returns the listing's own facts and the reason it was picked", async () => {
    const { discovery } = fakeDiscovery([brunch, pizza]);
    const result = await new VivenIQService(discovery).respond({ message: "poolside brunch" });

    expect(result.picks.map((pick) => pick.slug)).toEqual(["poolside-brunch"]);
    expect(result.picks[0]!.priceLabel).toMatch(/3,000 \/ person$/);
    expect(result.picks[0]!.reason).toContain("“poolside”");
    expect(result.reply).toContain("Poolside Brunch");
  });

  it("carries the earlier moment into a refinement and filters by party", async () => {
    const { discovery } = fakeDiscovery([brunch, pizza]);
    const result = await new VivenIQService(discovery).respond({
      message: "Table for 2 around 7 PM?",
      history: ["pizza or brunch"],
    });

    // The pizza listing seats one, so a party of two only gets the brunch.
    expect(result.picks.map((pick) => pick.slug)).toEqual(["poolside-brunch"]);
    // A time was asked about; the reply must defer to the real slots.
    expect(result.reply).toMatch(/confirmed live on each experience page/);
  });

  it("hides what was shown when asked for something different", async () => {
    const { discovery } = fakeDiscovery([brunch, pizza]);
    const result = await new VivenIQService(discovery).respond({
      message: "Show me something different",
      history: ["brunch"],
      seen: ["poolside-brunch"],
    });

    expect(result.picks.some((pick) => pick.slug === "poolside-brunch")).toBe(false);
  });

  it("uses a named category", async () => {
    const categories: CategorySummary[] = [
      { key: "wellness", name: "Wellness", experienceCount: 1 } as CategorySummary,
    ];
    const { discovery } = fakeDiscovery([brunch, spa], categories);
    const result = await new VivenIQService(discovery).respond({
      message: "Something in Wellness",
    });

    expect(result.picks[0]?.slug).toBe("spa");
    expect(result.picks[0]?.reason).toContain("In Wellness");
  });

  it("says so plainly when nothing matches, and labels highlights as highlights", async () => {
    const { discovery } = fakeDiscovery([brunch]);
    const result = await new VivenIQService(discovery).respond({ message: "glacier trekking" });

    expect(result.reply).toMatch(/couldn’t find anything/);
    expect(result.picks.every((pick) => pick.reason === "A current highlight from our hosts")).toBe(
      true,
    );
  });

  it("bounds the number of keyword scans", async () => {
    const { discovery, searched } = fakeDiscovery([brunch]);
    await new VivenIQService(discovery).respond({
      message: "poolside sunday brunch viman nagar cocktails jazz garden",
    });

    expect(searched.filter((filters) => filters.search !== undefined)).toHaveLength(4);
  });
});
