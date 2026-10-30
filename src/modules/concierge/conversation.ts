import {
  BUDGET_RUPEES,
  CRAVING_CHIPS,
  HOTSPOTS,
  PARTY_SIZE,
  cravingDisplay,
  formatBudget,
  type BudgetBasis,
  type ConciergeBudget,
  type HotspotId,
} from "@/modules/concierge/options";
import { findHotspot, findHotspotInText, resolveLocation } from "@/modules/concierge/places";
import type { ConciergeRequest } from "@/modules/concierge/service";

/**
 * The concierge conversation — three questions, asked one at a time:
 *
 *   1. Where are you?            (GPS, a hotspot chip, or "Hadapsar" typed)
 *   2. What are you craving?     (a chip, or free text)
 *   3. Who's with you, and what's your real budget?
 *
 * A pure reducer: every turn is `(state, event) → state`, the concierge's
 * replies are deterministic copy, and nothing here touches the network or the
 * DOM. The finished state becomes a results URL; the results page re-derives
 * the request from that URL, so the conversation and the page cannot disagree
 * and a result is shareable.
 *
 * Parsing free text is the only interpretation here, and it only ever reads
 * what the traveller wrote — a party size, a rupee amount, a place name. It
 * never fills a gap with a guess: an answer it cannot read is asked again
 * (CLAUDE.md §7).
 */

export type ConversationStep = "location" | "craving" | "party" | "done";

export type LocationAnswer =
  | { readonly kind: "hotspot"; readonly hotspotId: HotspotId; readonly label: string }
  | {
      readonly kind: "gps";
      readonly latitude: number;
      readonly longitude: number;
      readonly label: string;
    };

export interface ChatMessage {
  readonly id: number;
  readonly from: "concierge" | "traveller";
  readonly text: string;
  /** A quieter second line under a concierge message. */
  readonly hint?: string;
}

export interface ConversationState {
  readonly step: ConversationStep;
  readonly location: LocationAnswer | null;
  /** What the ranking is sent: a chip's canonical id, or the traveller's own words. */
  readonly craving: string | null;
  /** How the craving is spoken back: the chip label, or the traveller's own words. */
  readonly cravingLabel: string | null;
  readonly partySize: number | null;
  /** `undefined` until answered; `{ cap: null }` is an explicit "flexible". */
  readonly budget: { readonly cap: ConciergeBudget | null } | undefined;
  readonly messages: readonly ChatMessage[];
}

export type ConversationEvent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "hotspot"; readonly hotspotId: HotspotId }
  | { readonly type: "gps"; readonly latitude: number; readonly longitude: number }
  | { readonly type: "gps-failed"; readonly reason: "denied" | "unavailable" }
  | { readonly type: "craving"; readonly value: string }
  | {
      readonly type: "party-budget";
      readonly partySize: number;
      readonly cap: ConciergeBudget | null;
    }
  | { readonly type: "restart" };

/* ------------------------------------------------------------- copy */

const HOTSPOT_NAMES = HOTSPOTS.map((hotspot) => hotspot.label).join(", ");

export const QUESTIONS = {
  location: {
    text: "Let's find you somewhere for right now. First — where are you?",
    hint: "Share your location, or tell me a spot like Seasons Mall, Amanora or Hadapsar.",
  },
  craving: {
    text: "What are you craving tonight?",
    hint: "Pick one below, or say it in your own words — “live music”, “ramen”…",
  },
  party: {
    text: "Who's with you, and what's your real budget?",
    hint: "Say it like “2 people, ₹500 each” or “4 of us, ₹3,000 total” — or choose Flexible.",
  },
} as const;

/* ---------------------------------------------------------- parsing */

const MAX_TEXT = 80;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const FLEXIBLE =
  /\b(flexible|no (?:budget|limit|cap)|any budget|unlimited|doesn'?t matter|whatever)\b/;
const TOTAL = /\b(total|altogether|all together|in all|for all|combined|overall|for everyone)\b/;
const SOLO = /\b(solo|just me|only me|alone|by myself|myself)\b/;
const COUPLE =
  /\b(couple|the two of us|both of us|date night|me and (?:my )?(?:partner|wife|husband|girlfriend|boyfriend|friend|date))\b/;
const PEOPLE =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:people|persons?|pax|ppl|guests?|adults?|friends|of us|heads)\b/;
const ME_AND =
  /\bme (?:and|\+|&) (\d{1,2}|one|two|three|four|five|six|seven|eight|nine) (?:friends|others|more)\b/;
