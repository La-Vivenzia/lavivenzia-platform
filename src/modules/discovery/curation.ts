/**
 * Editorial curation — what La Vivenzia adds on top of a host's listing.
 *
 * A listing says what a venue *is*; curation says why booking it through us is
 * better than walking in: the perks our curators negotiated, the insider
 * knowledge they gathered on site, and the time a traveller no longer spends
 * researching and queueing. Every value is written by our curation team, never
 * generated, and never a statement about availability or price (CLAUDE.md §7).
 *
 * Plain data with no imports, so the chat component can render track labels
 * without pulling discovery into the browser bundle.
 */

/**
 * The mood a listing answers. Keys are stable — a stored or cached key must
 * keep meaning the same track, so retire a key rather than renaming it.
 */
export const CURATION_TRACKS = [
  "CONNOISSEUR",
  "ALFRESCO_SUNDOWNER",
  "HIGH_OCTANE_NIGHTLIFE",
  "MINDFUL_WELLNESS",
  "ARTISANAL_FOCUS",
] as const;

export type CurationTrack = (typeof CURATION_TRACKS)[number];

/** How each track is named to a traveller. */
export const CURATION_TRACK_LABELS: Readonly<Record<CurationTrack, string>> = {
  CONNOISSEUR: "The Connoisseur’s Table",
  ALFRESCO_SUNDOWNER: "The Alfresco Sundowner",
  HIGH_OCTANE_NIGHTLIFE: "The High-Octane Sprint",
  MINDFUL_WELLNESS: "The Mindful Pause",
  ARTISANAL_FOCUS: "The Artisanal Hour",
};

export interface ExperienceCuration {
  /** Concrete platform advantages, strongest first. Never empty. */
  readonly vipPerks: readonly string[];
  /** Insider knowledge from a curator's own visit. */
  readonly curatorSecret: string;
  /** Minutes saved against researching, calling ahead and queueing. */
  readonly timeSavedMinutes: number;
  /** A specific culinary pairing, where the venue has one worth naming. */
  readonly curatedPairing?: string | undefined;
  readonly curationTrack: CurationTrack;
}

export function isCurationTrack(value: string): value is CurationTrack {
  return (CURATION_TRACKS as readonly string[]).includes(value);
}

/** "Saves ~45 min of research and queueing", or null when nothing is claimed. */
export function timeSavedLabel(minutes: number): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `Saves ~${Math.round(minutes)} min of research and queueing`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `Saves ~${hours} h${rest > 0 ? ` ${rest} min` : ""} of research and queueing`;
}
