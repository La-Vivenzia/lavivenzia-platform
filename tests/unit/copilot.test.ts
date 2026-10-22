import { describe, expect, it, vi } from "vitest";
import { DiscoveryService } from "@/modules/discovery/service";
import type {
  DiscoveryFilters,
  DiscoveryRepository,
  ExperienceDetail,
  ExperienceSummary,
} from "@/modules/discovery/ports";
import type { LlmPort } from "@/ports/llm";
import { COPILOT_RADIUS_KM, CopilotRequest } from "@/modules/copilot/types";
import {
  CopilotService,
  acceptRationales,
  formatDistanceText,
  googleMapsDirectionsUrl,
  haversineMetres,
  keywordsFor,
  parseBudgetMinor,
  rankCandidates,
} from "@/modules/copilot/service";

/**
 * Travel copilot.
 *
 * The question these tests keep asking is "could a fact in the response have
 * come from anywhere but the catalogue?" — the copilot's whole contract is that
 * the answer is no, with or without a model.
 */

// Amanora Mall, Hadapsar — the pilot corridor.
const AMANORA = { lat: 18.5185, lng: 73.9349 };

function summary(overrides: Partial<ExperienceSummary> & { id: string }): ExperienceSummary {
  return {
    slug: overrides.id,
    title: "Untitled",
    summary: null,
    city: "Pune",
    region: "Maharashtra",
    country: "IN",
    categoryKey: null,
    categoryName: null,
    durationMinutes: 60,
    minGuests: 1,
    maxGuests: 6,
    basePriceMinor: 100_000,
    currency: "INR",
    pricingUnit: "PER_PERSON",
    coverUrl: null,
    coverAlt: null,
    hostName: "Pilot Host",
    publishedAt: new Date("2026-10-01"),
    distanceMetres: 500,
    ...overrides,
  };
}

const ARCADE = summary({
  id: "arcade",
  title: "Retro Arcade & VR Night",
  summary: "Classic cabinets and VR pods under one roof.",
  categoryKey: "entertainment",
  categoryName: "Entertainment",
  distanceMetres: 1200,
  coverUrl: "https://cdn.example/arcade.jpg",
});
const BREWERY = summary({
  id: "brewery",
  title: "Magarpatta Craft Beer Walk",
  summary: "Taste small-batch brews at a local brewery.",
  categoryName: "Food & Drink",
  distanceMetres: 300,
});
const SPA = summary({
  id: "spa",
  title: "Seasons Ayurvedic Massage",
  summary: "A slow, restorative wellness ritual.",
  categoryName: "Wellness",
  distanceMetres: 800,
  basePriceMinor: 250_000,
  pricingUnit: "PER_GROUP",
});
const BOWLING = summary({
  id: "bowling",
  title: "Hadapsar Bowling League",
  summary: "Ten lanes and a scoreboard.",
  distanceMetres: 2500,
});

const COORDINATES: Record<string, { latitude: number; longitude: number } | null> = {
  arcade: { latitude: 18.519, longitude: 73.946 },
  brewery: { latitude: 18.515, longitude: 73.931 },
  spa: { latitude: 18.52, longitude: 73.94 },
  bowling: { latitude: 18.5, longitude: 73.93 },
};

function detail(row: ExperienceSummary): ExperienceDetail {
  const at = COORDINATES[row.id] ?? null;
  return {
    ...row,
    description: `${row.title} description. More detail follows.`,
    addressLine: null,
    postalCode: null,
    latitude: at?.latitude ?? null,
    longitude: at?.longitude ?? null,
    languages: ["en"],
    inclusions: [],
    exclusions: [],
    guestNotes: null,
    images: [],
    host: {
      displayName: row.hostName,
      headline: null,
      about: null,
      city: "Pune",
      isVerified: true,
    },
  };
}

function fakeDiscovery(rows: readonly ExperienceSummary[]) {
  const calls: DiscoveryFilters[] = [];
  const repository: DiscoveryRepository = {
    listExperiences: async (filters) => {
      calls.push(filters);
      const items = rows.filter(
        (row) =>
          filters.maxPriceMinor === undefined ||
          (row.basePriceMinor !== null && row.basePriceMinor <= filters.maxPriceMinor),
      );
      return { items, total: items.length, page: 1, pageSize: filters.pageSize, totalPages: 1 };
    },
    findExperienceBySlug: async (slug) => {
      const row = rows.find((candidate) => candidate.slug === slug);
      return row ? detail(row) : null;
    },
    featuredExperiences: async () => [],
    listDestinations: async () => [],
    findDestination: async () => null,
    listCategories: async () => [],
  };
  return { service: new DiscoveryService({ discovery: repository }), calls };
}

