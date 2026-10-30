import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ConciergeResultsPage from "@/app/(site)/concierge/results/page";
import { WALKING_SPEED_MPS } from "@/components/map/live-map-tracking";
import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import { quoteBooking } from "@/modules/booking/pricing";
import {
  converse,
  parsePartyAndBudget,
  requestFromQuery,
  resultsHref,
  startConversation,
  type ConversationEvent,
  type ConversationState,
} from "@/modules/concierge/conversation";
import { HOTSPOTS, type ConciergeBudget } from "@/modules/concierge/options";
import {
  CONCIERGE_WALKING_SPEED_MPS,
  budgetFit,
  findHotspotInText,
  findVibeMatches,
  formatBudget,
  formatPartyPrice,
  formatProximity,
  partyCost,
  resolveCraving,
  resolveLocation,
} from "@/modules/concierge/service";

const seasons = HOTSPOTS.find((hotspot) => hotspot.id === "seasons")!;
const amanora = HOTSPOTS.find((hotspot) => hotspot.id === "amanora")!;

const each = (rupees: number): ConciergeBudget => ({ basis: "each", amountMinor: rupees * 100 });
const total = (rupees: number): ConciergeBudget => ({ basis: "total", amountMinor: rupees * 100 });

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

describe("findHotspotInText", () => {
  it("reads hotspots out of what a traveller types", () => {
    expect(findHotspotInText("Seasons Mall")?.id).toBe("seasons");
    expect(findHotspotInText("I'm near amanora")?.id).toBe("amanora");
    expect(findHotspotInText("Magarpatta City")?.id).toBe("magarpatta");
  });

  it("places Hadapsar at Seasons Mall, whose own address reads Hadapsar", () => {
    expect(findHotspotInText("hadapsar")?.id).toBe("seasons");
    expect(seasons.aliases).toContain("hadapsar");
  });

  it("does not guess at places outside the pilot", () => {
    expect(findHotspotInText("Koregaon Park")).toBeNull();
    expect(findHotspotInText("")).toBeNull();
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

describe("budget filtering — the traveller's own number", () => {
  it("compares per-head spend against an each budget, inclusive", () => {
    const cost = { perPersonMinor: 49_900, totalMinor: 99_800 };
    expect(budgetFit(cost, each(499))).toBe("within");
    expect(budgetFit(cost, each(498))).toBe("over");
    expect(budgetFit(cost, null)).toBe("flexible");
  });

  it("compares the party total against a total budget", () => {
    const cost = { perPersonMinor: 49_900, totalMinor: 99_800 };
    expect(budgetFit(cost, total(998))).toBe("within");
    expect(budgetFit(cost, total(997))).toBe("over");
  });

  it("labels a budget in the traveller's words, never a tier", () => {
    expect(formatBudget(each(500))).toBe("₹500 each");
    expect(formatBudget(total(3_000))).toBe("₹3,000 total");
    expect(formatBudget(null)).toBe("Flexible");
  });

  it("never returns a match above the per-head budget", () => {
    for (const craving of ["beer", "coffee", "arcade", "dining", "spa", "rooftop"]) {
      for (const partySize of [1, 2, 4]) {
        const { matches } = findVibeMatches(
          { hotspot: "seasons", craving, partySize, budget: each(600), limit: 10 },
          PILOT_EXPERIENCES,
        );
        for (const match of matches) expect(match.perPersonMinor).toBeLessThanOrEqual(60_000);
      }
    }
  });

  it("never returns a match above a total budget", () => {
    const { matches } = findVibeMatches({
      hotspot: "seasons",
      craving: "dining",
      partySize: 4,
      budget: total(4_000),
      limit: 10,
    });
    for (const match of matches) expect(match.totalMinor).toBeLessThanOrEqual(400_000);
  });

  it("excludes Effingut (₹1,499) at ₹500 each but keeps it when flexible", () => {
    const capped = findVibeMatches({
      hotspot: "seasons",
      craving: "beer",
      partySize: 2,
      budget: each(500),
      limit: 10,
    });
    const flexible = findVibeMatches({
      hotspot: "seasons",
      craving: "beer",
      partySize: 2,
      budget: null,
      limit: 10,
    });

    const effingut = "effingut-brewhouse-craft-tasting-seasons";
    expect(capped.matches.map((match) => match.slug)).not.toContain(effingut);
    expect(flexible.matches.map((match) => match.slug)).toContain(effingut);
  });

  it("quotes the real budget back in the reasons — no tier names", () => {
    const { matches } = findVibeMatches({
      hotspot: "seasons",
      craving: "beer",
      partySize: 2,
      budget: each(500),
      limit: 10,
    });
    const reasons = matches.flatMap((match) => match.reasons).join(" ");
    expect(reasons).toContain("within your ₹500 each");
    expect(reasons).not.toMatch(/pocket|mid-range|luxury|under your/i);

    const flexible = findVibeMatches({
      hotspot: "seasons",
      craving: "beer",
      partySize: 2,
      budget: null,
    });
    expect(flexible.matches[0]!.reasons.join(" ")).toContain("no budget cap set");
  });

  it("states a total budget against the party total", () => {
    const { matches } = findVibeMatches({
      hotspot: "seasons",
      craving: "beer",
      partySize: 2,
      budget: total(1_000),
    });
    expect(matches[0]!.reasons).toContain("₹998 total for 2 — within your ₹1,000 total");
  });

  it("returns no matches rather than inventing one, and names the real cheapest price", () => {
    const result = findVibeMatches({
      hotspot: "seasons",
      craving: "spa",
      partySize: 2,
      budget: each(300),
    });
    expect(result.matches).toEqual([]);
    expect(result.stretch).not.toBeNull();

    const excluded = PILOT_EXPERIENCES.find((item) => item.slug === result.stretch!.slug)!;
    const real = partyCost(excluded, 2).perPersonMinor;
    expect(result.stretch!.amountMinor).toBe(real);
    expect(result.stretch!.label).toBe(formatBudget({ basis: "each", amountMinor: real }));
  });

  it("has no stretch when the budget is flexible", () => {
    expect(
      findVibeMatches({ hotspot: "seasons", craving: "beer", partySize: 2, budget: null }).stretch,
    ).toBeNull();
  });

  it("drops listings whose guest range does not take the party", () => {
    // The O2 spa takes at most 2.
    const { matches } = findVibeMatches({
      hotspot: "seasons",
      craving: "spa",
      partySize: 4,
      budget: null,
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
      { hotspot: "seasons", craving: "beer", partySize: 6, budget: each(600) },
      [group],
    );
    const forTwo = findVibeMatches(
      { hotspot: "seasons", craving: "beer", partySize: 2, budget: each(600) },
      [group],
    );
    expect(forSix.matches[0]?.perPersonMinor).toBe(25_000);
    expect(forSix.matches[0]?.totalMinor).toBe(150_000);
    expect(forTwo.matches).toEqual([]);
    expect(forTwo.stretch).toMatchObject({ slug: "group-beer-tower", label: "₹750 each" });
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
    budget: each(500),
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
    expect(top.budgetFit).toBe("within");
  });

  it("explains why it fits with the real price and offers both quick actions", () => {
    expect(top.reasons.join(" ")).toMatch(/beer craving/);
    expect(top.reasons).toContain("₹499 a head — within your ₹500 each");
    expect(top.actions.book).toEqual({
      label: "Book",
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
    expect(result.budget).toEqual({ cap: each(500), label: "₹500 each" });
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
      { hotspot: "amanora", craving: "beer", partySize: 2, budget: each(600) },
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
      budget: null,
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
      budget: null,
    });
    expect(party).toEqual({ size: 6, kind: "squad" });
  });
});

/* ------------------------------------------------------- conversation */

function play(events: readonly ConversationEvent[], start = startConversation()) {
  return events.reduce<ConversationState>(converse, start);
}

const lastLine = (state: ConversationState) => state.messages.at(-1)!;

describe("parsePartyAndBudget", () => {
  it("reads the canonical phrasing", () => {
    expect(parsePartyAndBudget("2 people, ₹500 each")).toEqual({
      ok: true,
      partySize: 2,
      budget: { cap: each(500) },
    });
  });

  it("reads a total budget", () => {
    expect(parsePartyAndBudget("4 of us, ₹3,000 total")).toEqual({
      ok: true,
      partySize: 4,
      budget: { cap: total(3_000) },
    });
  });

  it("reads rupee spellings, thousands and bare numbers", () => {
    expect(parsePartyAndBudget("3 friends rs 800")).toMatchObject({ budget: { cap: each(800) } });
    expect(parsePartyAndBudget("1.5k each")).toMatchObject({ budget: { cap: each(1_500) } });
    expect(parsePartyAndBudget("2 people 500")).toMatchObject({
      partySize: 2,
      budget: { cap: each(500) },
    });
    expect(parsePartyAndBudget("2, 500")).toMatchObject({
      partySize: 2,
      budget: { cap: each(500) },
    });
  });

  it("reads solo, couples and 'me and N friends'", () => {
    expect(parsePartyAndBudget("just me, 400")).toMatchObject({ partySize: 1 });
    expect(parsePartyAndBudget("me and my partner")).toMatchObject({ partySize: 2 });
    expect(parsePartyAndBudget("me and 3 friends")).toMatchObject({ partySize: 4 });
    expect(parsePartyAndBudget("two people")).toMatchObject({ partySize: 2 });
  });

  it("reads flexible as an explicit no-cap", () => {
    expect(parsePartyAndBudget("2 people, flexible")).toEqual({
      ok: true,
      partySize: 2,
      budget: { cap: null },
    });
    expect(parsePartyAndBudget("no budget limit")).toMatchObject({
      ok: true,
      budget: { cap: null },
    });
  });

  it("leaves out what was not said instead of defaulting it", () => {
    expect(parsePartyAndBudget("₹500 each")).toEqual({
      ok: true,
      partySize: null,
      budget: { cap: each(500) },
    });
    expect(parsePartyAndBudget("3 people")).toEqual({
      ok: true,
      partySize: 3,
      budget: undefined,
    });
  });

  it("rejects parties and budgets it cannot plan for", () => {
    expect(parsePartyAndBudget("9 people, ₹500 each").ok).toBe(false);
    expect(parsePartyAndBudget("2 people, ₹5,00,00,000").ok).toBe(false);
    expect(parsePartyAndBudget("2 people, 300 or 500").ok).toBe(false);
  });
});

describe("the concierge conversation", () => {
  it("opens by asking where the traveller is", () => {
    const state = startConversation();
    expect(state.step).toBe("location");
    expect(state.messages).toHaveLength(1);
    expect(lastLine(state)).toMatchObject({ from: "concierge" });
    expect(lastLine(state).text).toMatch(/where are you/i);
  });

  it("asks the three questions in order, one at a time", () => {
    let state = startConversation();
    state = converse(state, { type: "hotspot", hotspotId: "seasons" });
    expect(state.step).toBe("craving");
    expect(lastLine(state).text).toMatch(/craving tonight/);

    state = converse(state, { type: "craving", value: "beer" });
    expect(state.step).toBe("party");
    expect(state.messages.at(-2)).toMatchObject({ from: "traveller", text: "Beer & chill" });
    expect(lastLine(state).text).toMatch(/Who's with you, and what's your real budget/);

    state = converse(state, { type: "text", text: "2 people, ₹500 each" });
    expect(state.step).toBe("done");
    expect(state).toMatchObject({
      location: { kind: "hotspot", hotspotId: "seasons" },
      craving: "beer",
      partySize: 2,
      budget: { cap: each(500) },
    });
    expect(lastLine(state).text).toBe(
      "Beer & chill for 2 of you near Seasons Mall, up to ₹500 each. Here's what fits.",
    );
  });

  it("takes a typed hotspot, including Hadapsar", () => {
    const state = play([{ type: "text", text: "Hadapsar" }]);
    expect(state.step).toBe("craving");
    expect(state.location).toMatchObject({ kind: "hotspot", hotspotId: "seasons" });
  });

  it("asks again, without guessing, when it does not know the place", () => {
    const state = play([{ type: "text", text: "Koregaon Park" }]);
    expect(state.step).toBe("location");
    expect(state.location).toBeNull();
    expect(lastLine(state).text).toMatch(/don't know that spot/);
  });

  it("uses a GPS fix in the pilot as-is", () => {
    const state = play([{ type: "gps", latitude: 18.5196, longitude: 73.9317 }]);
    expect(state.location).toMatchObject({ kind: "gps", label: "Seasons Mall" });
    expect(state.step).toBe("craving");
  });

  it("falls back, and says so, when the GPS fix is outside the pilot", () => {
    const state = play([{ type: "gps", latitude: 19.076, longitude: 72.8777 }]);
    expect(state.location).toMatchObject({ kind: "hotspot", hotspotId: "seasons" });
    expect(lastLine(state).text).toMatch(/outside our East Pune pilot/);
  });

  it("stays on the location question when the GPS prompt is denied", () => {
    const state = play([{ type: "gps-failed", reason: "denied" }]);
    expect(state.step).toBe("location");
    expect(lastLine(state).text).toMatch(/Location access is off/);
  });

  it("keeps a free-text craving in the traveller's own words", () => {
    const state = play([
      { type: "hotspot", hotspotId: "amanora" },
      { type: "text", text: "live music" },
    ]);
    expect(state.craving).toBe("live music");
    expect(lastLine(state).text).toMatch(/^live music — noted\./);
  });

  it("asks for the missing half of the party/budget answer", () => {
    let state = play([
      { type: "hotspot", hotspotId: "seasons" },
      { type: "craving", value: "coffee" },
      { type: "text", text: "3 people" },
    ]);
    expect(state.step).toBe("party");
    expect(lastLine(state).text).toMatch(/what's the most each person wants to spend/);

    state = converse(state, { type: "text", text: "₹700" });
    expect(state.step).toBe("done");
    expect(state).toMatchObject({ partySize: 3, budget: { cap: each(700) } });
  });

  it("accepts a quick-reply party and budget, including flexible", () => {
    const state = play([
      { type: "hotspot", hotspotId: "seasons" },
      { type: "craving", value: "dining" },
      { type: "party-budget", partySize: 4, cap: null },
    ]);
    expect(state.step).toBe("done");
    expect(state.messages.at(-2)).toMatchObject({ text: "4 people · Flexible" });
    expect(lastLine(state).text).toMatch(/no budget cap/);
  });

  it("explains a rejected budget and stays on the question", () => {
    const state = play([
      { type: "hotspot", hotspotId: "seasons" },
      { type: "craving", value: "beer" },
      { type: "text", text: "12 people, ₹500 each" },
    ]);
    expect(state.step).toBe("party");
    expect(lastLine(state).text).toMatch(/1 to 6 people/);
  });

  it("skips the craving question when the chat bar already said it", () => {
    let state = startConversation({ craving: "  craft beer " });
    expect(state.messages.map((message) => message.from)).toEqual(["traveller", "concierge"]);
    expect(state.craving).toBe("craft beer");

    state = converse(state, { type: "hotspot", hotspotId: "seasons" });
    expect(state.step).toBe("party");
  });

  it("ignores empty replies and events for another question", () => {
    const start = startConversation();
    expect(converse(start, { type: "text", text: "   " })).toBe(start);
    expect(converse(start, { type: "craving", value: "beer" })).toBe(start);
  });

  it("numbers messages uniquely and restarts cleanly", () => {
    const state = play([
      { type: "hotspot", hotspotId: "seasons" },
      { type: "craving", value: "beer" },
    ]);
    const ids = state.messages.map((message) => message.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(converse(state, { type: "restart" })).toEqual(startConversation());
  });
});

describe("conversation → results handoff", () => {
  const finished = play([
    { type: "hotspot", hotspotId: "seasons" },
    { type: "craving", value: "beer" },
    { type: "text", text: "2 people, ₹500 each" },
  ]);

  it("has no results URL until the conversation is done", () => {
    expect(resultsHref(startConversation())).toBeNull();
  });

  it("carries exactly what was said, in whole rupees", () => {
    expect(resultsHref(finished)).toBe(
      "/concierge/results?hotspot=seasons&craving=beer&party=2&budget=500",
    );
  });

  it("marks a total budget and omits a flexible one", () => {
    const totalled = play([
      { type: "hotspot", hotspotId: "amanora" },
      { type: "craving", value: "dining" },
      { type: "text", text: "4 of us, ₹3,000 total" },
    ]);
    expect(resultsHref(totalled)).toContain("budget=3000&budgetFor=total");

    const flexible = play([
      { type: "hotspot", hotspotId: "amanora" },
      { type: "craving", value: "dining" },
      { type: "party-budget", partySize: 2, cap: null },
    ]);
    expect(resultsHref(flexible)).not.toContain("budget");
  });

  it("rounds a GPS fix before it goes in the URL", () => {
    const fromGps = play([
      { type: "gps", latitude: 18.519612345, longitude: 73.931712345 },
      { type: "craving", value: "beer" },
      { type: "text", text: "solo, flexible" },
    ]);
    expect(resultsHref(fromGps)).toContain("lat=18.5196&lng=73.9317");
  });

  it("round-trips: the results page asks for what the conversation built", () => {
    const query = Object.fromEntries(new URL(resultsHref(finished)!, "https://x").searchParams);
    expect(requestFromQuery(query)).toMatchObject({
      hotspot: "seasons",
      craving: "beer",
      partySize: 2,
      budget: each(500),
    });
  });

  it("drops a malformed budget to flexible instead of failing, and needs a craving", () => {
    expect(requestFromQuery({ craving: "beer", budget: "lots" })?.budget).toBeNull();
    expect(requestFromQuery({ craving: "beer", budget: "0" })?.budget).toBeNull();
    expect(requestFromQuery({ craving: "beer", party: "x" })?.partySize).toBe(2);
    expect(requestFromQuery({ hotspot: "seasons" })).toBeNull();
  });
});

/* ------------------------------------------------------ results page */

async function renderResults(query: Record<string, string>): Promise<string> {
  const page = await ConciergeResultsPage({ searchParams: Promise.resolve(query) });
  return renderToStaticMarkup(page);
}

describe("the results page", () => {
  it("shows the founder's case with real prices, distance, reasons and both actions", async () => {
    const html = await renderResults({
      hotspot: "seasons",
      craving: "beer",
      party: "2",
      budget: "500",
    });
    expect(html).toContain("Beer &amp; chill near Seasons Mall");
    expect(html).toContain("₹500 each");
    expect(html).toContain("Indimex Urban Lounge");
    expect(html).toContain("₹998");
    expect(html).toContain("₹499 each");
    expect(html).toContain("Within Seasons Mall");
    expect(html).toContain("Why it matches");
    expect(html).toContain("₹499 a head — within your ₹500 each");
    expect(html).toContain("Walk There");
    expect(html).toContain('href="/experiences/indimex-urban-lounge-seasons"');
    expect(html).not.toMatch(/pocket-friendly|mid-range/);
  });

  it("offers the real cheapest price when nothing fits the budget", async () => {
    const html = await renderResults({
      hotspot: "seasons",
      craving: "spa",
      party: "2",
      budget: "300",
    });
    const { stretch } = findVibeMatches({
      hotspot: "seasons",
      craving: "spa",
      partySize: 2,
      budget: each(300),
    });
    expect(html).toContain("Nothing for spa fits ₹300 each");
    expect(html).toContain(`Show options up to ${stretch!.label}`);
    expect(html).toContain(`budget=${Math.ceil(stretch!.amountMinor / 100)}`);
  });

  it("sends a traveller with no answers back to the conversation", async () => {
    const html = await renderResults({});
    expect(html).toContain('href="/concierge"');
    expect(html).toContain("Ask the Concierge");
  });
});

describe("the home page", () => {
  const read = (file: string) =>
    readFileSync(join(process.cwd(), "src", "components", file), "utf8");

  it("mounts the chat bar, not the inline concierge widget", () => {
    for (const file of ["DesktopHome.tsx", "MobileHome.tsx"]) {
      const source = read(file);
      expect(source).toContain("<ConciergeChatBar");
      expect(source).not.toContain("InstantVibeConcierge");
    }
  });

  it("submits the chat bar to the conversation", () => {
    const bar = read("concierge/ConciergeChatBar.tsx");
    expect(bar).toContain('action="/concierge"');
    expect(bar).toContain('name="ask"');
  });
});
