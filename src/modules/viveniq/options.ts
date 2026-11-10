/**
 * VivenIQ's limits, starter prompts and wire shapes.
 *
 * Plain data with no imports, so the chat component can use it without pulling
 * discovery into the browser bundle and the server can use it without crossing
 * a `"use client"` boundary.
 */

/* ----------------------------------------------------------------- limits */

export const VIVENIQ_LIMITS = {
  message: { max: 280 },
  /** Earlier traveller turns sent as context. */
  history: { max: 6 },
  /** Slugs already shown in this conversation. */
  seen: { max: 24 },
  /** Keyword queries run per turn. Each is a trigram scan, so this is a cost ceiling. */
  terms: { max: 4 },
  /** Restraint over volume (DESIGN.md §B.4). */
  picks: { max: 3 },
} as const;

/** Shown before the first message. Plain data, so it lives outside the client component. */
export const VIVENIQ_STARTERS: readonly string[] = [
  "Poolside Sunday brunch in Viman Nagar",
  "Sunset craft brews & wood-fired pizza",
  "Intimate Pan-Asian dim sum masterclass",
  "Thrilling 60-minute escape challenge",
];

/** One recommendation, as the chat renders it. Every field is read off the listing. */
export interface VivenIQPick {
  readonly slug: string;
  readonly title: string;
  readonly place: string;
  readonly categoryName: string | null;
  readonly durationLabel: string;
  /** e.g. "₹2,500 / person". Null when the host has not priced the listing. */
  readonly priceLabel: string | null;
  readonly coverUrl: string | null;
  readonly coverAlt: string;
  /** Why it was picked — DESIGN.md §B.4: an unexplained recommendation is a guess. */
  readonly reason: string;
}

export interface VivenIQReply {
  readonly reply: string;
  readonly picks: readonly VivenIQPick[];
  readonly followUps: readonly string[];
}
