import {
  CURATION_TRACK_LABELS,
  CURATION_TRACKS,
  type CurationTrack,
} from "@/modules/discovery/curation";
import type { ExperienceSummary } from "@/modules/discovery/ports";
import {
  CLUSTER_OPTIONS,
  VIBE_OPTIONS,
  type ClusterKey,
  type TravelPreferences,
  type VibeKey,
} from "@/modules/user-profile/profile";

/**
 * Curated mood tracks — VivenIQ's answer to "mujhe beer pini hai".
 *
 * A directory answers an experiential question with the three nearest matches,
 * which are usually three versions of the same evening. A curator answers it
 * with three *different* evenings — a brewmaster's table, a fountain-side
 * sundowner, a high-energy bar — and lets the traveller choose by mood.
 *
 * Everything here is deterministic. A track comes from the listing's own
 * curation record; this module only decides which mood the traveller is in,
 * which tracks answer it, and in what order given their taste profile.
 */

/* ------------------------------------------------------------------ moods */

export type MoodKey = "drinks" | "nightlife" | "dining" | "unwind" | "plan";

export interface MoodIntent {
  readonly key: MoodKey;
  /** Whether the traveller's words ask for this mood. Tested on normalised text. */
  readonly asks: RegExp;
  /** Whether a listing answers it, read off its title and summary. */
  readonly answers: RegExp;
  /** Tracks that answer the mood, most fitting first. */
  readonly tracks: readonly CurationTrack[];
  /** The reply's opening line, given the number of tracks actually offered. */
  readonly opening: (count: string) => string;
  /** Why a listing found only through this mood was picked. */
  readonly reason: string;
}

/**
 * Checked in order; the first match wins. Drinks precede dining so "beer and
 * pizza" is a pour with food rather than a dinner with a drink.
 */
export const MOOD_INTENTS: readonly MoodIntent[] = [
  {
    key: "drinks",
    asks: /\b(beers?|brew(s|ery|eries|house|pub)?|pints?|ales?|lagers?|craft|drinks?|drinking|daaru|daru|sharab|cocktails?|pubs?|bars?|taproom|pini|peeni|peena|pina)\b/,
    answers:
      // "Brews", "brewery", "brewhouse" — but not "manual brew", which is coffee.
      /\b(beers?|brews|brew(ery|eries|house|pub|master)|pints?|ales?|lagers?|draught|taps?|drinks?|cocktails?|bars?|pubs?)\b/i,
    tracks: ["CONNOISSEUR", "ALFRESCO_SUNDOWNER", "HIGH_OCTANE_NIGHTLIFE"],
    opening: (n) => `${n} ways to take that pour — each with its own crowd, cadence and view.`,
    reason: "Curated for a craft pour",
  },
  {
    key: "nightlife",
    asks: /\b(nightlife|party|partying|club|clubbing|dance|dancing|dj|celebrat\w*|birthday|bachelor\w*|night out)\b/,
    answers:
      /\b(nightlife|dj|dance|bars?|cocktails?|bowling|arcade|laser|escape|rooftop|celebrat\w*)\b/i,
    tracks: ["HIGH_OCTANE_NIGHTLIFE", "ALFRESCO_SUNDOWNER", "CONNOISSEUR"],
    opening: (n) => `${n} ways to own the night, from a slow-burn start to a full sprint.`,
    reason: "Curated for a night out",
  },
  {
    key: "dining",
    asks: /\b(dinner|dine|dining|date|romantic|anniversary|lunch|brunch|food|eat|eating|khana|feast|cuisine)\b/,
    answers:
      // A meal, not a "tasting" flight or bar "bites" — those answer drinks.
      /\b(dining|dinner|brunch|feast|tasting menu|cuisine|sourdough|dim sums?|sushi|grill\w*|barbecues?|ramen|pizzas?)\b/i,
    tracks: ["CONNOISSEUR", "ALFRESCO_SUNDOWNER", "ARTISANAL_FOCUS"],
    opening: (n) => `${n} tables, ${n.toLowerCase()} moods — choose by the company you’re keeping.`,
    reason: "Curated for the table",
  },
  {
    key: "unwind",
    asks: /\b(unwind|relax\w*|chill|calm|quiet|spa|stress\w*|peace\w*|slow|recharge|breathe|sukoon)\b/,
    answers:
      /\b(spa|aromatherapy|reflexology|healing|mindful\w*|stroll|walk|quiet|coffee|pottery|garden|poolside|retreat)\b/i,
    tracks: ["MINDFUL_WELLNESS", "ARTISANAL_FOCUS", "ALFRESCO_SUNDOWNER"],
    opening: (n) => `${n} ways to let the city fall quiet.`,
    reason: "Curated for unwinding",
  },
  {
    key: "plan",
    asks: /\b(weekend|plan|plans|outing|day out|things to do|bored|kuch karna|ghoomna|ghumna)\b/,
    answers: /[\s\S]/,
    tracks: [
      "CONNOISSEUR",
      "ALFRESCO_SUNDOWNER",
      "HIGH_OCTANE_NIGHTLIFE",
      "MINDFUL_WELLNESS",
      "ARTISANAL_FOCUS",
    ],
    opening: (n) => `${n} ways to shape the weekend, each with its own rhythm.`,
    reason: "Curated for the weekend",
  },
];

