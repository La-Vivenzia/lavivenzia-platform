import { z } from "zod";

import { formatDuration, formatGuestRange, formatMoneyMinor } from "@/lib/format";
import { parseFilters } from "@/modules/discovery/service";
import { CURATION_TRACK_LABELS, timeSavedLabel } from "@/modules/discovery/curation";
import type { CategorySummary, ExperienceSummary } from "@/modules/discovery/ports";
import type { DiscoveryService } from "@/modules/discovery/service";
import type { Journey } from "@/modules/journeys/data";
import {
  composeJourneyLead,
  detectOccasion,
  selectJourneys,
  toVivenIQJourney,
} from "@/modules/viveniq/journeys";
import {
  VIVENIQ_LIMITS,
  type VivenIQJourney,
  type VivenIQPick,
  type VivenIQPickCuration,
  type VivenIQReply,
} from "@/modules/viveniq/options";
import {
  detectMood,
  selectTrackPicks,
  tasteAffinity,
  type MoodIntent,
} from "@/modules/viveniq/tracks";
import { VIBE_OPTIONS, type TravelPreferences } from "@/modules/user-profile/profile";
import type { LlmPort } from "@/ports/llm";

export {
  VIVENIQ_LIMITS,
  VIVENIQ_STARTERS,
  type VivenIQJourney,
  type VivenIQJourneyAct,
  type VivenIQPick,
  type VivenIQPickCuration,
  type VivenIQReply,
} from "@/modules/viveniq/options";

/**
 * VivenIQ — conversational search over the published catalogue.
 *
 * A traveller describes a moment in their own words; this module turns the
 * words into discovery queries, ranks what comes back, and writes the reply.
 *
 * **Deterministic, and nothing on a pick is invented (CLAUDE.md §7).** Every
 * title, place, duration and price is read off an `ExperienceSummary` the
 * discovery port returned — published listings only, by construction. The
 * reply is composed from those facts and from what the traveller said. It
 * never states availability: a question about a time or a table is answered by
 * pointing at the experience page, where slots are read from PostgreSQL.
 *
 * What this module owns is interpretation and ranking, which CLAUDE.md §7 says
 * AI may do. When a model is configured it may *rephrase* the reply around
 * the picks already chosen — it never chooses them, and it is shown nothing
 * but their verified facts. Output that fails validation, states a number or
 * currency, or arrives late is dropped for the deterministic reply.
 */

/* ---------------------------------------------------------- interpretation */

/**
 * Words that carry no catalogue meaning. Searching for "around" or "intimate"
 * runs a trigram scan that can only add noise to the ranking.
 */
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "some",
  "something",
  "somewhere",
  "want",
  "need",
  "like",
  "would",
  "could",
  "can",
  "you",
  "your",
  "our",
  "are",
  "any",
  "near",
  "nearby",
  "here",
  "there",
  "this",
  "that",
  "who",
  "whom",
  "which",
  "tell",
  "me",
  "kya",
  "kaun",
  "tum",
  "aap",
  "hai",
  "batao",
  // Hinglish filler: "mujhe beer pini hai" is a request for beer, not for
  // listings that fuzzy-match "mujhe" or "pini".
  "mujhe",
  "humein",
  "hume",
  "chahiye",
  "karna",
  "krna",
  "kuch",
  "koi",
  "yaar",
  "hain",
  "kahan",
  "kidhar",
  "wala",
  "wali",
  "pini",
  "peeni",
  "peena",
  "pina",
  "jana",
  "jaana",
  "chalo",
  "what",
  "where",
  "when",
  "how",
  "from",
  "into",
  "about",
  "around",
  "good",
  "nice",
  "best",
  "place",
  "spot",
  "now",
  "today",
  "tonight",
  "tomorrow",
  "evening",
  "morning",
  "afternoon",
  // Days are when, not what. As keywords they only fuzz-match unrelated
  // titles ("sunday" scores against "sunset").
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "weekend",
  "people",
  "person",
  "guests",
  "table",
  "please",
  "show",
  "find",
  "give",
  "get",
  "more",
  "less",
  "other",
  "else",
  "different",
  "alternative",
  "alternatives",
  "instead",
  "intimate",
  "thrilling",
  "minute",
  "minutes",
  "hour",
  "hours",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
]);

