import { z } from "zod";
import { formatMoneyMinor, parseMoneyToMinor } from "@/lib/format";
import { formatDistance, type Coordinates } from "@/modules/discovery/geo";
import { normalisePaging } from "@/modules/shared/pagination";
import type { DiscoveryService } from "@/modules/discovery/service";
import type { ExperienceDetail, ExperienceSummary } from "@/modules/discovery/ports";
import type { LlmPort } from "@/ports/llm";
import {
  isCopilotMood,
  type CopilotMood,
  type CopilotRequest,
  type CopilotResponse,
  type CopilotSuggestion,
} from "@/modules/copilot/types";

/**
 * AI Travel Copilot (Pune pilot corridor: Amanora, Seasons Mall, Magarpatta,
 * Hadapsar).
 *
 * Retrieval and ranking are deterministic and run first. Candidates come from
 * the public discovery port — published listings only, filtered by radius and
 * budget in PostgreSQL — and are ranked here by keyword affinity to the mood
 * and query, then by distance.
 *
 * **Grounding (ADR-0007, CLAUDE.md §7).** Title, distance, price, coordinates
 * and image are copied from catalogue rows and never pass through a model. A
 * model, when one is configured, writes only the `whyYouWillLoveIt` sentence,
 * keyed by candidate id; an id outside the candidate set rejects the whole
 * response, and a sentence carrying digits or currency is discarded so it
 * cannot contradict the price or distance beside it. Every path degrades to
 * the deterministic rationale.
 */

export interface CopilotDependencies {
  readonly discovery: DiscoveryService;
  /** Optional. Absent means every rationale is deterministic. */
  readonly llm?: LlmPort | undefined;
  /** Observability hook for a failed or rejected enrichment. Never throws. */
  readonly onEnrichmentFailure?: ((reason: string) => void) | undefined;
}

export const COPILOT_LIMITS = {
  /** Rows retrieved within the radius before ranking. */
  candidatePool: 40,
  suggestions: 5,
  /** Search-path budget: the traveller is waiting on this response. */
  llmTimeoutMs: 4_000,
  llmMaxOutputTokens: 800,
  rationaleMaxLength: 280,
} as const;

/**
 * Words that signal each mood in a listing's title, category or summary.
 *
 * Matched on word boundaries with an optional plural, so "arcade" matches
 * "arcades" but "bar" does not match "barbecue".
 */
export const MOOD_KEYWORDS: Readonly<Record<CopilotMood, readonly string[]>> = {
  gaming: [
    "gaming",
    "game",
    "arcade",
    "vr",
    "virtual reality",
    "bowling",
    "esport",
    "laser tag",
    "escape room",
    "go-kart",
    "karting",
  ],
  nightlife: [
    "nightlife",
    "craft beer",
    "brewery",
    "brewpub",
    "pub",
    "bar",
    "cocktail",
    "lounge",
    "club",
    "live music",
  ],
  cafe: ["cafe", "café", "coffee", "specialty coffee", "bakery", "brunch", "tea", "dessert"],
  dining: [
    "dining",
    "fine dining",
    "gourmet",
    "luxury",
    "restaurant",
    "chef",
    "tasting",
    "cuisine",
    "food",
  ],
  spa: ["spa", "massage", "wellness", "ayurveda", "ayurvedic", "sauna", "therapy", "relax"],
  adventure: [
    "adventure",
    "trek",
    "hike",
    "climbing",
    "kayak",
    "zipline",
    "cycling",
    "paintball",
    "trampoline",
    "rappelling",
  ],
  peaceful: [
    "peaceful",
    "calm",
    "quiet",
    "meditation",
    "yoga",
    "garden",
    "nature",
    "lake",
    "sunset",
    "mindful",
  ],
};

const MOOD_LABELS: Readonly<Record<CopilotMood, string>> = {
  gaming: "gaming",
  nightlife: "night out",
  cafe: "café",
  dining: "dining",
  spa: "spa and wellness",
  adventure: "adventure",
  peaceful: "peaceful",
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "near",
  "nearby",
  "me",
  "some",
  "something",
  "want",
  "looking",
  "place",
  "places",
  "good",
  "best",
  "around",
  "today",
  "tonight",
  "what",
  "where",
  "can",
  "this",
  "that",
]);

const MAX_QUERY_TERMS = 8;

// ── Geography ──────────────────────────────────────────────────────────────

const EARTH_RADIUS_METRES = 6_371_008.8;