/** The mood a message asks for, or null when it describes something specific. */
export function detectMood(normalisedText: string): MoodIntent | null {
  return MOOD_INTENTS.find((mood) => mood.asks.test(normalisedText)) ?? null;
}

/* ------------------------------------------------------------------ taste */

/** Which tracks each stated vibe leans toward. */
const VIBE_TRACKS: Readonly<Record<VibeKey, readonly CurationTrack[]>> = {
  craft_breweries: ["CONNOISSEUR", "ALFRESCO_SUNDOWNER"],
  culinary_tastings: ["CONNOISSEUR", "ARTISANAL_FOCUS"],
  sunset_retreats: ["ALFRESCO_SUNDOWNER", "MINDFUL_WELLNESS"],
  adventure: ["HIGH_OCTANE_NIGHTLIFE"],
};

/** How a preferred neighbourhood shows up in a listing's own words. */
const CLUSTER_PATTERNS: Readonly<Record<ClusterKey, RegExp>> = {
  kalyani_nagar: /kalyani/i,
  viman_nagar: /viman/i,
  hadapsar: /hadapsar|magarpatta|seasons mall/i,
  amanora: /amanora/i,
};

function hasTaste(taste: TravelPreferences | null | undefined): taste is TravelPreferences {
  return !!taste && (taste.vibes.length > 0 || taste.clusters.length > 0);
}

/** Tracks a taste profile favours, in no particular order. */
export function favouredTracks(taste: TravelPreferences | null | undefined): Set<CurationTrack> {
  return new Set((taste?.vibes ?? []).flatMap((vibe) => VIBE_TRACKS[vibe]));
}

/**
 * Whether a profile with stated vibes left high-energy rooms out. A traveller
 * who chose sunset retreats but not adventure is telling us something.
 */
function prefersCalm(taste: TravelPreferences | null | undefined): boolean {
  return !!taste && taste.vibes.length > 0 && !taste.vibes.includes("adventure");
}

function listingText(experience: ExperienceSummary): string {
  return `${experience.title} ${experience.summary ?? ""}`;
}

function inPreferredCluster(
  experience: ExperienceSummary,
  taste: TravelPreferences | null | undefined,
): ClusterKey | null {
  const text = listingText(experience);
  return taste?.clusters.find((cluster) => CLUSTER_PATTERNS[cluster].test(text)) ?? null;
}

/**
 * A small, bounded nudge from the taste profile. Never large enough to lift an
 * unrelated listing over one the traveller actually asked for — it orders
 * between comparable matches.
 */
export function tasteAffinity(
  experience: ExperienceSummary,
  taste: TravelPreferences | null | undefined,
): number {
  if (!hasTaste(taste)) return 0;

  let affinity = 0;
  const track = experience.curation?.curationTrack;
  if (track && favouredTracks(taste).has(track)) affinity += 1;
  if (track === "HIGH_OCTANE_NIGHTLIFE" && prefersCalm(taste)) affinity -= 1;
  if (inPreferredCluster(experience, taste)) affinity += 0.5;
  return affinity;
}

/** The mood's tracks, re-ordered by taste. Stable for equal affinity. */
export function trackOrder(
  mood: MoodIntent,
  taste: TravelPreferences | null | undefined,
): CurationTrack[] {
  const favoured = favouredTracks(taste);
  const calm = prefersCalm(taste);
  const weight = (track: CurationTrack) =>
    (favoured.has(track) ? 1 : 0) - (calm && track === "HIGH_OCTANE_NIGHTLIFE" ? 2 : 0);

  return [...mood.tracks].sort((a, b) => weight(b) - weight(a));
}

/* -------------------------------------------------------------- selection */

export interface TrackCandidate {
  readonly experience: ExperienceSummary;
  readonly score: number;
  readonly rank: number;
  readonly matched: ReadonlySet<string>;
}

export interface TrackSelection<T extends TrackCandidate> {
  readonly picks: readonly T[];
  /** A sentence acknowledging the taste profile, or null when none applied. */
  readonly tasteNote: string | null;
}

