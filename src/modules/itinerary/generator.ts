import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import { ValidationError } from "@/lib/errors";
import { MOOD_KEYWORDS, keywordsFor, mentions } from "@/modules/copilot/service";
import { isCopilotMood, type CopilotMood } from "@/modules/copilot/types";
import { distanceMetres, partyCost, walkMinutes } from "@/modules/concierge/service";
import {
  ITINERARY_CURRENCY,
  type Itinerary,
  type ItineraryInterpretation,
  type ItineraryPreferences,
  type ItineraryStop,
  type ItineraryTransfer,
} from "@/modules/itinerary/types";

/**
 * Deterministic itinerary scheduling over the pilot catalogue.
 *
 * No model is involved anywhere in this file. Ranking reuses the copilot's
 * mood vocabulary and word matcher; money is `quoteBooking` via the concierge's
 * `partyCost`; distances are arithmetic over stored coordinates. The search is
 * exhaustive over ordered selections — nineteen listings and at most four stops
 * is about ninety-three thousand sequences, each pruned as soon as it breaks a
 * time or budget rule — so the answer is the best plan, not a greedy one, and
 * the same preferences always produce the same plan.
 */

export class ItineraryDefinitionError extends Error {
  override readonly name = "ItineraryDefinitionError";
}

const at = (hour: number, minute = 0): number => hour * 60 + minute;

/** A range of suggested start times, minutes after midnight, inclusive. */
export interface SlotWindow {
  readonly earliest: number;
  readonly latest: number;
}

/**
 * When each pilot listing suits an itinerary — the slot-fit table.
 *
 * Editorial, like the start times in `modules/journeys/data.ts`: the time of
 * day an experience makes sense (a sunset walk at sunset, a rooftop bar after
 * dark), **not** opening hours and not availability. Every start the engine
 * suggests falls inside one of these windows; whether the venue can take the
 * party then is answered by that listing's booking flow.
 *
 * A listing missing from this table is never scheduled. The unit suite asserts
 * every pilot listing has an entry, so a new listing cannot silently vanish.
 */
export const SLOT_FIT: Readonly<Record<string, readonly SlotWindow[]>> = {
  "smaaash-vr-twilight-bowling-amanora": [{ earliest: at(12), latest: at(21, 30) }],
  "mystery-rooms-escape-challenge-amanora": [{ earliest: at(11), latest: at(21) }],
  "timezone-laser-tag-seasons-mall": [{ earliest: at(11), latest: at(21) }],
  "effingut-brewhouse-craft-tasting-seasons": [{ earliest: at(17), latest: at(21) }],
  "the-beer-cafe-global-taps-amanora": [{ earliest: at(17), latest: at(21, 30) }],
  "agent-jacks-interactive-bidding-bar": [{ earliest: at(18), latest: at(20, 30) }],
  "indimex-urban-lounge-seasons": [{ earliest: at(17), latest: at(22) }],
  "third-wave-coffee-artisan-roastery-amanora": [{ earliest: at(8), latest: at(18, 30) }],
  "the-flour-works-european-garden-brunch": [{ earliest: at(9), latest: at(20, 30) }],
  "cafe-peter-korean-bingsu-and-ramen-hadapsar": [{ earliest: at(12), latest: at(21, 30) }],
  "absolute-barbecues-wish-grill-seasons": [
    { earliest: at(12), latest: at(14, 30) },
    { earliest: at(19), latest: at(21, 30) },
  ],
  "spice-factory-rooftop-cocktails-hadapsar": [{ earliest: at(18), latest: at(21) }],
  "cinepolis-vip-luxury-cinema-seasons": [{ earliest: at(10), latest: at(21) }],
  "o2-spa-aromatherapy-and-reflexology-seasons": [{ earliest: at(10), latest: at(20, 30) }],
  "amanora-lake-sunset-walk-and-mindfulness": [{ earliest: at(17), latest: at(18) }],
  "pottery-and-clay-wheel-workshop-magarpatta": [{ earliest: at(10), latest: at(17) }],
  "hyatt-regency-brunch-wellness-viman-nagar": [{ earliest: at(11, 30), latest: at(13, 30) }],
  "shizusan-dimsum-sushi-tasting-phoenix-marketcity": [
    { earliest: at(12), latest: at(14, 30) },
    { earliest: at(19), latest: at(21, 30) },
  ],
  "toit-brewery-craft-beer-tasting-kalyani-viman": [{ earliest: at(17), latest: at(21) }],
};