/**
 * Great-circle distance in metres.
 *
 * Used only when the database did not supply a distance; PostGIS remains the
 * authority whenever a row came back from a proximity query.
 */
export function haversineMetres(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "350 m away", "1.2 km away". Reuses discovery's precision rules. */
export function formatDistanceText(metres: number): string {
  return `${formatDistance(metres) ?? "0 m"} away`;
}

/** Directions to a stored coordinate. Never built from anything a model wrote. */
export function googleMapsDirectionsUrl(at: Coordinates): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${at.latitude},${at.longitude}`;
}

// ── Input interpretation ───────────────────────────────────────────────────

/**
 * A budget, as typed: "1500", "under ₹1,500", "2k".
 *
 * Read as major units of INR, like the discovery price filter. Anything
 * without a number in it ("cheap", "splurge") is ignored rather than guessed
 * at — guessing would be inventing a price ceiling.
 */
export function parseBudgetMinor(budget: string | undefined): number | undefined {
  if (!budget) return undefined;

  const thousands = /(\d+(?:\.\d+)?)\s*k\b/i.exec(budget);
  if (thousands) return parseMoneyToMinor(String(Number(thousands[1]) * 1000), "INR") ?? undefined;

  const plain = /\d[\d,]*(?:\.\d+)?/.exec(budget);
  if (!plain) return undefined;

  return parseMoneyToMinor(plain[0], "INR") ?? undefined;
}

export interface CopilotKeywords {
  readonly mood: CopilotMood | null;
  readonly moodTerms: readonly string[];
  readonly queryTerms: readonly string[];
}

/**
 * The terms a candidate is ranked against.
 *
 * A known mood contributes its curated vocabulary. An unknown mood is treated
 * as one more free-text term, so "bowling" typed into the mood field still
 * works.
 */
export function keywordsFor(mood: string | undefined, query: string | undefined): CopilotKeywords {
  const known = mood && isCopilotMood(mood) ? mood : null;

  const free = [known ? "" : (mood ?? ""), query ?? ""].join(" ").toLowerCase();
  const queryTerms = [
    ...new Set(
      free.split(/[^\p{L}\p{N}-]+/u).filter((term) => term.length >= 3 && !STOPWORDS.has(term)),
    ),
  ].slice(0, MAX_QUERY_TERMS);

  return { mood: known, moodTerms: known ? MOOD_KEYWORDS[known] : [], queryTerms };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(text: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}(e?s)?([^\\p{L}\\p{N}]|$)`, "iu").test(
    text,
  );
}

export interface ScoredCandidate {
  readonly candidate: ExperienceSummary;
  readonly score: number;
  /** The terms that matched, in the order they were listed. */
  readonly matched: readonly string[];
}

/**
 * Score one listing.
 *
 * Title and category matches outweigh summary matches: a listing called
 * "Retro Arcade Night" is about gaming in a way that one mentioning a nearby
 * arcade in passing is not.
 */
export function scoreCandidate(
  candidate: ExperienceSummary,
  keywords: CopilotKeywords,
): ScoredCandidate {
  const fields = [
    { text: candidate.title, weight: 3 },
    { text: [candidate.categoryName, candidate.categoryKey].filter(Boolean).join(" "), weight: 2 },
    { text: candidate.summary ?? "", weight: 1 },
  ];

  let score = 0;
  const matched: string[] = [];

  for (const term of [...keywords.moodTerms, ...keywords.queryTerms]) {
    const weight = fields.reduce((best, field) => {
      return mentions(field.text, term) ? Math.max(best, field.weight) : best;
    }, 0);

    if (weight > 0) {
      score += weight;
      if (!matched.includes(term)) matched.push(term);
    }
  }

  return { candidate, score, matched };
}

/**
 * Rank candidates: keyword affinity first, then nearest.
 *
 * When the traveller expressed a preference and something matches it, the
 * non-matching listings are dropped — suggesting a brewery to someone who
 * asked for a spa is worse than suggesting fewer things. When nothing matches,
 * the nearest listings are returned instead, and their rationale says only
 * what is true of them.
 */
export function rankCandidates(
  candidates: readonly ExperienceSummary[],
  keywords: CopilotKeywords,
): ScoredCandidate[] {
  const scored = candidates
    .map((candidate) => scoreCandidate(candidate, keywords))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.candidate.distanceMetres ?? Number.POSITIVE_INFINITY) -
          (b.candidate.distanceMetres ?? Number.POSITIVE_INFINITY),
    );

  const anyMatch = scored.some((entry) => entry.score > 0);
  return anyMatch ? scored.filter((entry) => entry.score > 0) : scored;
}