/** A currency-marked amount: "₹500", "rs 500", "500 rupees", "1.5k", "2k". */
const MONEY =
  /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?|\b(\d[\d,]*(?:\.\d+)?)\s*(k\b|rupees\b|rs\b|inr\b|₹)/;

function toNumber(word: string): number {
  return NUMBER_WORDS[word] ?? Number(word);
}

function rupees(amount: string, thousands: boolean): number {
  const value = Number(amount.replace(/,/g, ""));
  return Math.round(thousands ? value * 1000 : value);
}

export type PartyBudgetParse =
  | {
      readonly ok: true;
      /** Null when the text did not say. */
      readonly partySize: number | null;
      /** `undefined` when the text did not say; `{ cap: null }` for "flexible". */
      readonly budget: { readonly cap: ConciergeBudget | null } | undefined;
    }
  | { readonly ok: false; readonly reason: string };

/** Rupees as typed → a budget in minor units, or null outside the sane range. */
export function budgetFromRupees(amount: number, basis: BudgetBasis): ConciergeBudget | null {
  if (!Number.isFinite(amount)) return null;
  const whole = Math.round(amount);
  if (whole < BUDGET_RUPEES.min || whole > BUDGET_RUPEES.max) return null;
  return { basis, amountMinor: whole * 100 };
}

/**
 * Reads "2 people, ₹500 each", "4 of us 3000 total", "solo, flexible",
 * "just me 800" or "2, 500". Only what is written is returned — a missing
 * party size or budget comes back as missing, never as a default.
 */
