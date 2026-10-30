import { describe, expect, it } from "vitest";

import { WALKING_SPEED_MPS } from "@/components/map/live-map-tracking";
import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import { quoteBooking } from "@/modules/booking/pricing";
import { BUDGET_TIERS, HOTSPOTS } from "@/modules/concierge/options";
import {
  CONCIERGE_WALKING_SPEED_MPS,
  budgetFit,
  budgetTier,
  findVibeMatches,
  formatPartyPrice,
  formatProximity,
  partyCost,
  resolveCraving,
  resolveLocation,
} from "@/modules/concierge/service";

const seasons = HOTSPOTS.find((hotspot) => hotspot.id === "seasons")!;
const amanora = HOTSPOTS.find((hotspot) => hotspot.id === "amanora")!;

function listing(overrides: Partial<PilotExperienceInput>): PilotExperienceInput {
  return { ...PILOT_EXPERIENCES[0]!, ...overrides };
}

describe("the Indimex pilot listing", () => {
  const indimex = PILOT_EXPERIENCES.find((item) => item.slug === "indimex-urban-lounge-seasons");

  it("is a ₹499-a-head Seasons Mall gastropub", () => {
    expect(indimex).toBeDefined();
    expect(indimex!.basePriceMinor).toBe(49900);
    expect(indimex!.pricingUnit).toBe("PER_PERSON");
    expect(indimex!.addressLine).toContain("Seasons Mall");
  });

  it("keeps every pilot slug unique", () => {
    const slugs = PILOT_EXPERIENCES.map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("resolveLocation", () => {
  it("uses a hotspot id when there are no coordinates", () => {
    const location = resolveLocation({ hotspot: "amanora" });
    expect(location).toMatchObject({ source: "hotspot", hotspotId: "amanora", notice: null });
    expect(location.latitude).toBe(amanora.latitude);
  });

  it("is forgiving about hotspot case and whitespace", () => {
    expect(resolveLocation({ hotspot: "  Seasons " }).hotspotId).toBe("seasons");
  });

  it("falls back to Seasons Mall, with a notice, when nothing usable is given", () => {
    const location = resolveLocation({});
    expect(location).toMatchObject({ source: "fallback", hotspotId: "seasons" });
    expect(location.notice).toMatch(/couldn't place you/);
  });

  it("falls back on an unknown hotspot", () => {
    expect(resolveLocation({ hotspot: "koregaon" })).toMatchObject({
      source: "fallback",
      hotspotId: "seasons",
    });
  });

  it("ignores mangled or Null Island coordinates and uses the hotspot", () => {
    expect(resolveLocation({ latitude: "abc", longitude: "73.9", hotspot: "amanora" }).source).toBe(
      "hotspot",
    );
    expect(resolveLocation({ latitude: 0, longitude: 0, hotspot: "amanora" }).source).toBe(
      "hotspot",
    );
    expect(resolveLocation({ latitude: 95, longitude: 73.9 }).source).toBe("fallback");
  });

  it("snaps a GPS fix inside a mall to that hotspot", () => {
    const location = resolveLocation({ latitude: 18.5196, longitude: 73.9317 });
    expect(location).toMatchObject({ source: "gps", hotspotId: "seasons", label: "Seasons Mall" });
    expect(location.latitude).toBe(18.5196);
  });

  it("keeps a GPS fix between hotspots as-is, labelled by the nearest", () => {
    const location = resolveLocation({ latitude: 18.509, longitude: 73.925 });
    expect(location.source).toBe("gps");
    expect(location.hotspotId).toBeNull();
    expect(location.label).toMatch(/^Near /);
  });

  it("falls back when the fix is outside the pilot area", () => {
    // Mumbai — about 120 km away.
    const location = resolveLocation({ latitude: 19.076, longitude: 72.8777, hotspot: "amanora" });
    expect(location).toMatchObject({ source: "fallback", hotspotId: "amanora" });
    expect(location.notice).toMatch(/outside our East Pune pilot/);
  });
});

describe("resolveCraving", () => {
  it("accepts ids and aliases", () => {
    expect(resolveCraving("beer").id).toBe("beer");
    expect(resolveCraving("Gaming").id).toBe("arcade");
    expect(resolveCraving("café").id).toBe("coffee");
  });

  it("reads a known craving out of free text", () => {
    expect(resolveCraving("cheap beer near me").id).toBe("beer");
  });

  it("keeps unrecognised free text as a custom craving", () => {
    const craving = resolveCraving("live music");
    expect(craving.id).toBe("custom");
    expect(craving.terms).toEqual(expect.arrayContaining(["live", "music"]));
  });
});

describe("budget filtering", () => {
  it("defines the three tiers on the agreed per-person bounds", () => {
    expect(BUDGET_TIERS.map((tier) => tier.id)).toEqual(["pocket", "mid", "luxury"]);
    expect(budgetFit(60_000, budgetTier("pocket"))).toBe("in-tier");
    expect(budgetFit(60_001, budgetTier("pocket"))).toBe("over-tier");
    expect(budgetFit(60_001, budgetTier("mid"))).toBe("in-tier");
    expect(budgetFit(120_000, budgetTier("mid"))).toBe("in-tier");
    expect(budgetFit(120_001, budgetTier("mid"))).toBe("over-tier");
    expect(budgetFit(49_900, budgetTier("mid"))).toBe("under-tier");
    expect(budgetFit(500_000, budgetTier("luxury"))).toBe("in-tier");
  });

  it("never returns a pocket match above ₹600 a head", () => {
    for (const craving of ["beer", "coffee", "arcade", "dining", "spa", "rooftop"]) {
      for (const partySize of [1, 2, 4]) {
        const { matches } = findVibeMatches(
          { hotspot: "seasons", craving, partySize, budget: "pocket", limit: 10 },
          PILOT_EXPERIENCES,
        );
        for (const match of matches) expect(match.perPersonMinor).toBeLessThanOrEqual(60_000);
      }
    }
  });

  it("excludes Effingut (₹1,499) from a pocket beer search but keeps it for luxury", () => {
    const pocket = findVibeMatches({
      hotspot: "seasons",
      craving: "beer",
      partySize: 2,
      budget: "pocket",
      limit: 10,
    });
    const luxury = findVibeMatches({
      hotspot: "seasons",
      craving: "beer",
      partySize: 2,
      budget: "luxury",
      limit: 10,
    });

    const effingut = "effingut-brewhouse-craft-tasting-seasons";
    expect(pocket.matches.map((match) => match.slug)).not.toContain(effingut);
    expect(luxury.matches.map((match) => match.slug)).toContain(effingut);
  });

  it("returns no matches rather than inventing one when nothing fits", () => {
    const { matches } = findVibeMatches({
      hotspot: "seasons",
      craving: "spa",
      partySize: 2,
      budget: "pocket",
    });
    expect(matches).toEqual([]);
  });

  it("drops listings whose guest range does not take the party", () => {
    // The O2 spa takes at most 2.
    const { matches } = findVibeMatches({
      hotspot: "seasons",
      craving: "spa",
      partySize: 4,
      budget: "luxury",
      limit: 10,
    });
    expect(matches.map((match) => match.slug)).not.toContain(
      "o2-spa-aromatherapy-and-reflexology-seasons",
    );
  });
});

describe("party cost math", () => {
  it("multiplies a per-person price by the party, exactly as the booking quote does", () => {
    for (const partySize of [1, 2, 3, 6]) {
      const cost = partyCost({ basePriceMinor: 49_900, pricingUnit: "PER_PERSON" }, partySize);
      const quote = quoteBooking({
        basePriceMinor: 49_900,
        currency: "INR",
        pricingUnit: "PER_PERSON",
        guests: partySize,
      });
      expect(cost.totalMinor).toBe(quote.totalMinor);
      expect(cost.totalMinor).toBe(49_900 * partySize);
      expect(cost.perPersonMinor).toBe(49_900);
    }
  });

  it("charges a per-group price once and splits it per head, rounded up", () => {
    const cost = partyCost({ basePriceMinor: 100_000, pricingUnit: "PER_GROUP" }, 3);
    expect(cost.totalMinor).toBe(100_000);
    expect(cost.perPersonMinor).toBe(33_334);
  });

  it("compares a per-group listing against the budget per head", () => {
    const group = listing({
      slug: "group-beer-tower",
      title: "Beer tower for the table",
      basePriceMinor: 150_000,
      pricingUnit: "PER_GROUP",
      minGuests: 1,
      maxGuests: 6,
      latitude: seasons.latitude,
      longitude: seasons.longitude,
      addressLine: "Seasons Mall, Magarpatta",
    });
    const forSix = findVibeMatches(
      { hotspot: "seasons", craving: "beer", partySize: 6, budget: "pocket" },
      [group],
    );
    const forTwo = findVibeMatches(
      { hotspot: "seasons", craving: "beer", partySize: 2, budget: "pocket" },
      [group],
    );
    expect(forSix.matches[0]?.perPersonMinor).toBe(25_000);
    expect(forSix.matches[0]?.totalMinor).toBe(150_000);
    expect(forTwo.matches).toEqual([]);
  });

  it("labels the party total", () => {
    expect(formatPartyPrice(99_800, 2)).toBe("₹998 total for 2");
    expect(formatPartyPrice(49_900, 1)).toBe("₹499 for 1");
    expect(formatPartyPrice(299_400, 6)).toBe("₹2,994 total for 6");
  });
});

describe("findVibeMatches — the founder's case", () => {
  const result = findVibeMatches({
    hotspot: "seasons",
    craving: "beer",
    partySize: 2,
    budget: "pocket",
  });
  const top = result.matches[0]!;

  it("puts Indimex first, within Seasons Mall, at ₹998 for two", () => {
    expect(top.slug).toBe("indimex-urban-lounge-seasons");
    expect(top.distanceLabel).toBe("Within Seasons Mall");
    expect(top.withinHotspot).toBe(true);
    expect(top.totalMinor).toBe(99_800);
    expect(top.priceLabel).toBe("₹998 total for 2");
    expect(top.totalLabel).toBe("₹998");
    expect(top.partyLabel).toBe("total for 2");
    expect(top.budgetFit).toBe("in-tier");
  });

  it("explains why it fits and offers both quick actions", () => {
    expect(top.reasons.join(" ")).toMatch(/beer craving/);
    expect(top.reasons.join(" ")).toMatch(/pocket-friendly budget/);
    expect(top.actions.book).toEqual({
      label: "Book Slot",
      href: "/experiences/indimex-urban-lounge-seasons",
    });
    expect(top.actions.walk).toMatchObject({
      label: "Walk There",
      slug: "indimex-urban-lounge-seasons",
      destination: { lat: top.latitude, lng: top.longitude },
    });
  });

  it("echoes the interpreted request", () => {
    expect(result.party).toEqual({ size: 2, kind: "duo" });
    expect(result.budget.tier).toBe("pocket");
    expect(result.craving.id).toBe("beer");
    expect(result.location.hotspotId).toBe("seasons");
  });
});

describe("ranking and distance", () => {
  it("ranks a closer equal match first", () => {
    const near = listing({
      slug: "near-pub",
      title: "Near pub with draught beer",
      basePriceMinor: 50_000,
      latitude: amanora.latitude,
      longitude: amanora.longitude,
      addressLine: "Amanora Mall",
      minGuests: 1,
    });
    const far = listing({
      ...near,
      slug: "far-pub",
      latitude: amanora.latitude + 0.02,
      addressLine: "Elsewhere",
    });
    const { matches } = findVibeMatches(
      { hotspot: "amanora", craving: "beer", partySize: 2, budget: "pocket" },
      [far, near],
    );
    expect(matches.map((match) => match.slug)).toEqual(["near-pub", "far-pub"]);
    expect(matches[1]!.distanceLabel).toMatch(/km (walk|away)$/);
  });

  it("caps the number of matches", () => {
    const { matches } = findVibeMatches({
      hotspot: "amanora",
      craving: "dining",
      partySize: 2,
      budget: "luxury",
      limit: 1,
    });
    expect(matches).toHaveLength(1);
  });

  it("formats proximity the way the cards show it", () => {
    expect(formatProximity(120, "Seasons Mall")).toBe("Within Seasons Mall");
    expect(formatProximity(447, null)).toBe("450m walk");
    expect(formatProximity(3, null)).toBe("10m walk");
    expect(formatProximity(1_400, null)).toBe("1.4 km walk");
    expect(formatProximity(6_200, null)).toBe("6.2 km away");
  });

  it("walks at the same pace as the live map tracker", () => {
    expect(CONCIERGE_WALKING_SPEED_MPS).toBe(WALKING_SPEED_MPS);
  });

  it("clamps an out-of-range party size", () => {
    const { party } = findVibeMatches({
      hotspot: "seasons",
      craving: "beer",
      partySize: 40,
      budget: "mid",
    });
    expect(party).toEqual({ size: 6, kind: "squad" });
  });
});
