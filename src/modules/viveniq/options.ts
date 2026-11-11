/**
 * VivenIQ's limits, starter prompts and wire shapes.
 *
 * Plain data with type-only imports, so the chat component can use it without
 * pulling discovery into the browser bundle and the server can use it without
 * crossing a `"use client"` boundary.
 */

import type { CurationTrack } from "@/modules/discovery/curation";

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
  "Mujhe craft beer pini hai",
];

/**
 * La Vivenzia's editorial layer on a pick, as the chat renders it. Copied from
 * the listing's curation record — perks and secrets are written by our
 * curators, never by a model.
 */
export interface VivenIQPickCuration {
  readonly track: CurationTrack;
  /** e.g. "The Alfresco Sundowner". */
  readonly trackLabel: string;
  readonly vipPerks: readonly string[];
  readonly curatorSecret: string;
  readonly timeSavedMinutes: number;
  /** e.g. "Saves ~45 min of research and queueing". Null when nothing is claimed. */
  readonly timeSavedLabel: string | null;
  readonly curatedPairing: string | null;
}

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
  /** Present when the listing is curated; absent or null otherwise. */
  readonly curation?: VivenIQPickCuration | null;
}

export interface VivenIQReply {
  readonly reply: string;
  readonly picks: readonly VivenIQPick[];
  readonly followUps: readonly string[];
}