export const ITINERARY_RULES = {
  /** Suggested starts land on the quarter hour. */
  startGranularityMinutes: 15,
  /** A gap longer than this between stops is not a plan, it is two plans. */
  maxIdleMinutes: 120,
  /** Above this straight-line distance the transfer is a ride, not a walk. */
  walkableMetres: 2_500,
  /** Leaving one venue and settling at the next, on top of the walk. */
  walkSettleMinutes: 5,
  /** Booking and boarding a ride, before it moves. */
  ridePickupMinutes: 15,
  /** Conservative city speed for the ride itself, in metres per minute (~18 km/h). */
  rideMetresPerMinute: 300,
} as const;

/**
 * Check the slot-fit table against a catalogue: every window well-formed and
 * on the quarter hour, every start leaving time to finish by midnight, and no
 * entry naming a listing that does not exist.
 */
export function assertSlotFitTable(
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
  table: Readonly<Record<string, readonly SlotWindow[]>> = SLOT_FIT,
): void {
  const bySlug = new Map(catalogue.map((listing) => [listing.slug, listing]));
  const step = ITINERARY_RULES.startGranularityMinutes;

  for (const [slug, windows] of Object.entries(table)) {
    const listing = bySlug.get(slug);
    if (!listing) {
      throw new ItineraryDefinitionError(
        `Slot-fit names "${slug}", which is not in the catalogue.`,
      );
    }
    if (windows.length === 0) {
      throw new ItineraryDefinitionError(`Slot-fit for "${slug}" has no windows.`);
    }
    windows.forEach((window, index) => {
      if (window.earliest > window.latest) {
        throw new ItineraryDefinitionError(`Slot-fit for "${slug}" window ${index} is inverted.`);
      }
      if (window.earliest % step !== 0 || window.latest % step !== 0) {
        throw new ItineraryDefinitionError(
          `Slot-fit for "${slug}" window ${index} is not on the quarter hour.`,
        );
      }
      if (window.latest + listing.durationMinutes > at(24)) {
        throw new ItineraryDefinitionError(
          `Slot-fit for "${slug}" window ${index} would run past midnight.`,
        );
      }
      const previous = windows[index - 1];
      if (previous && window.earliest <= previous.latest) {
        throw new ItineraryDefinitionError(
          `Slot-fit for "${slug}" windows must be ordered and disjoint.`,
        );
      }
    });
  }
}

// ── Interpretation ─────────────────────────────────────────────────────────

/**
 * Words that describe the shape of a plan rather than what is in it. On top
 * of the copilot's stopwords, which are about a single search.
 */
const SEQUENCE_WORDS = new Set([
  "then",
  "after",
  "afterwards",
  "before",
  "later",
  "followed",
  "finally",
  "plus",
  "also",
  "plan",
  "evening",
  "day",
  "start",
  "end",
]);

export interface Interpretation extends ItineraryInterpretation {
  /** Each mood's vocabulary, for coverage scoring. */
  readonly moodTerms: ReadonlyMap<CopilotMood, readonly string[]>;
}

/**
 * The moods and terms a plan is ranked against.
 *
 * Moods come from the chips, plus any mood named outright in the free text —
 * "gaming then cocktails" asks for gaming whether or not the chip was tapped.
 * The remaining words are free-text terms, filtered exactly as the copilot
 * filters them.
 */
export function interpretPreferences(
  preferences: Pick<ItineraryPreferences, "moods" | "intent">,
): Interpretation {
  const { queryTerms } = keywordsFor(undefined, preferences.intent);
  const named = queryTerms.filter(isCopilotMood);
  const moods = [...new Set([...preferences.moods, ...named])];

  return {
    moods,
    terms: queryTerms.filter((term) => !isCopilotMood(term) && !SEQUENCE_WORDS.has(term)),
    moodTerms: new Map(moods.map((mood) => [mood, MOOD_KEYWORDS[mood]])),
  };
}

// ── Candidates ─────────────────────────────────────────────────────────────

export interface Candidate {
  readonly listing: PilotExperienceInput;
  readonly windows: readonly SlotWindow[];
  readonly relevance: number;
  readonly matched: readonly string[];
  readonly moodsCovered: ReadonlySet<CopilotMood>;
  /** `quoteBooking` total for the party. */
  readonly partyTotalMinor: number;
}

/**
 * How strongly a listing answers the interpretation. Title outweighs category
 * outweighs summary, as in the copilot: a listing called "Rooftop Cocktails"
 * is about cocktails in a way one mentioning a bar in passing is not.
 */