// ── Rationale ──────────────────────────────────────────────────────────────

function firstSentence(text: string | null | undefined, max = 160): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const sentence = /^.*?[.!?](\s|$)/s.exec(trimmed)?.[0].trim() ?? trimmed;
  if (sentence.length <= max) return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;

  return `${sentence.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The rationale written without a model.
 *
 * Assembled only from what the listing itself says and what was matched, so it
 * cannot claim anything the catalogue does not.
 */
export function deterministicRationale(input: {
  readonly entry: ScoredCandidate;
  readonly keywords: CopilotKeywords;
  readonly description?: string | null;
  readonly distanceMetres: number;
}): string {
  const { entry, keywords } = input;
  const parts: string[] = [];

  if (entry.matched.length > 0) {
    const terms = entry.matched.slice(0, 3).join(", ");
    parts.push(
      keywords.mood
        ? `A pick for your ${MOOD_LABELS[keywords.mood]} mood — ${terms}.`
        : `Matches what you asked for — ${terms}.`,
    );
  }

  const hook =
    firstSentence(entry.candidate.summary) ??
    firstSentence(input.description) ??
    (entry.candidate.categoryName
      ? `A ${entry.candidate.categoryName.toLowerCase()} experience hosted by ${entry.candidate.hostName}.`
      : `Hosted by ${entry.candidate.hostName}.`);
  parts.push(hook);

  parts.push(
    input.distanceMetres < 1000
      ? `Just ${formatDistanceText(input.distanceMetres)}.`
      : `${formatDistanceText(input.distanceMetres).replace(/^./, (c) => c.toUpperCase())}.`,
  );

  return parts.join(" ");
}

const LlmRationales = z.object({
  rationales: z
    .array(z.object({ id: z.string(), text: z.string().min(1) }))
    .max(COPILOT_LIMITS.suggestions),
});

/**
 * Anything that reads as a price or a measurement. The UI renders the real
 * values beside the rationale, so prose that restates them can only disagree.
 */
const FACTUAL_CLAIM = /[0-9₹$€£]|\b(rs|inr|rupees?)\b/i;

/**
 * Validate model output against the candidate set.
 *
 * An unknown id rejects the whole response rather than being dropped: it means
 * the model was not reasoning about the rows it was given, and nothing else it
 * said can be trusted either (ADR-0007: "rejected, never repaired"). Individual
 * sentences that state numbers or currency are discarded and fall back.
 */
export function acceptRationales(
  raw: unknown,
  candidateIds: ReadonlySet<string>,
): Map<string, string> | null {
  const parsed = LlmRationales.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.rationales.some((item) => !candidateIds.has(item.id))) return null;

  const accepted = new Map<string, string>();
  for (const item of parsed.data.rationales) {
    const text = item.text.trim().replace(/\s+/g, " ");
    if (text.length === 0 || text.length > COPILOT_LIMITS.rationaleMaxLength) continue;
    if (FACTUAL_CLAIM.test(text)) continue;
    accepted.set(item.id, text);
  }

  return accepted;
}

const SYSTEM_PROMPT = [
  "You write one short sentence per experience explaining why a traveller in Pune would enjoy it.",
  "Use only the facts supplied for each experience. Do not invent amenities, timings, offers or reviews.",
  "Never mention prices, currency, distances, numbers, availability or booking status.",
  "Return every id exactly as given and no other ids.",
  'Respond as JSON: {"rationales":[{"id":"<id>","text":"<sentence>"}]}.',
].join(" ");

// ── Service ────────────────────────────────────────────────────────────────

interface Resolved {
  readonly entry: ScoredCandidate;
  readonly detail: ExperienceDetail;
  readonly coordinates: Coordinates;
  readonly distanceMetres: number;
}

function priceFor(candidate: ExperienceSummary): string {
  const amount = formatMoneyMinor(candidate.basePriceMinor, candidate.currency);
  if (amount === null) return "Price not listed";
  return `${amount} ${candidate.pricingUnit === "PER_PERSON" ? "per person" : "per group"}`;
}

export class CopilotService {
  readonly #deps: CopilotDependencies;

  constructor(deps: CopilotDependencies) {
    this.#deps = deps;
  }

  async suggest(request: CopilotRequest): Promise<CopilotResponse> {
    const origin: Coordinates = { latitude: request.lat, longitude: request.lng };
    const keywords = keywordsFor(request.mood, request.query);
    const maxPriceMinor = parseBudgetMinor(request.budget);

    const page = await this.#deps.discovery.browse({
      ...normalisePaging({ page: 1, pageSize: COPILOT_LIMITS.candidatePool }),
      near: { ...origin, radiusMetres: Math.round(request.radiusKm * 1000) },
      ...(maxPriceMinor !== undefined ? { maxPriceMinor } : {}),
      sort: "distance",
    });

    const ranked = rankCandidates(page.items, keywords).slice(0, COPILOT_LIMITS.suggestions);
    const resolved = await this.#resolve(ranked, origin);

    const enriched = await this.#enrich(resolved, request, keywords);

    const suggestions: CopilotSuggestion[] = resolved.map((item) => {
      const { candidate } = item.entry;
      return {
        id: candidate.id,
        title: candidate.title,
        slug: candidate.slug,
        category: candidate.categoryName ?? "Experience",
        summary: candidate.summary ?? firstSentence(item.detail.description) ?? "",
        distanceMeters: Math.round(item.distanceMetres),
        distanceText: formatDistanceText(item.distanceMetres),
        priceFormatted: priceFor(candidate),
        whyYouWillLoveIt:
          enriched?.get(candidate.id) ??
          deterministicRationale({
            entry: item.entry,
            keywords,
            description: item.detail.description,
            distanceMetres: item.distanceMetres,
          }),
        googleMapsUrl: googleMapsDirectionsUrl(item.coordinates),
        ...(candidate.coverUrl ? { imageUrl: candidate.coverUrl } : {}),
      };
    });

    return {
      queryEcho: {
        lat: request.lat,
        lng: request.lng,
        radiusKm: request.radiusKm,
        ...(request.mood ? { mood: request.mood } : {}),
      },
      suggestions,
      count: suggestions.length,
      fallback: suggestions.some((suggestion) => !enriched?.has(suggestion.id)),
    };
  }

  /**
   * Load stored coordinates for the shortlisted rows.
   *
   * The summary shape carries no coordinates, and a directions link must point
   * at the listing's real location. A listing without coordinates, or one
   * unpublished between the two reads, is dropped rather than given a guessed
   * destination.
   */
  async #resolve(ranked: readonly ScoredCandidate[], origin: Coordinates): Promise<Resolved[]> {
    const details = await Promise.allSettled(
      ranked.map((entry) => this.#deps.discovery.getExperience(entry.candidate.slug)),
    );

    const resolved: Resolved[] = [];
    details.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const { latitude, longitude } = result.value;
      if (latitude === null || longitude === null) return;

      const entry = ranked[index]!;
      const coordinates = { latitude, longitude };
      resolved.push({
        entry,
        detail: result.value,
        coordinates,
        distanceMetres: entry.candidate.distanceMetres ?? haversineMetres(origin, coordinates),
      });
    });

    return resolved;
  }

  /** Model-written rationale by id, or null when the deterministic path applies. */
  async #enrich(
    resolved: readonly Resolved[],
    request: CopilotRequest,
    keywords: CopilotKeywords,
  ): Promise<Map<string, string> | null> {
    const llm = this.#deps.llm;
    if (!llm || resolved.length === 0) return null;

    const facts = resolved.map(({ entry, detail }) => ({
      id: entry.candidate.id,
      title: entry.candidate.title,
      category: entry.candidate.categoryName,
      summary: entry.candidate.summary,
      description: firstSentence(detail.description, 400),
      matched: entry.matched,
    }));

    const prompt = JSON.stringify({
      traveller: {
        mood: keywords.mood ?? request.mood ?? null,
        request: request.query ?? null,
      },
      experiences: facts,
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        llm.generateStructured<unknown>({
          system: SYSTEM_PROMPT,
          prompt,
          schemaName: "copilot_rationales",
          options: {
            maxOutputTokens: COPILOT_LIMITS.llmMaxOutputTokens,
            timeoutMs: COPILOT_LIMITS.llmTimeoutMs,
          },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("copilot enrichment timed out")),
            COPILOT_LIMITS.llmTimeoutMs,
          );
        }),
      ]);

      const accepted = acceptRationales(raw, new Set(facts.map((fact) => fact.id)));
      if (!accepted) this.#reportFailure("model output rejected: invalid shape or unknown id");
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
      this.#deps.onEnrichmentFailure?.(reason);
    } catch {
      // Observability must never break a response.
    }
  }
}
