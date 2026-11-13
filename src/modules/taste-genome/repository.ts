import { CURATION_TRACKS, type CurationTrack } from "@/modules/discovery/curation";
import { DEFAULT_HUB, type TasteGenome, type TelemetryEvent } from "./types";

/**
 * In-memory Taste Genome store and the telemetry re-weighting algorithm.
 *
 * Deliberately not PostgreSQL yet: a genome is a cheap, reconstructible
 * personalisation hint, not a record anyone relies on, so losing it on a
 * restart costs one recalibration. The cap bounds memory against an
 * unauthenticated write path — a script minting guest ids evicts the oldest
 * sessions rather than growing the process.
 */

export const MAX_ACTIVE_SESSIONS = 1000;

/** Weight added to a track before re-normalising, per signal. */
export const LEARNING_RATES = {
  card_click: 0.15,
  card_dwell: 0.08,
  search_query: 0.1,
  category_filter: 0.1,
} as const;

/** A dwell shorter than this is a scroll past, not interest. */
export const DWELL_THRESHOLD_SECONDS = 5;

/**
 * Free-text cues for a search that arrives without a track.
 *
 * Deterministic and editorial, matching the rule that curation is written by
 * people: a query only moves the genome when it plainly names a mood.
 */
const QUERY_CUES: Readonly<Record<CurationTrack, readonly string[]>> = {
  CONNOISSEUR: ["wine", "tasting", "chef", "fine dining", "omakase", "sommelier", "degustation"],
  ALFRESCO_SUNDOWNER: ["rooftop", "sunset", "sundowner", "terrace", "alfresco", "open air", "lake"],
  HIGH_OCTANE_NIGHTLIFE: [
    "club",
    "nightlife",
    "party",
    "dj",
    "bar",
    "pub",
    "karaoke",
    "late night",
  ],
  MINDFUL_WELLNESS: ["spa", "yoga", "wellness", "meditation", "massage", "retreat", "sound bath"],
  ARTISANAL_FOCUS: ["craft", "workshop", "pottery", "artisan", "brew", "roastery", "studio"],
};

/** Map iteration order is insertion order, so the first key is the least recent. */
const store = new Map<string, TasteGenome>();

export function uniformWeights(): Record<CurationTrack, number> {
  const weight = 1 / CURATION_TRACKS.length;
  return Object.fromEntries(CURATION_TRACKS.map((track) => [track, weight])) as Record<
    CurationTrack,
    number
  >;
}

/** Scale to sum 1; a degenerate vector (all zero, or non-finite) falls back to uniform. */
export function normalizeWeights(
  weights: Readonly<Partial<Record<CurationTrack, number>>>,
): Record<CurationTrack, number> {
  const clean = CURATION_TRACKS.map((track) => {
    const value = weights[track] ?? 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  const total = clean.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return uniformWeights();

  return Object.fromEntries(
    CURATION_TRACKS.map((track, i) => [track, clean[i]! / total]),
  ) as Record<CurationTrack, number>;
}

export function defaultGenome(patronId: string, now: Date = new Date()): TasteGenome {
  return {
    patronId,
    moodWeights: uniformWeights(),
    palatePreferences: [],
    companionProfile: "",
    activeHub: DEFAULT_HUB,
    calibrated: false,
    interactionCount: 0,
    updatedAt: now.toISOString(),
  };
}

/** The track a free-text query names, or null when it names none or several. */
export function inferTrackFromQuery(query: string): CurationTrack | null {
  const text = query.toLowerCase();
  const matches = CURATION_TRACKS.filter((track) =>
    QUERY_CUES[track].some((cue) => new RegExp(`\\b${cue}\\b`).test(text)),
  );
  return matches.length === 1 ? matches[0]! : null;
}

/** The track an event reinforces and by how much, or null when it carries no signal. */
export function signalFor(event: TelemetryEvent): { track: CurationTrack; boost: number } | null {
  switch (event.type) {
    case "card_click":
      return event.track ? { track: event.track, boost: LEARNING_RATES.card_click } : null;
    case "card_dwell":
      return event.track && (event.dwellSeconds ?? 0) > DWELL_THRESHOLD_SECONDS
        ? { track: event.track, boost: LEARNING_RATES.card_dwell }
        : null;
    case "search_query":
    case "category_filter": {
      const track = event.track ?? (event.query ? inferTrackFromQuery(event.query) : null);
      return track ? { track, boost: LEARNING_RATES[event.type] } : null;
    }
    case "card_view":
      return null;
  }
}

/**
 * Apply a batch of events to a weight vector.
 *
 * Each signal adds its learning rate to one track and re-normalises, so a
 * single click moves a uniform 0.2 to ~0.30 and repeated clicks approach 1
 * asymptotically rather than overshooting. Events apply in order: the vector
 * after a batch is the same as after sending them one at a time.
 */
export function applyTelemetry(
  weights: Readonly<Record<CurationTrack, number>>,
  events: readonly TelemetryEvent[],
): Record<CurationTrack, number> {
  let next = normalizeWeights(weights);
  for (const event of events) {
    const signal = signalFor(event);
    if (!signal) continue;
    next = normalizeWeights({ ...next, [signal.track]: next[signal.track] + signal.boost });
  }
  return next;
}

/** Read a genome, marking it most recently used. */
export function getTasteGenome(patronId: string): TasteGenome | null {
  const genome = store.get(patronId);
  if (!genome) return null;
  store.delete(patronId);
  store.set(patronId, genome);
  return genome;
}

/** Store a genome with normalised weights, evicting the least recent past the cap. */
export function saveTasteGenome(genome: TasteGenome): TasteGenome {
  const saved: TasteGenome = { ...genome, moodWeights: normalizeWeights(genome.moodWeights) };
  store.delete(saved.patronId);
  store.set(saved.patronId, saved);

  while (store.size > MAX_ACTIVE_SESSIONS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return saved;
}

/** Fold a batch of events into the patron's genome, creating one if absent. */
export function recordTelemetry(
  patronId: string,
  events: readonly TelemetryEvent[],
  now: Date = new Date(),
): TasteGenome {
  const current = getTasteGenome(patronId) ?? defaultGenome(patronId, now);
  return saveTasteGenome({
    ...current,
    moodWeights: applyTelemetry(current.moodWeights, events),
    interactionCount: current.interactionCount + events.length,
    updatedAt: now.toISOString(),
  });
}

export function activeSessionCount(): number {
  return store.size;
}

/** Test seam: empty the store between cases. */
export function resetTasteGenomeStore(): void {
  store.clear();
}
