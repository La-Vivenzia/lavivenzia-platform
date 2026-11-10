import { describe, expect, it } from "vitest";

import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import { ValidationError } from "@/lib/errors";
import { quoteBooking } from "@/modules/booking/pricing";
import { mentions } from "@/modules/copilot/service";
import {
  ITINERARY_RULES,
  ItineraryDefinitionError,
  SLOT_FIT,
  assertChronological,
  assertSlotFitTable,
  comparePlans,
  interpretPreferences,
  placeStop,
  scorePlan,
  sumMinor,
  toCandidate,
  transferBetween,
  type ScheduledStop,
} from "@/modules/itinerary/generator";
import {
  handleItineraryRequest,
  swapItineraryStop,
  synthesizeItinerary,
} from "@/modules/itinerary/service";
import {
  ItineraryPreferences,
  ItineraryRequest,
  parseClock,
  type Itinerary,
  type ItineraryResult,
} from "@/modules/itinerary/types";

const catalogue = new Map(PILOT_EXPERIENCES.map((listing) => [listing.slug, listing]));
const prefs = (input: Record<string, unknown> = {}) => ItineraryPreferences.parse(input);

function planOf(result: ItineraryResult): Itinerary {
  if (result.status === "unfulfillable") throw new Error(`expected a plan: ${result.reason}`);
  return result.itinerary;
}

/** Every invariant a returned plan must hold, checked from the catalogue alone. */
function expectSound(itinerary: Itinerary, preferences: ItineraryPreferences) {
  const slugs = itinerary.stops.map((stop) => stop.slug);
  expect(new Set(slugs).size).toBe(slugs.length);

  itinerary.stops.forEach((stop, index) => {
    const listing = catalogue.get(stop.slug)!;
    expect(stop.title).toBe(listing.title);
    expect(stop.durationMinutes).toBe(listing.durationMinutes);
    expect(stop.endMinute - stop.startMinute).toBe(listing.durationMinutes);
    expect(stop.startMinute % ITINERARY_RULES.startGranularityMinutes).toBe(0);
    expect(stop.startMinute).toBeGreaterThanOrEqual(preferences.startTime);
    expect(stop.endMinute).toBeLessThanOrEqual(preferences.endTime);
    expect(
      SLOT_FIT[stop.slug]!.some(
        (slot) => stop.startMinute >= slot.earliest && stop.startMinute <= slot.latest,
      ),
    ).toBe(true);
    expect(stop.partyTotalMinor).toBe(
      quoteBooking({
        basePriceMinor: listing.basePriceMinor,
        currency: "INR",
        pricingUnit: listing.pricingUnit,
        guests: preferences.partySize,
      }).totalMinor,
    );

    const previous = itinerary.stops[index - 1];
    if (previous) {
      expect(stop.transfer).not.toBeNull();
      expect(stop.startMinute).toBeGreaterThanOrEqual(previous.endMinute + stop.transfer!.minutes);
      expect(stop.idleBeforeMinutes).toBeLessThanOrEqual(ITINERARY_RULES.maxIdleMinutes);
    } else {
      expect(stop.transfer).toBeNull();
    }
  });

  const total = itinerary.stops.reduce((sum, stop) => sum + stop.partyTotalMinor, 0);
  expect(itinerary.totalMinor).toBe(total);
  expect(Number.isInteger(itinerary.totalMinor)).toBe(true);
  expect(itinerary.perPersonMinor).toBe(Math.ceil(total / preferences.partySize));
  if (preferences.budgetPerPersonRupees !== undefined) {
    expect(itinerary.totalMinor).toBeLessThanOrEqual(
      preferences.budgetPerPersonRupees * 100 * preferences.partySize,
    );
  }
}