function request(input: Record<string, unknown>): CopilotRequest {
  return CopilotRequest.parse({ ...AMANORA, ...input });
}

describe("CopilotRequest schema", () => {
  it("defaults the radius to 3 km", () => {
    expect(request({}).radiusKm).toBe(COPILOT_RADIUS_KM.default);
  });

  it("clamps the radius into 0.5–15 km rather than rejecting it", () => {
    expect(request({ radiusKm: 0.1 }).radiusKm).toBe(0.5);
    expect(request({ radiusKm: 100 }).radiusKm).toBe(15);
    expect(request({ radiusKm: 7.5 }).radiusKm).toBe(7.5);
  });

  it("rejects out-of-range or missing coordinates", () => {
    expect(CopilotRequest.safeParse({ lat: 91, lng: 73 }).success).toBe(false);
    expect(CopilotRequest.safeParse({ lat: 18, lng: -181 }).success).toBe(false);
    expect(CopilotRequest.safeParse({ lat: 18 }).success).toBe(false);
    expect(CopilotRequest.safeParse({ lat: "18", lng: "73" }).success).toBe(false);
  });

  it("trims text, lower-cases the mood and drops empty strings", () => {
    const parsed = request({ mood: "  Gaming ", query: "   ", budget: " 1500 " });
    expect(parsed.mood).toBe("gaming");
    expect(parsed.query).toBeUndefined();
    expect(parsed.budget).toBe("1500");
  });

  it("bounds free text", () => {
    expect(CopilotRequest.safeParse({ ...AMANORA, query: "x".repeat(201) }).success).toBe(false);
  });
});