/** Words asking for new options rather than describing a new moment. */
const MORE_WORDS = /\b(more|else|different|other|another|alternatives?|instead)\b/;

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

function normalise(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** The meaningful words in a message, in the order they were said. */
export function extractTerms(text: string): string[] {
  const words = normalise(text)
    .split(/[^a-z0-9-]+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !STOPWORDS.has(word));

  return [...new Set(words)];
}

/** "table for 2", "for two", "4 people", "party of 6" → the number, or null. */
export function parsePartySize(text: string): number | null {
  const lower = normalise(text);
  const number = String.raw`(\d{1,3}|${Object.keys(NUMBER_WORDS).join("|")})`;
  const patterns = [
    new RegExp(String.raw`\b(?:table|party|group|booking)\s+(?:for|of)\s+${number}\b`),
    new RegExp(String.raw`\bfor\s+${number}\b(?!\s*(?:pm|am|min|minutes|hours?|:))`),
    new RegExp(String.raw`\b${number}\s+(?:people|persons|guests|adults|of us|pax)\b`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(lower)?.[1];
    if (!match) continue;
    const value = NUMBER_WORDS[match] ?? Number(match);
    if (Number.isInteger(value) && value >= 1 && value <= 500) return value;
  }

  return null;
}

/** Whether the traveller asked about a time — which this module cannot answer. */
export function mentionsTime(text: string): boolean {
  return /\b(\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2}|tonight|tomorrow|this evening|today|o'?clock)\b/.test(
    normalise(text),
  );
}

/** A category the traveller named, by key or by display name. */
export function findNamedCategory(
  terms: readonly string[],
  categories: readonly CategorySummary[],
): CategorySummary | null {
  return (
    categories.find((category) => {
      const key = normalise(category.key);
      const name = normalise(category.name);
      return terms.some(
        (term) => term === key || term === name || name.split(/\s+/).includes(term),
      );
    }) ?? null
  );
}

/* -------------------------------------------------------------------- picks */

export function priceLabel(experience: ExperienceSummary): string | null {
  const amount = formatMoneyMinor(experience.basePriceMinor, experience.currency);
  if (amount === null) return null;
  return `${amount} / ${experience.pricingUnit === "PER_GROUP" ? "group" : "person"}`;
}

function quote(terms: readonly string[]): string {
  const quoted = terms.map((term) => `“${term}”`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)!}`;
}

function toPickCuration(experience: ExperienceSummary): VivenIQPickCuration | null {
  const curation = experience.curation;
  if (!curation) return null;
  return {
    track: curation.curationTrack,
    trackLabel: CURATION_TRACK_LABELS[curation.curationTrack],
    vipPerks: curation.vipPerks,
    curatorSecret: curation.curatorSecret,
    timeSavedMinutes: curation.timeSavedMinutes,
    timeSavedLabel: timeSavedLabel(curation.timeSavedMinutes),
    curatedPairing: curation.curatedPairing ?? null,
  };
}

function toPick(experience: ExperienceSummary, reason: string): VivenIQPick {
  return {
    slug: experience.slug,
    title: experience.title,
    place: [experience.city, experience.region].filter(Boolean).join(", ") || experience.country,
    categoryName: experience.categoryName,
    durationLabel:
      formatDuration(experience.durationMinutes) ??
      formatGuestRange(experience.minGuests, experience.maxGuests),
    priceLabel: priceLabel(experience),
    coverUrl: experience.coverUrl,
    coverAlt: experience.coverAlt ?? "",
    reason,
    curation: toPickCuration(experience),
  };
}

function seats(experience: ExperienceSummary, party: number): boolean {
  return (
    experience.minGuests <= party &&
    (experience.maxGuests === null || experience.maxGuests >= party)
  );
}

/* ------------------------------------------------------------------ service */

export interface VivenIQRequest {
  readonly message: string;
  readonly history?: readonly string[];
  readonly seen?: readonly string[];
  /**
   * The signed-in traveller's saved taste profile. Read server-side from the
   * session, never from the request body, so a client cannot claim one.
   */
  readonly preferences?: TravelPreferences | null;
}

interface Candidate {
  readonly experience: ExperienceSummary;
  score: number;
  /** Earliest position in any result list — discovery's own relevance order. */
  rank: number;
  readonly matched: Set<string>;
  inCategory: boolean;
}

export interface VivenIQServiceDeps {
  readonly discovery: Pick<DiscoveryService, "browse" | "featured" | "categories">;
  /**
   * The curated journey collection. Optional: absent means VivenIQ answers
   * every occasion with single venues only.
   */
  readonly journeys?: (() => readonly Journey[]) | undefined;
  /** Optional. Absent means every reply is deterministic. */
  readonly llm?: LlmPort | undefined;
  /** Observability hook for a failed or rejected model reply. Never throws. */
  readonly onLlmFailure?: ((reason: string) => void) | undefined;
}

export const VIVENIQ_LLM = {
  /** Search-path budget: the traveller is watching the bubble. */
  timeoutMs: 4_500,
  /** Room for three curated tracks, one evocative sentence each. */
  maxOutputTokens: 450,
  replyMaxLength: 900,
} as const;

/** Follows a journey lead, introducing the single-venue picks beneath it. */
const SINGLE_STOP_NOTE = "Should you prefer a single stop, the venues below stand on their own.";

/** The deterministic note that answers any question about a time or a table. */
const TIME_NOTE =
  "Times and tables are confirmed live on each experience page — I’d rather you see the real slots than take my word for one.";

export const IDENTITY_QUERY =
  /\b(who|what) are you\b|\b(who|what) made you\b|\bare you (gemini|google|chatgpt|openai|claude|an ai|ai|a bot|a robot|a language model)\b|\bwho (created|built|designed) you\b|\b(your name|tell me about yourself)\b|\b(kaun ho|kya ho tum|tum kaun|aap kaun|kon ho)\b/i;

export const OFF_TOPIC_QUERY =
  /\b(python|javascript|typescript|golang|java|c\+\+|rust|html|css|sql|react|node|algorithm|leetcode|quicksort|binary search|homework|solve this|write code|code for|debug|calculator)\b/i;

export const IDENTITY_REPLY =
  "I am VivenIQ, your private concierge at La Vivenzia. I curate intimate culinary journeys, private tastings, serene retreats, and bespoke escapes across our handpicked collection. Describe the moment you're dreaming of, and I'll find the setting.";

export const DEFLECTION_REPLY =
  "I exist exclusively to choreograph your journeys and private escapes at La Vivenzia. Shall I curate an evening of craft tastings or a serene poolside retreat for you instead?";

export const VIVENIQ_SYSTEM_PROMPT = [
  "You are VivenIQ, the private travel director and elite cultural and culinary curator of La Vivenzia.",
  "Your voice is that of an Aman Resorts travel director writing for the Michelin Guide: evocative, cultured and warm; precise yet unhurried; never effusive. You read the traveller's mood first, then explain why each experience fits this moment — its vibe, its crowd, its light, texture and aroma — rather than reaching for superlatives or marketing language.",
  "Never sound like a search index. Do not write formulas such as 'For this, I would begin with', 'I have set aside alternatives' or 'Here are some options'. Each reply is a short piece of bespoke editorial storytelling.",
  "CURATED TRACKS: when presentAsCuratedTracks is true, present each experience as its own contrasting mood, introduced by its curationTrack name, in one evocative sentence that says who it suits and names one of its vipPerks or its curatedPairing in words. Close by noting that every track is paid once at booking, so the traveller simply shows up.",
  "TASTE PROFILE: when the traveller's tasteProfile is provided, acknowledge it gracefully in a single clause (for example, a penchant for quiet artisanal spaces) and let it explain the order of the experiences. Never claim a preference was honoured beyond what that order shows.",
  "RULE 1 - IDENTITY: You are always VivenIQ — never an AI language model, never Gemini, never Google. If asked who or what you are, state: 'I am VivenIQ, your private concierge at La Vivenzia.'",
  "RULE 2 - STRICT DOMAIN: You exclusively attend to experiential journeys, dining, tastings, wellness, and bespoke escapes at La Vivenzia. If the traveller asks for code, programming, homework, technical tasks, or unrelated trivia, deflect graciously back to La Vivenzia: 'I exist exclusively to choreograph your journeys and private escapes at La Vivenzia. Shall I curate an evening of craft tastings or a serene poolside retreat for you instead?'",
  "RULE 3 - ZERO HALLUCINATIONS: Speak only about the verified candidate experiences provided in this prompt. Never invent venues, prices, or slots, and never embellish an experience beyond what its details support.",
  "RULE 4 - CONCISE OUTPUT: Reply in 2-3 engaging sentences — up to 5 when presenting curated tracks — that speak directly to the traveller's mood or craving and introduce the curated picks by name.",
  "Never state prices, currency, numbers, times, table numbers, minutes saved or availability: the experience cards show the verified values beside your words.",
  'Respond as JSON: {"reply":"<your words>"}.',
].join("\n");

const LlmReply = z.object({ reply: z.string() });

/**
 * Anything that reads as a price, count or time. The cards render the real
 * values beside the reply, so prose that restates them can only disagree.
 */
const FACTUAL_CLAIM = /[0-9₹$€£]|\b(rs|inr|rupees?)\b/i;

/** The model's reply if it is usable, or null for the deterministic one. */
export function acceptReply(raw: unknown): string | null {
  const parsed = LlmReply.safeParse(raw);
  if (!parsed.success) return null;
  const reply = parsed.data.reply.trim().replace(/\s+/g, " ");
  if (reply.length === 0 || reply.length > VIVENIQ_LLM.replyMaxLength) return null;
  if (FACTUAL_CLAIM.test(reply)) return null;
  return reply;
}

export class VivenIQService {
  readonly #discovery: VivenIQServiceDeps["discovery"];
  readonly #journeys: VivenIQServiceDeps["journeys"];
  readonly #llm: LlmPort | undefined;
  readonly #onLlmFailure: VivenIQServiceDeps["onLlmFailure"];

  constructor(deps: VivenIQServiceDeps) {
    this.#discovery = deps.discovery;
    this.#journeys = deps.journeys;
    this.#llm = deps.llm;
    this.#onLlmFailure = deps.onLlmFailure;
  }

  async respond(request: VivenIQRequest): Promise<VivenIQReply> {
    const message = request.message.trim().slice(0, VIVENIQ_LIMITS.message.max);
    const history = (request.history ?? []).slice(-VIVENIQ_LIMITS.history.max);
    const seen = new Set((request.seen ?? []).slice(-VIVENIQ_LIMITS.seen.max));

    const normalised = normalise(message);
    if (IDENTITY_QUERY.test(normalised)) {
      const featured = (await this.#discovery.featured(VIVENIQ_LIMITS.picks.max)).map(
        (experience) => toPick(experience, "A signature experience from our collection"),
      );
      const categories = await this.#discovery.categories();
      return {
        reply: IDENTITY_REPLY,
        picks: featured,
        followUps: categories.slice(0, 3).map((entry) => `Something in ${entry.name}`),
      };
    }

    if (OFF_TOPIC_QUERY.test(normalised)) {
      const featured = (await this.#discovery.featured(VIVENIQ_LIMITS.picks.max)).map(
        (experience) => toPick(experience, "A signature experience from our collection"),
      );
      const categories = await this.#discovery.categories();
      return {
        reply: DEFLECTION_REPLY,
        picks: featured,
        followUps: categories.slice(0, 3).map((entry) => `Something in ${entry.name}`),
      };
    }

    const latest = extractTerms(message);
    const latestSet = new Set(latest);
    // Earlier turns carry the moment; the latest turn refines it. "Table for 2
    // around 7 PM?" has no catalogue words of its own and must still mean
    // brunch if brunch is what was asked for first.
    const context = extractTerms(history.join(" ")).filter((term) => !latestSet.has(term));
    const terms = [...latest, ...context].slice(0, VIVENIQ_LIMITS.terms.max);

    const party =
      parsePartySize(message) ??
      [...history]
        .reverse()
        .reduce<number | null>((found, turn) => found ?? parsePartySize(turn), null);
    const askedTime = mentionsTime(message);
    const wantsMore = MORE_WORDS.test(normalise(message));

    const preferences = request.preferences ?? null;
    // The latest turn names the mood; an earlier one carries it through a
    // refinement such as "table for 2".
    const mood = detectMood(normalised) ?? detectMood(normalise(history.join(" ")));
    // An occasion ("date night", "birthday", "chill evening") is answered with
    // whole journeys as well as venues. Carried through refinements the same way.
    const occasion = detectOccasion(normalised) ?? detectOccasion(normalise(history.join(" ")));

    const categories = await this.#discovery.categories();
    const category = findNamedCategory(terms, categories);

    const candidates = new Map<string, Candidate>();
    const consider = (
      items: readonly ExperienceSummary[],
      apply: (candidate: Candidate) => void,
    ): void => {
      items.forEach((experience, index) => {
        const candidate = candidates.get(experience.id) ?? {
          experience,
          score: 0,
          rank: index,
          matched: new Set<string>(),
          inCategory: false,
        };
        candidate.rank = Math.min(candidate.rank, index);
        apply(candidate);
        candidates.set(experience.id, candidate);
      });
    };

    const searches = await Promise.all(
      terms.map((term) => this.#discovery.browse(parseFilters({ search: term }))),
    );
    searches.forEach((page, index) => {
      const term = terms[index]!;
      const weight = latestSet.has(term) ? 2 : 1;
      consider(page.items, (candidate) => {
        candidate.score += weight;
        candidate.matched.add(term);
      });
    });

    if (category) {
      const page = await this.#discovery.browse(parseFilters({ category: category.key }));
      consider(page.items, (candidate) => {
        candidate.score += 2;
        candidate.inCategory = true;
      });
    }

    // An experiential mood ("beer", "weekend plan") deserves contrasting
    // tracks, and keyword hits alone rarely span them: "beer" never finds the
    // bidding bar. One sweep of the published catalogue — a single page, not
    // another trigram scan — supplies curated listings that answer the mood in
    // their own words. Skipped when the keyword hits carry no curation at all,
    // since tracks could not be formed from them anyway.
    const anyCurated = [...candidates.values()].some((candidate) => candidate.experience.curation);
    if (mood && (candidates.size === 0 || anyCurated)) {
      const page = await this.#discovery.browse(parseFilters({}));
      consider(
        page.items.filter(
          (experience) =>
            experience.curation &&
            mood.answers.test(`${experience.title} ${experience.summary ?? ""}`),
        ),
        () => {},
      );
    }

    const fitting = [...candidates.values()].filter(
      (candidate) => party === null || seats(candidate.experience, party),
    );

    // A request for something different hides what was already shown; any
    // other follow-up may repeat a pick if it is still the best fit.
    const available = fitting.filter(
      (candidate) => !(wantsMore && seen.has(candidate.experience.slug)),
    );

    // One pick per contrasting mood track, when the mood and the candidates
    // allow it; otherwise the ordinary ranking, with taste as a tie-breaker.
    const tracks = mood
      ? selectTrackPicks({
          candidates: available,
          mood,
          taste: preferences,
          seen,
          limit: VIVENIQ_LIMITS.picks.max,
        })
      : null;

    const ordered =
      tracks?.picks ??
      [...available]
        .sort((a, b) => {
          const unseen = Number(seen.has(a.experience.slug)) - Number(seen.has(b.experience.slug));
          const taste =
            tasteAffinity(b.experience, preferences) - tasteAffinity(a.experience, preferences);
          return b.score - a.score || taste || unseen || a.rank - b.rank;
        })
        .slice(0, VIVENIQ_LIMITS.picks.max);

    const journeys = await this.#journeysFor({
      occasion,
      preferences,
      seen,
      wantsMore,
      party,
      known: [...candidates.values()].map((candidate) => candidate.experience),
    });
    const lead = journeys.length > 0 && occasion ? composeJourneyLead(occasion, journeys) : null;

    const picks = ordered.map((candidate) => {
      const reasons: string[] = [];
      if (candidate.matched.size > 0) reasons.push(`Matches ${quote([...candidate.matched])}`);
      if (candidate.inCategory && category) reasons.push(`In ${category.name}`);
      if (reasons.length === 0 && mood) reasons.push(mood.reason);
      if (party !== null) reasons.push(`Hosts a party of ${party}`);
      return toPick(candidate.experience, reasons.join(" · "));
    });

    // When journeys lead, the single venues get one line, not a second essay:
    // the cards carry their detail, and the reply stays readable.
    if (picks.length > 0 && lead) {
      return {
        reply: [
          lead,
          SINGLE_STOP_NOTE,
          party !== null ? `Every journey and venue here hosts a party of ${party}.` : null,
          askedTime ? TIME_NOTE : null,
        ]
          .filter(Boolean)
          .join(" "),
        picks,
        followUps: followUpsFor({ picks, party, categories, category }),
        journeys,
      };
    }

    if (picks.length > 0) {
      const phrased = await this.#phrase({
        message,
        history,
        picks,
        party,
        preferences,
        tracked: tracks !== null,
      });
      // The time note stays deterministic: a model must never be the one to
      // speak about slots.
      const reply = phrased
        ? [phrased, askedTime ? TIME_NOTE : null].filter(Boolean).join(" ")
        : tracks && mood
          ? composeTrackReply({ mood, picks, party, askedTime, tasteNote: tracks.tasteNote })
          : composeReply({ picks, party, askedTime, wantsMore });
      return {
        reply,
        picks,
        followUps: followUpsFor({ picks, party, categories, category }),
      };
    }

    // Nothing fits. Say so plainly, then offer what is genuinely being booked
    // rather than an empty bubble — labelled as highlights, not as matches.
    const featured = (await this.#discovery.featured(VIVENIQ_LIMITS.picks.max))
      .filter((experience) => !seen.has(experience.slug))
      .filter((experience) => party === null || seats(experience, party))
      .map((experience) => toPick(experience, "A current highlight from our hosts"));

    if (lead) {
      return {
        reply: [lead, askedTime ? TIME_NOTE : null].filter(Boolean).join(" "),
        picks: featured,
        followUps: categories.slice(0, 3).map((entry) => `Something in ${entry.name}`),
        journeys,
      };
    }

    const asked = terms.length > 0 ? `for ${quote(latest.length > 0 ? latest : terms)} ` : "";
    const partyNote = party !== null ? ` that hosts a party of ${party}` : "";

    return {
      reply:
        featured.length > 0
          ? `I couldn’t find anything in the collection ${asked}${partyNote} just yet. Rather than guess, here are experiences our hosts are proud of right now — or describe the moment another way and I’ll look again.`
          : `I couldn’t find anything in the collection ${asked}${partyNote} just yet. Our hosts are still adding experiences — try describing the moment another way.`,
      picks: featured,
      followUps: categories.slice(0, 3).map((entry) => `Something in ${entry.name}`),
    };
  }

  /**
   * Curated journeys for an occasion, as the chat renders them. Empty when no
   * occasion was described, no collection is wired, or none seats the party.
   *
   * Act covers are read off listings discovery returned — this turn's
   * candidates, then one page of the published catalogue — never invented.
   */
  async #journeysFor(input: {
    readonly occasion: ReturnType<typeof detectOccasion>;
    readonly preferences: TravelPreferences | null;
    readonly seen: ReadonlySet<string>;
    readonly wantsMore: boolean;
    readonly party: number | null;
    readonly known: readonly ExperienceSummary[];
  }): Promise<VivenIQJourney[]> {
    if (!input.occasion || !this.#journeys) return [];

    const selected = selectJourneys({
      journeys: this.#journeys(),
      occasion: input.occasion,
      taste: input.preferences,
      seen: input.seen,
      wantsMore: input.wantsMore,
      limit: VIVENIQ_LIMITS.journeys.max,
    });
    if (selected.length === 0) return [];

    const bySlug = new Map(input.known.map((experience) => [experience.slug, experience]));
    const needed = selected.flatMap((journey) => journey.chapters.map((c) => c.experienceSlug));
    if (needed.some((slug) => !bySlug.has(slug))) {
      const page = await this.#discovery.browse(parseFilters({}));
      for (const experience of page.items) bySlug.set(experience.slug, experience);
    }

    // A journey whose act cannot seat the party is not offered for it.
    const fits = selected.filter(
      (journey) =>
        input.party === null ||
        journey.chapters.every((chapter) => {
          const listing = bySlug.get(chapter.experienceSlug);
          return !listing || seats(listing, input.party!);
        }),
    );

    const covers = new Map<string, { url: string; alt: string }>();
    for (const [slug, experience] of bySlug) {
      if (experience.coverUrl)
        covers.set(slug, { url: experience.coverUrl, alt: experience.coverAlt ?? "" });
    }
    return fits.map((journey) => toVivenIQJourney(journey, covers));
  }

  /**
   * A model-written reply around the chosen picks, or null for the
   * deterministic one. Never throws: no model failure reaches the traveller.
   */
  async #phrase(input: {
    readonly message: string;
    readonly history: readonly string[];
    readonly picks: readonly VivenIQPick[];
    readonly party: number | null;
    readonly preferences: TravelPreferences | null;
    readonly tracked: boolean;
  }): Promise<string | null> {
    const llm = this.#llm;
    if (!llm) return null;

    const prompt = JSON.stringify({
      traveller: {
        message: input.message,
        earlierMessages: input.history,
        partySize: input.party,
        tasteProfile:
          input.preferences && input.preferences.vibes.length > 0
            ? VIBE_OPTIONS.filter((option) => input.preferences!.vibes.includes(option.value)).map(
                (option) => option.label,
              )
            : null,
      },
      presentAsCuratedTracks: input.tracked,
      experiences: input.picks.map((pick) => ({
        title: pick.title,
        slug: pick.slug,
        place: pick.place,
        category: pick.categoryName,
        price: pick.priceLabel,
        duration: pick.durationLabel,
        matchReasons: pick.reason,
        ...(pick.curation
          ? {
              curationTrack: pick.curation.trackLabel,
              vipPerks: pick.curation.vipPerks,
              curatorSecret: pick.curation.curatorSecret,
              curatedPairing: pick.curation.curatedPairing,
            }
          : {}),
      })),
    });

    // The adapter has its own abort; this guard holds the budget even for an
    // implementation that ignores `timeoutMs`.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        llm.generateStructured<unknown>({
          system: VIVENIQ_SYSTEM_PROMPT,
          prompt,
          schemaName: "viveniq_reply",
          options: {
            maxOutputTokens: VIVENIQ_LLM.maxOutputTokens,
            timeoutMs: VIVENIQ_LLM.timeoutMs,
          },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("viveniq reply timed out")),
            VIVENIQ_LLM.timeoutMs,
          );
        }),
      ]);

      const accepted = acceptReply(raw);
      if (!accepted) this.#reportFailure("model output rejected: invalid shape or factual claim");
      return accepted;
    } catch (caught) {
      this.#reportFailure(caught instanceof Error ? caught.message : "unknown error");
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #reportFailure(reason: string): void {
    try {
      this.#onLlmFailure?.(reason);
    } catch {
      // Observability must never break a reply.
    }
  }
}

/* ------------------------------------------------------------------- words */

/** "Toit Brewery" from "Toit Brewery: Craft Beer Tasting Flight & …". */
export function shortTitle(title: string): string {
  const head = title.split(/[:—]/)[0]!.trim();
  return head.length > 0 ? head : title;
}

function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const COUNT_WORDS = ["One", "Two", "Three", "Four", "Five"] as const;

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}

function partyNote(picks: readonly VivenIQPick[], party: number | null): string | null {
  if (party === null) return null;
  return picks.length === 1
    ? `It hosts a party of ${party}.`
    : `Each one hosts a party of ${party}.`;
}

/**
 * The deterministic reply to a specific request. Editorial rather than
 * indexical: lead with the place, add the curator's own note where one exists,
 * and let the alternatives wait quietly instead of counting them.
 */
function composeReply(input: {
  readonly picks: readonly VivenIQPick[];
  readonly party: number | null;
  readonly askedTime: boolean;
  readonly wantsMore: boolean;
}): string {
  const [first, ...rest] = input.picks;
  const sentences: string[] = [];

  sentences.push(
    input.wantsMore
      ? `A change of scene, then: ${first!.title}, in ${first!.place}.`
      : `${first!.title}, in ${first!.place}, is where I’d begin.`,
  );

  if (first!.curation) {
    sentences.push(`A note from our curators: ${asSentence(first!.curation.curatorSecret)}`);
  }

  if (rest.length > 0) {
    const names = rest.map((pick) => shortTitle(pick.title));
    sentences.push(
      `Should the evening call for a different tempo, ${joinNames(names)} ${names.length === 1 ? "is" : "are"} waiting.`,
    );
  }

  const party = partyNote(input.picks, input.party);
  if (party) sentences.push(party);

  if (input.askedTime) sentences.push(TIME_NOTE);

  return sentences.join(" ");
}

/**
 * The deterministic reply to an experiential mood: one line per contrasting
 * track, then the value of booking through La Vivenzia. Every perk and minute
 * is read off the listing's curation record; nothing here is generated.
 */
function composeTrackReply(input: {
  readonly mood: MoodIntent;
  readonly picks: readonly VivenIQPick[];
  readonly party: number | null;
  readonly askedTime: boolean;
  readonly tasteNote: string | null;
}): string {
  const count = input.picks.filter((pick) => pick.curation).length;
  const sentences: string[] = [input.mood.opening(COUNT_WORDS[count - 1] ?? String(count))];
  if (input.tasteNote) sentences.push(input.tasteNote);

  for (const pick of input.picks) {
    const curation = pick.curation;
    if (!curation) continue;
    // The flourish follows an em dash, so one inside a perk becomes a comma.
    const flourish = (curation.curatedPairing ?? curation.vipPerks[0])?.replace(/\s+—\s+/g, ", ");
    sentences.push(
      asSentence(
        `${curation.trackLabel}: ${shortTitle(pick.title)}${flourish ? ` — ${flourish}` : ""}`,
      ),
    );
  }

  const minutes = Math.max(0, ...input.picks.map((pick) => pick.curation?.timeSavedMinutes ?? 0));
  sentences.push(
    minutes > 0
      ? `Each comes with perks you won’t get at the door, and saves up to ${minutes} minutes of research and queueing — pay once at booking, then simply show up.`
      : "Each comes with perks you won’t get at the door — pay once at booking, then simply show up.",
  );

  const party = partyNote(input.picks, input.party);
  if (party) sentences.push(party);

  if (input.askedTime) sentences.push(TIME_NOTE);

  return sentences.join(" ");
}

function followUpsFor(input: {
  readonly picks: readonly VivenIQPick[];
  readonly party: number | null;
  readonly categories: readonly CategorySummary[];
  readonly category: CategorySummary | null;
}): string[] {
  const chips: string[] = [];

  if (input.party === null) chips.push("Table for 2");

  const otherCategory = input.categories.find(
    (entry) =>
      entry.key !== input.category?.key &&
      !input.picks.some((pick) => pick.categoryName === entry.name),
  );
  if (otherCategory) chips.push(`Something in ${otherCategory.name}`);

  chips.push("Show me something different");

  return chips.slice(0, 3);
}
