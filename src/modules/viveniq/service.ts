import { z } from "zod";

import { formatDuration, formatGuestRange, formatMoneyMinor } from "@/lib/format";
import { parseFilters } from "@/modules/discovery/service";
import type { CategorySummary, ExperienceSummary } from "@/modules/discovery/ports";
import type { DiscoveryService } from "@/modules/discovery/service";
import { VIVENIQ_LIMITS, type VivenIQPick, type VivenIQReply } from "@/modules/viveniq/options";
import type { LlmPort } from "@/ports/llm";

export {
  VIVENIQ_LIMITS,
  VIVENIQ_STARTERS,
  type VivenIQPick,
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
  /** Optional. Absent means every reply is deterministic. */
  readonly llm?: LlmPort | undefined;
  /** Observability hook for a failed or rejected model reply. Never throws. */
  readonly onLlmFailure?: ((reason: string) => void) | undefined;
}

export const VIVENIQ_LLM = {
  /** Search-path budget: the traveller is watching the bubble. */
  timeoutMs: 1_500,
  maxOutputTokens: 300,
  replyMaxLength: 600,
} as const;

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
  "You are VivenIQ, the sovereign private travel intelligence and bespoke concierge of La Vivenzia.",
  "You speak in an evocative, polished luxury editorial tone (warm, cultured, unhurried, concise).",
  "RULE 1 - IDENTITY: You are VivenIQ, never an AI language model, never Gemini, never Google. If asked who or what you are, state: 'I am VivenIQ, your private concierge at La Vivenzia.'",
  "RULE 2 - STRICT DOMAIN: You exclusively assist with experiential journeys, dining, tastings, wellness, and curated escapes at La Vivenzia. If the user asks for code, programming, homework, technical tasks, or unrelated trivia, politely deflect back to La Vivenzia: 'I exist exclusively to choreograph your journeys and private escapes at La Vivenzia. Shall I curate an evening of craft tastings or a serene poolside retreat for you instead?'",
  "RULE 3 - ZERO HALLUCINATIONS: Speak only about the verified candidate experiences provided in this prompt. Never invent venues, prices, or slots.",
  "RULE 4 - CONCISE OUTPUT: Keep your response to 2-3 engaging sentences directly addressing the traveller's craving, followed by introducing the handpicked selections.",
  "Never state prices, currency, numbers, times or availability: the experience cards show the verified values beside your words.",
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
  readonly #llm: LlmPort | undefined;
  readonly #onLlmFailure: VivenIQServiceDeps["onLlmFailure"];

  constructor(deps: VivenIQServiceDeps) {
    this.#discovery = deps.discovery;
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

    const fitting = [...candidates.values()].filter(
      (candidate) => party === null || seats(candidate.experience, party),
    );

    // A request for something different hides what was already shown; any
    // other follow-up may repeat a pick if it is still the best fit.
    const ordered = fitting
      .filter((candidate) => !(wantsMore && seen.has(candidate.experience.slug)))
      .sort((a, b) => {
        const unseen = Number(seen.has(a.experience.slug)) - Number(seen.has(b.experience.slug));
        return b.score - a.score || unseen || a.rank - b.rank;
      })
      .slice(0, VIVENIQ_LIMITS.picks.max);

    const picks = ordered.map((candidate) => {
      const reasons: string[] = [];
      if (candidate.matched.size > 0) reasons.push(`Matches ${quote([...candidate.matched])}`);
      if (candidate.inCategory && category) reasons.push(`In ${category.name}`);
      if (party !== null) reasons.push(`Hosts a party of ${party}`);
      return toPick(candidate.experience, reasons.join(" · "));
    });

    if (picks.length > 0) {
      const phrased = await this.#phrase({ message, history, picks, party });
      // The time note stays deterministic: a model must never be the one to
      // speak about slots.
      const reply = phrased
        ? [phrased, askedTime ? TIME_NOTE : null].filter(Boolean).join(" ")
        : composeReply({ message, picks, party, askedTime, wantsMore });
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
   * A model-written reply around the chosen picks, or null for the
   * deterministic one. Never throws: no model failure reaches the traveller.
   */
  async #phrase(input: {
    readonly message: string;
    readonly history: readonly string[];
    readonly picks: readonly VivenIQPick[];
    readonly party: number | null;
  }): Promise<string | null> {
    const llm = this.#llm;
    if (!llm) return null;

    const prompt = JSON.stringify({
      traveller: {
        message: input.message,
        earlierMessages: input.history,
        partySize: input.party,
      },
      experiences: input.picks.map((pick) => ({
        title: pick.title,
        slug: pick.slug,
        place: pick.place,
        category: pick.categoryName,
        price: pick.priceLabel,
        duration: pick.durationLabel,
        matchReasons: pick.reason,
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

function composeReply(input: {
  readonly message: string;
  readonly picks: readonly VivenIQPick[];
  readonly party: number | null;
  readonly askedTime: boolean;
  readonly wantsMore: boolean;
}): string {
  const [first, ...rest] = input.picks;
  const sentences: string[] = [];

  sentences.push(
    input.wantsMore
      ? `Of course — something different. I’d look at ${first!.title} in ${first!.place}.`
      : `For this, I’d begin with ${first!.title} in ${first!.place}.`,
  );

  if (rest.length > 0) {
    sentences.push(
      rest.length === 1
        ? `I’ve set aside one alternative, should the mood shift.`
        : `I’ve set aside ${rest.length} alternatives, should the mood shift.`,
    );
  }

  if (input.party !== null) {
    sentences.push(
      input.picks.length === 1
        ? `It hosts a party of ${input.party}.`
        : `Each one hosts a party of ${input.party}.`,
    );
  }

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