export function scoreListing(
  listing: PilotExperienceInput,
  interpretation: Interpretation,
): Pick<Candidate, "relevance" | "matched" | "moodsCovered"> {
  const fields = [
    { text: listing.title, weight: 3 },
    { text: listing.categoryKey, weight: 2 },
    { text: listing.summary, weight: 1 },
  ];
  const weightOf = (term: string) =>
    fields.reduce(
      (best, field) => (mentions(field.text, term) ? Math.max(best, field.weight) : best),
      0,
    );

  let relevance = 0;
  const matched: string[] = [];
  const moodsCovered = new Set<CopilotMood>();

  const consider = (term: string, mood: CopilotMood | null) => {
    const weight = weightOf(term);
    if (weight === 0) return;
    if (!matched.includes(term)) {
      relevance += weight;
      matched.push(term);
    }
    if (mood) moodsCovered.add(mood);
  };

  for (const [mood, terms] of interpretation.moodTerms) {
    for (const term of terms) consider(term, mood);
  }
  for (const term of interpretation.terms) consider(term, null);

  return { relevance, matched, moodsCovered };
}

/** Why a listing cannot be scheduled for this party, or null when it can. */
function ineligibility(listing: PilotExperienceInput, partySize: number): string | null {
  if (!SLOT_FIT[listing.slug]) return "has no slot-fit entry";
  if (partySize < listing.minGuests || partySize > listing.maxGuests) {
    return `takes ${listing.minGuests}–${listing.maxGuests} guests`;
  }
  if (!Number.isSafeInteger(listing.basePriceMinor) || listing.basePriceMinor <= 0) {
    return "is priced on request";
  }
  return null;
}

export function toCandidate(
  listing: PilotExperienceInput,
  preferences: Pick<ItineraryPreferences, "partySize">,
  interpretation: Interpretation,
): Candidate | null {
  if (ineligibility(listing, preferences.partySize) !== null) return null;
  return {
    listing,
    windows: SLOT_FIT[listing.slug]!,
    ...scoreListing(listing, interpretation),
    partyTotalMinor: partyCost(listing, preferences.partySize).totalMinor,
  };
}

/**
 * Listings that can appear in this party's plan at all: in the slot-fit
 * table, within the guest range, priced, not excluded, and not alone over the
 * party's budget.
 */
export function prepareCandidates(
  catalogue: readonly PilotExperienceInput[],
  preferences: ItineraryPreferences,
  interpretation: Interpretation,
): Candidate[] {
  const excluded = new Set(preferences.exclude);
  const cap = budgetCapMinor(preferences);

  return catalogue
    .filter((listing) => !excluded.has(listing.slug))
    .map((listing) => toCandidate(listing, preferences, interpretation))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .filter((candidate) => cap === null || candidate.partyTotalMinor <= cap);
}

/** The party's whole-plan ceiling in minor units, or null for no cap. */
export function budgetCapMinor(
  preferences: Pick<ItineraryPreferences, "budgetPerPersonRupees" | "partySize">,
): number | null {
  if (preferences.budgetPerPersonRupees === undefined) return null;
  return preferences.budgetPerPersonRupees * 100 * preferences.partySize;
}

// ── Scheduling ─────────────────────────────────────────────────────────────

const ceilTo = (value: number, step: number) => Math.ceil(value / step) * step;

const coordinatesOf = (listing: PilotExperienceInput) => ({
  latitude: listing.latitude,
  longitude: listing.longitude,
});

/** The planning buffer between two venues, from their stored coordinates. */
export function transferBetween(
  from: PilotExperienceInput,
  to: PilotExperienceInput,
): ItineraryTransfer {
  const metres = Math.round(distanceMetres(coordinatesOf(from), coordinatesOf(to)));

  if (metres <= ITINERARY_RULES.walkableMetres) {
    return {
      mode: "walk",
      distanceMetres: metres,
      minutes: ceilTo(walkMinutes(metres) + ITINERARY_RULES.walkSettleMinutes, 5),
    };
  }
  return {
    mode: "ride",
    distanceMetres: metres,
    minutes: ceilTo(
      ITINERARY_RULES.ridePickupMinutes + metres / ITINERARY_RULES.rideMetresPerMinute,
      5,
    ),
  };
}

export interface ScheduledStop {
  readonly candidate: Candidate;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly transfer: ItineraryTransfer | null;
  readonly idleBeforeMinutes: number;
}

/**
 * The earliest suggested start for `candidate` after `previous`, or null when
 * none fits: inside a slot-fit window, on the quarter hour, finished by the
 * window's end, and with no more than the idle allowance after the transfer.
 *
 * Earliest-start is optimal for a fixed order — starting later can only push
 * every following stop later — so scheduling one sequence needs no search.
 */