export function parsePartyAndBudget(input: string): PartyBudgetParse {
  let text = input.toLowerCase().replace(/[–—]/g, "-").trim();
  if (!text) return { ok: true, partySize: null, budget: undefined };

  let partySize: number | null = null;
  const people = PEOPLE.exec(text);
  const meAnd = ME_AND.exec(text);
  if (meAnd) {
    partySize = toNumber(meAnd[1]!) + 1;
    text = text.replace(meAnd[0], " ");
  } else if (people) {
    partySize = toNumber(people[1]!);
    text = text.replace(people[0], " ");
  } else if (SOLO.test(text)) {
    partySize = 1;
  } else if (COUPLE.test(text)) {
    partySize = 2;
  }

  const basis: BudgetBasis = TOTAL.test(text) ? "total" : "each";
  let budget: { readonly cap: ConciergeBudget | null } | undefined;
  let amount: number | null = null;

  const money = MONEY.exec(text);
  if (money) {
    amount =
      money[1] !== undefined ? rupees(money[1], !!money[2]) : rupees(money[3]!, money[4] === "k");
  } else {
    const bare = [...text.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map((match) =>
      Number(match[0].replace(/,/g, "")),
    );
    // "2, 500": with no party named, a leading small whole number is the party.
    if (partySize === null && bare.length >= 2 && Number.isInteger(bare[0]) && bare[0]! <= 10) {
      partySize = bare.shift()!;
    }
    if (bare.length === 1) amount = Math.round(bare[0]!);
    else if (bare.length > 1) {
      return { ok: false, reason: "I caught more than one amount there — which is the budget?" };
    }
  }

  if (amount !== null) {
    const cap = budgetFromRupees(amount, basis);
    if (!cap) {
      return {
        ok: false,
        reason: `I can work with a budget between ₹${BUDGET_RUPEES.min} and ₹${BUDGET_RUPEES.max.toLocaleString("en-IN")}.`,
      };
    }
    budget = { cap };
  } else if (FLEXIBLE.test(text)) {
    budget = { cap: null };
  }

  if (partySize !== null && (partySize < PARTY_SIZE.min || partySize > PARTY_SIZE.max)) {
    return {
      ok: false,
      reason: `Right now I can plan for ${PARTY_SIZE.min} to ${PARTY_SIZE.max} people.`,
    };
  }

  return { ok: true, partySize, budget };
}

/* ----------------------------------------------------------- reducer */

export interface ConversationSeed {
  /** A craving typed into the home page's chat bar, answered ahead of its turn. */
  readonly craving?: string | undefined;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

export function startConversation(seed: ConversationSeed = {}): ConversationState {
  const craving = seed.craving ? cleanText(seed.craving) : "";
  const base: ConversationState = {
    step: "location",
    location: null,
    craving: null,
    cravingLabel: null,
    partySize: null,
    budget: undefined,
    messages: [],
  };
  if (!craving) return say(base, QUESTIONS.location.text, QUESTIONS.location.hint);

  return say(
    { ...hear(base, craving), craving, cravingLabel: craving },
    `${craving} — I can help with that. First, where are you right now?`,
    QUESTIONS.location.hint,
  );
}

function append(state: ConversationState, message: Omit<ChatMessage, "id">): ConversationState {
  const id = (state.messages.at(-1)?.id ?? 0) + 1;
  return { ...state, messages: [...state.messages, { ...message, id }] };
}

function say(state: ConversationState, text: string, hint?: string): ConversationState {
  return append(state, { from: "concierge", text, ...(hint ? { hint } : {}) });
}

function hear(state: ConversationState, text: string): ConversationState {
  return append(state, { from: "traveller", text });
}

/** "2 people · ₹500 each", "Just me · Flexible". */
export function describePartyBudget(partySize: number, cap: ConciergeBudget | null): string {
  const who = partySize === 1 ? "Just me" : `${partySize} people`;
  return `${who} · ${formatBudget(cap)}`;
}

/** What the conversation does once it knows where the traveller is. */
function afterLocation(state: ConversationState, location: LocationAnswer, notice?: string) {
  const next = { ...state, location };
  const lead = notice ? `${notice} ` : "";
  if (next.craving) {
    return say(
      { ...next, step: "party" as const },
      `${lead}${location.label} it is. ${QUESTIONS.party.text}`,
      QUESTIONS.party.hint,
    );
  }
  return say(
    { ...next, step: "craving" as const },
    `${lead}${location.label} it is. ${QUESTIONS.craving.text}`,
    QUESTIONS.craving.hint,
  );
}

function afterCraving(state: ConversationState, craving: string, label: string) {
  return say(
    { ...state, craving, cravingLabel: label, step: "party" as const },
    `${label} — noted. ${QUESTIONS.party.text}`,
    QUESTIONS.party.hint,
  );
}

/** Merge a party/budget answer with anything already given, then finish or ask for the rest. */
function afterPartyBudget(
  state: ConversationState,
  partySize: number | null,
  budget: ConversationState["budget"],
): ConversationState {
  const next: ConversationState = {
    ...state,
    partySize: partySize ?? state.partySize,
    budget: budget ?? state.budget,
  };

  if (next.partySize === null && next.budget === undefined) {
    return say(
      next,
      "I didn't quite catch that. How many of you, and what can each person spend?",
      QUESTIONS.party.hint,
    );
  }
  if (next.partySize === null) {
    return say(next, "Got the budget. And how many of you are there?", "A number is fine — “3”.");
  }
  if (next.budget === undefined) {
    return say(
      next,
      `${next.partySize === 1 ? "Just you" : `${next.partySize} of you`}. And what's the most each person wants to spend?`,
      "A number like ₹500, a total like “₹2,000 total”, or Flexible.",
    );
  }

  const where = next.location ? ` near ${next.location.label}` : "";
  const party = next.partySize === 1 ? "just you" : `${next.partySize} of you`;
  const cap = next.budget.cap === null ? "no budget cap" : `up to ${formatBudget(next.budget.cap)}`;
  return say(
    { ...next, step: "done" },
    `${next.cravingLabel ?? cravingDisplay(next.craving ?? "")} for ${party}${where}, ${cap}. Here's what fits.`,
  );
}

function locateFromGps(latitude: number, longitude: number) {
  const resolved = resolveLocation({ latitude, longitude });
  if (resolved.source === "gps") {
    return {
      location: { kind: "gps", latitude, longitude, label: resolved.label } as LocationAnswer,
      notice: undefined,
    };
  }
  return {
    location: {
      kind: "hotspot",
      hotspotId: resolved.hotspotId!,
      label: resolved.label,
    } as LocationAnswer,
    notice: resolved.notice ?? undefined,
  };
}

export function converse(state: ConversationState, event: ConversationEvent): ConversationState {
  if (event.type === "restart") return startConversation();
  if (state.step === "done") return state;

  switch (state.step) {
    case "location": {
      if (event.type === "hotspot") {
        const hotspot = findHotspot(event.hotspotId);
        if (!hotspot) return state;
        return afterLocation(hear(state, hotspot.label), {
          kind: "hotspot",
          hotspotId: hotspot.id,
          label: hotspot.label,
        });
      }
      if (event.type === "gps") {
        const { location, notice } = locateFromGps(event.latitude, event.longitude);
        return afterLocation(hear(state, "Use my location"), location, notice);
      }
      if (event.type === "gps-failed") {
        return say(
          state,
          event.reason === "denied"
            ? "Location access is off — no problem. Just tell me where you are."
            : "I couldn't get a fix on your location. Just tell me where you are.",
          `I know ${HOTSPOT_NAMES} — and Hadapsar.`,
        );
      }
      if (event.type === "text") {
        const text = cleanText(event.text);
        if (!text) return state;
        const heard = hear(state, text);
        const hotspot = findHotspotInText(text);
        if (!hotspot) {
          return say(
            heard,
            "I don't know that spot yet — our pilot covers East Pune for now.",
            `Try ${HOTSPOT_NAMES}, or share your location.`,
          );
        }
        return afterLocation(heard, {
          kind: "hotspot",
          hotspotId: hotspot.id,
          label: hotspot.label,
        });
      }
      return state;
    }

    case "craving": {
      if (event.type === "craving") {
        const chip = CRAVING_CHIPS.find((option) => option.value === event.value);
        if (!chip) return state;
        return afterCraving(hear(state, chip.label), chip.value, chip.label);
      }
      if (event.type === "text") {
        const text = cleanText(event.text);
        if (!text) return state;
        return afterCraving(hear(state, text), text, text);
      }
      return state;
    }

    case "party": {
      if (event.type === "party-budget") {
        if (event.partySize < PARTY_SIZE.min || event.partySize > PARTY_SIZE.max) return state;
        return afterPartyBudget(
          hear(state, describePartyBudget(event.partySize, event.cap)),
          event.partySize,
          { cap: event.cap },
        );
      }
      if (event.type === "text") {
        const text = cleanText(event.text);
        if (!text) return state;
        const heard = hear(state, text);
        const parsed = parsePartyAndBudget(text);
        if (!parsed.ok) return say(heard, parsed.reason, QUESTIONS.party.hint);
        return afterPartyBudget(heard, parsed.partySize, parsed.budget);
      }
      return state;
    }

    default:
      return state;
  }
}

/* -------------------------------------------------- results handoff */

/** ~11 m. Enough for "450m walk"; less identifying than a raw device fix. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * The finished conversation as a results URL. Budgets travel in whole rupees,
 * as the traveller said them, the same convention as `/experiences`' price
 * filters. A flexible budget simply has no `budget` parameter.
 */
export function resultsHref(state: ConversationState): string | null {
  if (state.step !== "done" || !state.location || !state.craving || state.partySize === null) {
    return null;
  }
  const params = new URLSearchParams();
  if (state.location.kind === "gps") {
    params.set("lat", String(roundCoordinate(state.location.latitude)));
    params.set("lng", String(roundCoordinate(state.location.longitude)));
  } else {
    params.set("hotspot", state.location.hotspotId);
  }
  params.set("craving", state.craving);
  params.set("party", String(state.partySize));
  const cap = state.budget?.cap ?? null;
  if (cap) {
    params.set("budget", String(cap.amountMinor / 100));
    if (cap.basis === "total") params.set("budgetFor", "total");
  }
  return `/concierge/results?${params.toString()}`;
}

type RawParams = Readonly<Record<string, string | string[] | undefined>>;

function first(params: RawParams, key: string): string | undefined {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return text?.trim() ? text.trim() : undefined;
}

/**
 * The results page's query → a ranking request. Malformed values are dropped
 * rather than rejected, as on `/experiences`: a mangled link should still show
 * picks, with the page stating which budget it actually used. Null only when
 * there is no craving at all — there is nothing to rank without one.
 */
export function requestFromQuery(params: RawParams): ConciergeRequest | null {
  const craving = first(params, "craving");
  if (!craving) return null;

  const party = Number(first(params, "party"));
  const basis: BudgetBasis = first(params, "budgetFor") === "total" ? "total" : "each";
  const amount = first(params, "budget");

  return {
    latitude: first(params, "lat"),
    longitude: first(params, "lng"),
    hotspot: first(params, "hotspot"),
    craving: craving.slice(0, MAX_TEXT),
    partySize: Number.isFinite(party) && party > 0 ? party : 2,
    budget: amount === undefined ? null : budgetFromRupees(Number(amount), basis),
  };
}
