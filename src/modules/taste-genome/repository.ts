import { CURATION_TRACKS, type CurationTrack } from "@/modules/discovery/curation";
import {
  ACOUSTIC_COMFORTS,
  BEVERAGE_PALATES,
  DIETARY_PHILOSOPHIES,
  SEATING_PREFERENCES,
  type TasteGenome,
  type TasteProfile,
  type TelemetryEvent,
} from "./types";

/**
 * The in-memory session store, the telemetry re-weighting algorithm, and the
 * stored-JSON codec for account genomes.
 *
 * The store is the only home of a guest's genome — keyed by the guest cookie,
 * lost on a restart, which costs one recalibration. For a signed-in patron it
 * is a write-through cache in front of `users.preferences.tasteGenome` (see
 * ports.ts). The cap bounds memory against an unauthenticated write path — a
 * script minting guest ids evicts the oldest sessions rather than growing the
 * process.
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

export const EMPTY_TASTE: TasteProfile = {
  dietary: null,
  beverages: [],
  seating: null,
  acoustic: null,
};

export function defaultGenome(patronId: string, now: Date = new Date()): TasteGenome {
  return {
    patronId,
    taste: EMPTY_TASTE,
    trackAffinity: uniformWeights(),
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
  const saved: TasteGenome = { ...genome, trackAffinity: normalizeWeights(genome.trackAffinity) };
  store.delete(saved.patronId);
  store.set(saved.patronId, saved);

  while (store.size > MAX_ACTIVE_SESSIONS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return saved;
}

/** A genome with a batch of events folded in. Pure; the service decides where it is stored. */
export function foldTelemetry(
  genome: TasteGenome,
  events: readonly TelemetryEvent[],
  now: Date = new Date(),
): TasteGenome {
  return {
    ...genome,
    trackAffinity: applyTelemetry(genome.trackAffinity, events),
    interactionCount: genome.interactionCount + events.length,
    updatedAt: now.toISOString(),
  };
}

/** Drop one session — used when a guest genome is anchored to an account. */
export function deleteTasteGenome(patronId: string): void {
  store.delete(patronId);
}

export function activeSessionCount(): number {
  return store.size;
}

/** Test seam: empty the store between cases. */
export function resetTasteGenomeStore(): void {
  store.clear();
}

/* ---------------------------------------------------- stored-JSON codec */

/** Bumped when the stored shape changes; an unknown version reads as absent. */
export const STORED_GENOME_VERSION = 2;

/** The shape kept under `users.preferences.tasteGenome`. The patron id is the row. */
export interface StoredTasteGenome {
  readonly version: typeof STORED_GENOME_VERSION;
  readonly taste: TasteProfile;
  readonly trackAffinity: Record<CurationTrack, number>;
  readonly calibrated: boolean;
  readonly interactionCount: number;
  readonly updatedAt: string;
}

export function toStoredGenome(genome: TasteGenome): StoredTasteGenome {
  return {
    version: STORED_GENOME_VERSION,
    taste: { ...genome.taste, beverages: [...genome.taste.beverages] },
    trackAffinity: normalizeWeights(genome.trackAffinity),
    calibrated: genome.calibrated,
    interactionCount: genome.interactionCount,
    updatedAt: genome.updatedAt,
  };
}

function oneOf<T extends string>(options: readonly T[], raw: unknown): T | null {
  return typeof raw === "string" && (options as readonly string[]).includes(raw)
    ? (raw as T)
    : null;
}

/**
 * A genome from stored JSON, or null when there is none worth reading.
 *
 * The column is a JSON bag anyone with database access could have edited, so
 * it is read like a request body: unknown keys are dropped, a retired option
 * degrades to "not chosen", and the weights are re-normalised. An older
 * version (the mood-based v1) reads as absent — the patron recalibrates.
 */
export function parseStoredGenome(patronId: string, raw: unknown): TasteGenome | null {
  if (raw === null || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  if (source.version !== STORED_GENOME_VERSION) return null;

  const taste =
    source.taste !== null && typeof source.taste === "object"
      ? (source.taste as Record<string, unknown>)
      : {};
  const chosenBeverages = new Set(Array.isArray(taste.beverages) ? taste.beverages : []);
  const affinity =
    source.trackAffinity !== null && typeof source.trackAffinity === "object"
      ? (source.trackAffinity as Partial<Record<CurationTrack, number>>)
      : {};
  const count = Number(source.interactionCount);
  const updatedAt =
    typeof source.updatedAt === "string" && !Number.isNaN(Date.parse(source.updatedAt))
      ? source.updatedAt
      : new Date(0).toISOString();

  return {
    patronId,
    taste: {
      dietary: oneOf(DIETARY_PHILOSOPHIES, taste.dietary),
      beverages: BEVERAGE_PALATES.filter((value) => chosenBeverages.has(value)),
      seating: oneOf(SEATING_PREFERENCES, taste.seating),
      acoustic: oneOf(ACOUSTIC_COMFORTS, taste.acoustic),
    },
    trackAffinity: normalizeWeights(affinity),
    calibrated: source.calibrated === true,
    interactionCount: Number.isSafeInteger(count) && count > 0 ? count : 0,
    updatedAt,
  };
}