export function placeStop(
  candidate: Candidate,
  previous: ScheduledStop | null,
  window: { readonly startMinute: number; readonly endMinute: number },
): ScheduledStop | null {
  const transfer = previous ? transferBetween(previous.candidate.listing, candidate.listing) : null;
  const ready = previous ? previous.endMinute + transfer!.minutes : window.startMinute;
  const aligned = ceilTo(ready, ITINERARY_RULES.startGranularityMinutes);

  for (const slot of candidate.windows) {
    const startMinute = Math.max(aligned, slot.earliest);
    if (startMinute > slot.latest) continue;

    const endMinute = startMinute + candidate.listing.durationMinutes;
    if (endMinute > window.endMinute) return null;

    // The first stop may wait for its own window; it is where the plan begins.
    const idleBeforeMinutes = previous ? startMinute - ready : 0;
    if (idleBeforeMinutes > ITINERARY_RULES.maxIdleMinutes) return null;

    return { candidate, startMinute, endMinute, transfer, idleBeforeMinutes };
  }
  return null;
}

/** Schedule a fixed order, or null when any stop cannot be placed. */
export function scheduleSequence(
  sequence: readonly Candidate[],
  window: { readonly startMinute: number; readonly endMinute: number },
): ScheduledStop[] | null {
  const scheduled: ScheduledStop[] = [];
  for (const candidate of sequence) {
    const placed = placeStop(candidate, scheduled.at(-1) ?? null, window);
    if (!placed) return null;
    scheduled.push(placed);
  }
  return scheduled;
}

/**
 * Chronology, re-checked independently of how the plan was built: every stop
 * inside the window and its slot, in order, with its transfer honoured.
 * Throws — a plan that fails this is a defect in the scheduler.
 */
export function assertChronological(
  stops: readonly ScheduledStop[],
  window: { readonly startMinute: number; readonly endMinute: number },
): void {
  stops.forEach((stop, index) => {
    const { listing, windows } = stop.candidate;
    if (stop.endMinute - stop.startMinute !== listing.durationMinutes) {
      throw new ItineraryDefinitionError(`"${listing.slug}" does not run for its duration.`);
    }
    if (stop.startMinute < window.startMinute || stop.endMinute > window.endMinute) {
      throw new ItineraryDefinitionError(`"${listing.slug}" falls outside the plan window.`);
    }
    if (
      !windows.some((slot) => stop.startMinute >= slot.earliest && stop.startMinute <= slot.latest)
    ) {
      throw new ItineraryDefinitionError(`"${listing.slug}" starts outside its slot-fit.`);
    }
    const previous = stops[index - 1];
    if (previous && stop.startMinute < previous.endMinute + (stop.transfer?.minutes ?? 0)) {
      throw new ItineraryDefinitionError(`"${listing.slug}" starts before the transfer ends.`);
    }
  });
}

// ── Money ──────────────────────────────────────────────────────────────────

/** Exact integer sum; refuses rather than lose precision past 2^53. */
export function sumMinor(amounts: readonly number[]): number {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(total)) {
    throw new ValidationError("This plan total is too large to process.");
  }
  return total;
}

// ── Ranking ────────────────────────────────────────────────────────────────

interface PlanScore {
  readonly length: number;
  readonly moodsCovered: number;
  readonly relevance: number;
  readonly categories: number;
  readonly idle: number;
  readonly transfer: number;
  readonly totalMinor: number;
  readonly key: string;
}

export function scorePlan(stops: readonly ScheduledStop[]): PlanScore {
  const moods = new Set<CopilotMood>();
  for (const stop of stops) for (const mood of stop.candidate.moodsCovered) moods.add(mood);

  return {
    length: stops.length,
    moodsCovered: moods.size,
    relevance: stops.reduce((sum, stop) => sum + stop.candidate.relevance, 0),
    categories: new Set(stops.map((stop) => stop.candidate.listing.categoryKey)).size,
    idle: stops.reduce((sum, stop) => sum + stop.idleBeforeMinutes, 0),
    transfer: stops.reduce((sum, stop) => sum + (stop.transfer?.minutes ?? 0), 0),
    totalMinor: stops.reduce((sum, stop) => sum + stop.candidate.partyTotalMinor, 0),
    key: stops.map((stop) => stop.candidate.listing.slug).join("|"),
  };
}

/**
 * Negative when `a` is the better plan. In priority order: more stops, more of
 * the asked-for moods covered, more relevant, more varied, less waiting, less
 * travelling, cheaper — and finally the slugs, so ties never depend on
 * catalogue order.
 */