describe("distance and directions", () => {
  it("measures a known distance to within a metre or two", () => {
    // One degree of latitude is ~111.2 km on the mean-radius sphere.
    const metres = haversineMetres(
      { latitude: 18, longitude: 73 },
      { latitude: 19, longitude: 73 },
    );
    expect(metres).toBeGreaterThan(111_100);
    expect(metres).toBeLessThan(111_300);
  });

  it("is zero for the same point", () => {
    expect(
      haversineMetres({ latitude: 18.5, longitude: 73.9 }, { latitude: 18.5, longitude: 73.9 }),
    ).toBe(0);
  });

  it("formats distance as text", () => {
    expect(formatDistanceText(347)).toBe("350 m away");
    expect(formatDistanceText(1240)).toBe("1.2 km away");
  });

  it("builds a Google Maps directions link to the stored point", () => {
    expect(googleMapsDirectionsUrl({ latitude: 18.519, longitude: 73.946 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=18.519,73.946",
    );
  });
});

describe("input interpretation", () => {
  it("reads a numeric budget as INR major units", () => {
    expect(parseBudgetMinor("1500")).toBe(150_000);
    expect(parseBudgetMinor("under ₹1,500")).toBe(150_000);
    expect(parseBudgetMinor("2k")).toBe(200_000);
  });

  it("ignores a budget with no number rather than guessing one", () => {
    expect(parseBudgetMinor("cheap")).toBeUndefined();
    expect(parseBudgetMinor(undefined)).toBeUndefined();
  });

  it("treats an unknown mood as a free-text term", () => {
    const keywords = keywordsFor("bowling", undefined);
    expect(keywords.mood).toBeNull();
    expect(keywords.queryTerms).toContain("bowling");
  });
});

describe("mood ranking", () => {
  const all = [ARCADE, BREWERY, SPA, BOWLING];

  it("puts gaming listings first and drops unrelated ones", () => {
    const ranked = rankCandidates(all, keywordsFor("gaming", undefined));
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(["arcade", "bowling"]);
  });

  it("matches nightlife to breweries and spa to wellness", () => {
    expect(rankCandidates(all, keywordsFor("nightlife", undefined))[0]?.candidate.id).toBe(
      "brewery",
    );
    expect(rankCandidates(all, keywordsFor("spa", undefined))[0]?.candidate.id).toBe("spa");
  });

  it("matches on word boundaries, not substrings", () => {
    const barbecue = summary({ id: "bbq", title: "Barbecue Masterclass" });
    expect(rankCandidates([barbecue], keywordsFor("nightlife", undefined))[0]?.score).toBe(0);
  });

  it("falls back to nearest-first when nothing matches", () => {
    const ranked = rankCandidates(all, keywordsFor("peaceful", undefined));
    expect(ranked.map((entry) => entry.candidate.id)).toEqual([
      "brewery",
      "spa",
      "arcade",
      "bowling",
    ]);
  });
});

describe("CopilotService — deterministic path", () => {
  it("returns grounded suggestions with fallback set", async () => {
    const { service: discovery, calls } = fakeDiscovery([ARCADE, BREWERY, SPA, BOWLING]);
    const copilot = new CopilotService({ discovery });

    const response = await copilot.suggest(request({ mood: "gaming", radiusKm: 5 }));

    expect(calls[0]?.near).toEqual({ latitude: 18.5185, longitude: 73.9349, radiusMetres: 5000 });
    expect(calls[0]?.sort).toBe("distance");
    expect(response.queryEcho).toEqual({ ...AMANORA, radiusKm: 5, mood: "gaming" });
    expect(response.fallback).toBe(true);
    expect(response.count).toBe(2);

    const [first] = response.suggestions;
    expect(first).toMatchObject({
      id: "arcade",
      slug: "arcade",
      category: "Entertainment",
      distanceMeters: 1200,
      distanceText: "1.2 km away",
      googleMapsUrl: "https://www.google.com/maps/dir/?api=1&destination=18.519,73.946",
      imageUrl: "https://cdn.example/arcade.jpg",
    });
    expect(first?.priceFormatted).toContain("1,000");
    expect(first?.priceFormatted).toContain("per person");
    expect(first?.whyYouWillLoveIt).toContain("gaming mood");
    expect(first?.whyYouWillLoveIt).toContain("Classic cabinets and VR pods under one roof.");
  });

  it("passes a numeric budget to the database as a price ceiling", async () => {
    const { service: discovery, calls } = fakeDiscovery([BREWERY, SPA]);
    const response = await new CopilotService({ discovery }).suggest(
      request({ mood: "spa", budget: "1500" }),
    );

    expect(calls[0]?.maxPriceMinor).toBe(150_000);
    expect(response.suggestions.map((s) => s.id)).not.toContain("spa");
  });

  it("drops a listing with no stored coordinates instead of guessing a destination", async () => {
    const nowhere = summary({ id: "nowhere", title: "Arcade Pop-up" });
    const { service: discovery } = fakeDiscovery([nowhere, ARCADE]);
    const response = await new CopilotService({ discovery }).suggest(request({ mood: "gaming" }));

    expect(response.suggestions.map((s) => s.id)).toEqual(["arcade"]);
  });
});

describe("CopilotService — model enrichment", () => {
  function llmReturning(value: unknown): LlmPort {
    return { generateStructured: vi.fn(async () => value) as LlmPort["generateStructured"] };
  }

  it("uses model rationale when it is valid, keeping every fact from the catalogue", async () => {
    const { service: discovery } = fakeDiscovery([ARCADE, BOWLING]);
    const llm = llmReturning({
      rationales: [
        { id: "arcade", text: "Perfect for a playful evening of retro games." },
        { id: "bowling", text: "Friendly lanes for a competitive group outing." },
      ],
    });

    const response = await new CopilotService({ discovery, llm }).suggest(
      request({ mood: "gaming" }),
    );

    expect(response.fallback).toBe(false);
    expect(response.suggestions[0]?.whyYouWillLoveIt).toBe(
      "Perfect for a playful evening of retro games.",
    );
    expect(response.suggestions[0]?.distanceText).toBe("1.2 km away");
  });

  it("rejects the whole response when the model names an unknown id", async () => {
    const { service: discovery } = fakeDiscovery([ARCADE]);
    const onEnrichmentFailure = vi.fn();
    const llm = llmReturning({ rationales: [{ id: "invented", text: "A hidden gem." }] });

    const response = await new CopilotService({ discovery, llm, onEnrichmentFailure }).suggest(
      request({ mood: "gaming" }),
    );

    expect(response.fallback).toBe(true);
    expect(response.suggestions[0]?.whyYouWillLoveIt).toContain("gaming mood");
    expect(onEnrichmentFailure).toHaveBeenCalledOnce();
  });

  it("discards a rationale that states a price or a number", () => {
    const accepted = acceptRationales(
      {
        rationales: [
          { id: "a", text: "Only ₹200 for an hour of fun." },
          { id: "b", text: "A relaxed way to unwind." },
        ],
      },
      new Set(["a", "b"]),
    );
    expect(accepted?.has("a")).toBe(false);
    expect(accepted?.get("b")).toBe("A relaxed way to unwind.");
  });

  it("degrades to deterministic rationale when the model throws", async () => {
    const { service: discovery } = fakeDiscovery([SPA]);
    const llm: LlmPort = {
      generateStructured: () => {
        throw new Error("not implemented");
      },
    };

    const response = await new CopilotService({ discovery, llm }).suggest(request({ mood: "spa" }));

    expect(response.fallback).toBe(true);
    expect(response.suggestions[0]?.whyYouWillLoveIt).toContain("spa and wellness mood");
    expect(response.suggestions[0]?.priceFormatted).toContain("per group");
  });
});