/**
 * One pick per contrasting track, or null when the candidates cannot offer at
 * least two different moods — in which case the ordinary ranking is the more
 * honest answer than a "choice" between near-identical options.
 */
export function selectTrackPicks<T extends TrackCandidate>(input: {
  readonly candidates: readonly T[];
  readonly mood: MoodIntent;
  readonly taste?: TravelPreferences | null | undefined;
  readonly seen: ReadonlySet<string>;
  readonly limit: number;
}): TrackSelection<T> | null {
  const { mood, taste, seen } = input;

  const relevant = input.candidates.filter(
    (candidate) =>
      candidate.experience.curation &&
      (candidate.matched.size > 0 || mood.answers.test(listingText(candidate.experience))),
  );

  const strength = (candidate: T) =>
    candidate.score +
    (mood.answers.test(listingText(candidate.experience)) ? 2 : 0) +
    tasteAffinity(candidate.experience, taste);

  const ranked = [...relevant].sort((a, b) => {
    const unseen = Number(seen.has(a.experience.slug)) - Number(seen.has(b.experience.slug));
    return strength(b) - strength(a) || unseen || a.rank - b.rank;
  });

  const trackOf = (candidate: T) => candidate.experience.curation!.curationTrack;
  const picks: T[] = [];
  const taken = new Set<CurationTrack>();
  const categories = new Set<string | null>();

  // Within a track the strongest candidate wins; between equals, one from a
  // category not yet shown — so "weekend plan" is not three bars in a row.
  const take = (track: CurationTrack) => {
    if (picks.length >= input.limit || taken.has(track)) return;
    const inTrack = ranked.filter((candidate) => trackOf(candidate) === track);
    const top = inTrack[0];
    if (!top) return;
    const best =
      inTrack.find(
        (candidate) =>
          strength(candidate) === strength(top) &&
          !categories.has(candidate.experience.categoryKey),
      ) ?? top;
    picks.push(best);
    taken.add(track);
    categories.add(best.experience.categoryKey);
  };

  const ordered = trackOrder(mood, taste);
  const calm = prefersCalm(taste);
  ordered.filter((track) => !(calm && track === "HIGH_OCTANE_NIGHTLIFE")).forEach(take);
  CURATION_TRACKS.filter(
    (track) => !ordered.includes(track) && !(calm && track === "HIGH_OCTANE_NIGHTLIFE"),
  ).forEach(take);
  // A calm profile is offered high energy only when there would otherwise be
  // no contrast at all. Two honest tracks beat a third it told us it avoids.
  if (calm && taken.size < 2) take("HIGH_OCTANE_NIGHTLIFE");

  if (taken.size < 2) return null;

  const bypassedHighOctane =
    calm &&
    !taken.has("HIGH_OCTANE_NIGHTLIFE") &&
    ranked.some((candidate) => trackOf(candidate) === "HIGH_OCTANE_NIGHTLIFE");

  return { picks, tasteNote: describeTaste(taste, picks, bypassedHighOctane) };
}

/* ------------------------------------------------------------------ words */

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)!}`;
}

/**
 * Say what the taste profile changed — and only what it changed. A note that
 * claims a preference was honoured when the ranking ignored it is worse than
 * no note at all.
 */
function describeTaste(
  taste: TravelPreferences | null | undefined,
  picks: readonly TrackCandidate[],
  bypassedHighOctane: boolean,
): string | null {
  if (!hasTaste(taste) || picks.length === 0) return null;

  const first = picks[0]!.experience;
  const firstTrack = first.curation?.curationTrack;
  const favoured = favouredTracks(taste);
  const vibes = VIBE_OPTIONS.filter((option) => taste.vibes.includes(option.value)).map((option) =>
    option.label.toLowerCase(),
  );

  const clauses: string[] = [];
  if (firstTrack && favoured.has(firstTrack)) {
    clauses.push(`I’ve led with ${CURATION_TRACK_LABELS[firstTrack]}`);
  }
  if (bypassedHighOctane) clauses.push("set the high-decibel rooms aside");

  const cluster = picks
    .map((pick) => inPreferredCluster(pick.experience, taste))
    .find((key): key is ClusterKey => key !== null);
  if (cluster) {
    const label = CLUSTER_OPTIONS.find((option) => option.value === cluster)!.label;
    clauses.push(`kept you close to ${label}`);
  }

  if (clauses.length === 0) return null;

  const action = joinWords(clauses);
  return vibes.length > 0
    ? `Noticing your penchant for ${joinWords(vibes)}, ${action}.`
    : `${action.charAt(0).toUpperCase()}${action.slice(1)}.`;
}