export function comparePlans(a: PlanScore, b: PlanScore): number {
  return (
    b.length - a.length ||
    b.moodsCovered - a.moodsCovered ||
    b.relevance - a.relevance ||
    b.categories - a.categories ||
    a.idle - b.idle ||
    a.transfer - b.transfer ||
    a.totalMinor - b.totalMinor ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

export interface SearchResult {
  readonly best: ScheduledStop[] | null;
  readonly sequencesConsidered: number;
}

/**
 * Exhaustive depth-first search over ordered selections of up to `maxStops`
 * candidates. Every prefix is itself a plan, so when the requested count
 * cannot be reached the best shorter plan is still returned.
 */
export function searchPlans(
  candidates: readonly Candidate[],
  options: {
    readonly maxStops: number;
    readonly window: { readonly startMinute: number; readonly endMinute: number };
    readonly capMinor: number | null;
  },
): SearchResult {
  let best: { stops: ScheduledStop[]; score: PlanScore } | null = null;
  let sequencesConsidered = 0;
  const used = new Set<string>();

  const visit = (stops: ScheduledStop[], spentMinor: number) => {
    if (stops.length > 0) {
      sequencesConsidered += 1;
      const score = scorePlan(stops);
      if (!best || comparePlans(score, best.score) < 0) best = { stops: [...stops], score };
    }
    if (stops.length === options.maxStops) return;

    for (const candidate of candidates) {
      if (used.has(candidate.listing.slug)) continue;
      const spent = spentMinor + candidate.partyTotalMinor;
      if (options.capMinor !== null && spent > options.capMinor) continue;

      const placed = placeStop(candidate, stops.at(-1) ?? null, options.window);
      if (!placed) continue;

      used.add(candidate.listing.slug);
      stops.push(placed);
      visit(stops, spent);
      stops.pop();
      used.delete(candidate.listing.slug);
    }
  };

  visit([], 0);
  const found = best as { stops: ScheduledStop[] } | null;
  return { best: found ? found.stops : null, sequencesConsidered };
}

// ── Assembly ───────────────────────────────────────────────────────────────

function firstSentence(text: string, max = 180): string {
  const trimmed = text.trim();
  const sentence = /^.*?[.!?](\s|$)/s.exec(trimmed)?.[0].trim() ?? trimmed;
  if (sentence.length <= max) return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  return `${sentence.slice(0, max - 1).trimEnd()}…`;
}

/** Built only from what the listing says and what matched. */
export function stopRationale(candidate: Candidate): string {
  const hook = firstSentence(candidate.listing.summary);
  if (candidate.matched.length === 0) return hook;
  return `For ${candidate.matched.slice(0, 3).join(", ")}. ${hook}`;
}

export function assembleItinerary(
  stops: readonly ScheduledStop[],
  preferences: Pick<ItineraryPreferences, "partySize" | "budgetPerPersonRupees">,
): Itinerary {
  const first = stops[0];
  const last = stops.at(-1);
  if (!first || !last) throw new ItineraryDefinitionError("An itinerary needs at least one stop.");

  const items: ItineraryStop[] = stops.map((stop) => {
    const { listing } = stop.candidate;
    return {
      slug: listing.slug,
      title: listing.title,
      summary: listing.summary,
      categoryKey: listing.categoryKey,
      addressLine: listing.addressLine,
      venue: { lat: listing.latitude, lng: listing.longitude },
      startMinute: stop.startMinute,
      endMinute: stop.endMinute,
      durationMinutes: listing.durationMinutes,
      transfer: stop.transfer,
      idleBeforeMinutes: stop.idleBeforeMinutes,
      unitPriceMinor: listing.basePriceMinor,
      pricingUnit: listing.pricingUnit,
      partyTotalMinor: stop.candidate.partyTotalMinor,
      matched: stop.candidate.matched,
      why: stopRationale(stop.candidate),
    };
  });

  const totalMinor = sumMinor(items.map((item) => item.partyTotalMinor));

  return {
    stops: items,
    startMinute: first.startMinute,
    endMinute: last.endMinute,
    idleMinutes: items.reduce((sum, item) => sum + item.idleBeforeMinutes, 0),
    partySize: preferences.partySize,
    currency: ITINERARY_CURRENCY,
    totalMinor,
    perPersonMinor: Math.ceil(totalMinor / preferences.partySize),
    budgetPerPersonMinor:
      preferences.budgetPerPersonRupees === undefined
        ? null
        : preferences.budgetPerPersonRupees * 100,
  };
}