describe("itinerary request schema", () => {
  it("applies the defaults", () => {
    const parsed = prefs();
    expect(parsed).toMatchObject({
      moods: [],
      partySize: 2,
      stops: 3,
      startTime: 16 * 60,
      endTime: 23 * 60 + 30,
      exclude: [],
    });
    expect(parsed.intent).toBeUndefined();
  });

  it("parses clock times, including midnight as an end", () => {
    expect(parseClock("09:15")).toBe(555);
    expect(parseClock("24:00")).toBe(1440);
    expect(parseClock("24:30")).toBeNull();
    expect(prefs({ startTime: "18:00", endTime: "24:00" })).toMatchObject({
      startTime: 1080,
      endTime: 1440,
    });
  });

  it("rejects a window that is too short, inverted or too early", () => {
    expect(ItineraryPreferences.safeParse({ startTime: "20:00", endTime: "20:30" }).success).toBe(
      false,
    );
    expect(ItineraryPreferences.safeParse({ startTime: "22:00", endTime: "18:00" }).success).toBe(
      false,
    );
    expect(ItineraryPreferences.safeParse({ startTime: "05:00", endTime: "09:00" }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range party, budget, stops and unknown moods", () => {
    for (const bad of [
      { partySize: 0 },
      { partySize: 13 },
      { partySize: 2.5 },
      { budgetPerPersonRupees: 0 },
      { stops: 5 },
      { moods: ["karaoke"] },
      { moods: ["spa", "cafe", "dining", "gaming"] },
      { intent: "x".repeat(201) },
    ]) {
      expect(ItineraryPreferences.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("never accepts a price or a time from the client", () => {
    const parsed = ItineraryRequest.parse({
      preferences: { totalMinor: 1, priceMinor: 1 },
      swap: { stops: ["a"], index: 0, startMinute: 0 },
    });
    expect(parsed.preferences).not.toHaveProperty("totalMinor");
    expect(parsed.swap).not.toHaveProperty("startMinute");
  });

  it("rejects malformed slugs in a swap", () => {
    expect(
      ItineraryRequest.safeParse({ preferences: {}, swap: { stops: ["<script>"], index: 0 } })
        .success,
    ).toBe(false);
  });
});

describe("slot-fit table", () => {
  it("covers every pilot listing", () => {
    for (const listing of PILOT_EXPERIENCES) {
      expect(SLOT_FIT[listing.slug], listing.slug).toBeDefined();
    }
  });

  it("is internally consistent against the catalogue", () => {
    expect(() => assertSlotFitTable()).not.toThrow();
  });

  it("rejects an entry for an unknown listing, an off-grid window or overlap", () => {
    const first = PILOT_EXPERIENCES[0]!;
    expect(() =>
      assertSlotFitTable(PILOT_EXPERIENCES, { ghost: [{ earliest: 0, latest: 0 }] }),
    ).toThrow(ItineraryDefinitionError);
    expect(() =>
      assertSlotFitTable(PILOT_EXPERIENCES, { [first.slug]: [{ earliest: 610, latest: 700 }] }),
    ).toThrow(/quarter hour/);
    expect(() =>
      assertSlotFitTable(PILOT_EXPERIENCES, {
        [first.slug]: [
          { earliest: 600, latest: 720 },
          { earliest: 720, latest: 780 },
        ],
      }),
    ).toThrow(/disjoint/);
  });
});

describe("interpretation", () => {
  it("lifts moods named in free text and drops sequencing words", () => {
    const interpretation = interpretPreferences({
      moods: ["spa"],
      intent: "gaming then rooftop cocktails",
    });
    expect(interpretation.moods).toEqual(["spa", "gaming"]);
    expect(interpretation.terms).toEqual(["rooftop", "cocktails"]);
  });

  it("matches with the copilot's word-boundary matcher", () => {
    expect(mentions("Retro arcades all night", "arcade")).toBe(true);
    expect(mentions("Barbecue platter", "bar")).toBe(false);
  });
});

describe("scheduling primitives", () => {
  const interpretation = interpretPreferences({ moods: [], intent: undefined });
  const candidate = (slug: string, partySize = 2) =>
    toCandidate(catalogue.get(slug)!, { partySize }, interpretation)!;

  it("rounds transfers up to five minutes and switches to a ride when far", () => {
    const near = transferBetween(
      catalogue.get("smaaash-vr-twilight-bowling-amanora")!,
      catalogue.get("mystery-rooms-escape-challenge-amanora")!,
    );
    expect(near.mode).toBe("walk");
    expect(near.minutes % 5).toBe(0);
    expect(near.minutes).toBeGreaterThanOrEqual(ITINERARY_RULES.walkSettleMinutes);

    const far: PilotExperienceInput = {
      ...catalogue.get("smaaash-vr-twilight-bowling-amanora")!,
      latitude: 18.6,
    };
    const ride = transferBetween(catalogue.get("smaaash-vr-twilight-bowling-amanora")!, far);
    expect(ride.mode).toBe("ride");
    expect(ride.minutes % 5).toBe(0);
  });

  it("waits for a listing's slot rather than starting it out of hours", () => {
    const placed = placeStop(candidate("amanora-lake-sunset-walk-and-mindfulness"), null, {
      startMinute: 14 * 60,
      endMinute: 22 * 60,
    });
    expect(placed?.startMinute).toBe(17 * 60);
  });

  it("uses a later window when the first has passed", () => {
    const placed = placeStop(candidate("absolute-barbecues-wish-grill-seasons"), null, {
      startMinute: 16 * 60,
      endMinute: 23 * 60,
    });
    expect(placed?.startMinute).toBe(19 * 60);
  });

  it("refuses a stop that would overrun the window or idle too long", () => {
    expect(
      placeStop(candidate("agent-jacks-interactive-bidding-bar"), null, {
        startMinute: 20 * 60,
        endMinute: 22 * 60,
      }),
    ).toBeNull();

    const coffee = placeStop(candidate("third-wave-coffee-artisan-roastery-amanora"), null, {
      startMinute: 9 * 60,
      endMinute: 24 * 60,
    })!;
    // Coffee ends 10:30; the rooftop opens at 18:00 — far past the idle allowance.
    expect(
      placeStop(candidate("spice-factory-rooftop-cocktails-hadapsar"), coffee, {
        startMinute: 9 * 60,
        endMinute: 24 * 60,
      }),
    ).toBeNull();
  });

  it("excludes a listing whose guest range does not take the party", () => {
    // The spa takes at most two.
    expect(
      toCandidate(
        catalogue.get("o2-spa-aromatherapy-and-reflexology-seasons")!,
        { partySize: 3 },
        interpretation,
      ),
    ).toBeNull();
  });

  it("catches an out-of-order plan in the chronology check", () => {
    const window = { startMinute: 16 * 60, endMinute: 24 * 60 };
    const first = placeStop(candidate("timezone-laser-tag-seasons-mall"), null, window)!;
    const second = placeStop(candidate("indimex-urban-lounge-seasons"), first, window)!;
    const tampered: ScheduledStop = {
      ...second,
      startMinute: first.startMinute,
      endMinute: first.startMinute + 90,
    };
    expect(() => assertChronological([first, second], window)).not.toThrow();
    expect(() => assertChronological([first, tampered], window)).toThrow(ItineraryDefinitionError);
  });

  it("orders plans by length, then coverage, then relevance, then a stable key", () => {
    const window = { startMinute: 16 * 60, endMinute: 24 * 60 };
    const one = [placeStop(candidate("timezone-laser-tag-seasons-mall"), null, window)!];
    const two = [...one, placeStop(candidate("indimex-urban-lounge-seasons"), one[0]!, window)!];
    expect(comparePlans(scorePlan(two), scorePlan(one))).toBeLessThan(0);
    expect(comparePlans(scorePlan(one), scorePlan(one))).toBe(0);
  });

  it("sums money exactly and refuses past the safe-integer range", () => {
    expect(sumMinor([89_900, 135_000, 49_900])).toBe(274_800);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(ValidationError);
  });
});

describe("synthesis", () => {
  it("plans the requested number of stops, soundly", () => {
    const preferences = prefs({ intent: "gaming then rooftop cocktails" });
    const result = synthesizeItinerary(preferences);
    expect(result.status).toBe("planned");
    const itinerary = planOf(result);
    expect(itinerary.stops).toHaveLength(3);
    expectSound(itinerary, preferences);
    expect(result.notice).toMatch(/not reserved/);
  });

  it("puts what was asked for in the plan", () => {
    const itinerary = planOf(synthesizeItinerary(prefs({ intent: "rooftop cocktails" })));
    expect(itinerary.stops.map((stop) => stop.slug)).toContain(
      "spice-factory-rooftop-cocktails-hadapsar",
    );
    const rooftop = itinerary.stops.find((stop) => stop.slug.startsWith("spice-factory"))!;
    expect(rooftop.matched).toEqual(expect.arrayContaining(["rooftop", "cocktails"]));
    expect(rooftop.why).toMatch(/^For /);
  });

  it("is deterministic", () => {
    const preferences = prefs({ moods: ["gaming", "nightlife"], partySize: 4 });
    expect(synthesizeItinerary(preferences)).toEqual(synthesizeItinerary(preferences));
  });

  it("is independent of catalogue order", () => {
    const preferences = prefs({ moods: ["cafe"], startTime: "10:00", endTime: "18:00" });
    const reversed = [...PILOT_EXPERIENCES].reverse();
    expect(synthesizeItinerary(preferences, reversed)).toEqual(synthesizeItinerary(preferences));
  });

  it("holds the budget exactly, for the whole party", () => {
    const preferences = prefs({ budgetPerPersonRupees: 1500, partySize: 3 });
    const result = synthesizeItinerary(preferences);
    expectSound(planOf(result), preferences);
  });

  it("returns a partial plan with a reason when the budget only covers some stops", () => {
    const preferences = prefs({ budgetPerPersonRupees: 900, startTime: "16:00", endTime: "20:00" });
    const result = synthesizeItinerary(preferences);
    expect(result.status).toBe("partial");
    if (result.status !== "partial") return;
    expect(result.itinerary.stops.length).toBeLessThan(3);
    expect(result.reason).toMatch(/budget|window/);
    expectSound(result.itinerary, preferences);
  });

  it("says why when nothing fits", () => {
    const tooPoor = synthesizeItinerary(prefs({ budgetPerPersonRupees: 100 }));
    expect(tooPoor.status).toBe("unfulfillable");
    if (tooPoor.status === "unfulfillable") expect(tooPoor.reason).toMatch(/₹100 each/);

    const everythingExcluded = synthesizeItinerary(
      prefs({ exclude: PILOT_EXPERIENCES.slice(0, 32).map((listing) => listing.slug) }),
    );
    expect(everythingExcluded.status).toBe("unfulfillable");
  });

  it("respects exclusions and the party's guest limits", () => {
    const preferences = prefs({
      moods: ["spa"],
      partySize: 4,
      exclude: ["amanora-lake-sunset-walk-and-mindfulness"],
    });
    const slugs = planOf(synthesizeItinerary(preferences)).stops.map((stop) => stop.slug);
    expect(slugs).not.toContain("amanora-lake-sunset-walk-and-mindfulness");
    expect(slugs).not.toContain("o2-spa-aromatherapy-and-reflexology-seasons");
  });

  it("stays sound across a sweep of preferences", () => {
    for (const partySize of [1, 2, 6]) {
      for (const [startTime, endTime] of [
        ["10:00", "16:00"],
        ["16:00", "23:30"],
        ["18:00", "24:00"],
      ] as const) {
        for (const stops of [1, 2, 4]) {
          const preferences = prefs({ partySize, startTime, endTime, stops });
          const result = synthesizeItinerary(preferences);
          if (result.status !== "unfulfillable") expectSound(result.itinerary, preferences);
        }
      }
    }
  });
});

describe("swap", () => {
  const preferences = prefs({ intent: "gaming then rooftop cocktails" });
  const original = planOf(synthesizeItinerary(preferences));
  const slugs = original.stops.map((stop) => stop.slug);

  it("replaces only the chosen stop and keeps the rest in order", () => {
    const result = swapItineraryStop(preferences, { stops: slugs, index: 1 });
    const swapped = planOf(result);
    expect(result.swappedOut).toBe(slugs[1]);
    expect(swapped.stops).toHaveLength(slugs.length);
    expect(swapped.stops[0]!.slug).toBe(slugs[0]);
    expect(swapped.stops[2]!.slug).toBe(slugs[2]);
    expect(slugs).not.toContain(swapped.stops[1]!.slug);
    expectSound(swapped, preferences);
  });

  it("goes through the same entry point as generation", () => {
    const viaRequest = handleItineraryRequest(
      ItineraryRequest.parse({
        preferences: { intent: "gaming then rooftop cocktails" },
        swap: { stops: slugs, index: 0 },
      }),
    );
    expect(viaRequest.swappedOut).toBe(slugs[0]);
  });

  it("reports, rather than fails, when nothing else fits the slot", () => {
    const tight = prefs({ startTime: "17:00", endTime: "18:30", stops: 1, moods: ["peaceful"] });
    const plan = planOf(synthesizeItinerary(tight));
    const result = swapItineraryStop(
      { ...tight, exclude: PILOT_EXPERIENCES.map((listing) => listing.slug) },
      { stops: plan.stops.map((stop) => stop.slug), index: 0 },
    );
    expect(result.status).toBe("unfulfillable");
    if (result.status === "unfulfillable") expect(result.reason).toMatch(/unchanged/);
  });

  it("rejects an unknown listing, a duplicate or a missing position", () => {
    expect(() => swapItineraryStop(preferences, { stops: ["not-a-listing"], index: 0 })).toThrow(
      ValidationError,
    );
    expect(() =>
      swapItineraryStop(preferences, { stops: [slugs[0]!, slugs[0]!], index: 0 }),
    ).toThrow(ValidationError);
    expect(() => swapItineraryStop(preferences, { stops: slugs, index: 3 })).toThrow(
      ValidationError,
    );
  });

  it("rejects a plan that no longer fits the party", () => {
    expect(() =>
      swapItineraryStop(prefs({ partySize: 3 }), {
        stops: ["o2-spa-aromatherapy-and-reflexology-seasons", slugs[0]!],
        index: 1,
      }),
    ).toThrow(/no longer fits/);
  });
});
