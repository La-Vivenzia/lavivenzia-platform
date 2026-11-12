/**
 * VivenIQ's limits, starter prompts and wire shapes.
 *
 * Plain data with type-only imports, so the chat component can use it without
 * pulling discovery into the browser bundle and the server can use it without
 * crossing a `"use client"` boundary.
 */

import type { CurationTrack } from "@/modules/discovery/curation";
import type { ChapterRole } from "@/modules/journeys/data";

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
  /** Curated journeys offered alongside the picks for an occasion. */
  journeys: { max: 3 },
} as const;

/** The entry VivenIQ records in `seen` once a journey has been shown. */
export function seenJourneyKey(journeyId: string): string {
  return `journey:${journeyId}`;
}

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

/** One act of a curated journey, as the chat renders it. */
export interface VivenIQJourneyAct {
  readonly role: ChapterRole;
  /** "Prelude", "Centerpiece", "Epilogue". */
  readonly label: string;
  readonly slug: string;
  readonly title: string;
  readonly place: string;
  /** Suggested start, e.g. "18:30". A running order, not a reserved slot. */
  readonly startLabel: string;
  readonly privilegeTitle: string;
  /** False until the venue has agreed; the card then says "requested". */
  readonly privilegeConfirmed: boolean;
  readonly coverUrl: string | null;
  readonly coverAlt: string;
}

/**
 * A whole curated journey — two or three acts sold as one experience. Every
 * figure is copied from the listings the acts name.
 */
export interface VivenIQJourney {
  readonly id: string;
  readonly title: string;
  readonly mood: string;
  readonly tagline: string;
  readonly durationLabel: string;
  /** e.g. "₹2,849 / person" — the sum of the acts' own prices. */
  readonly priceLabel: string | null;
  readonly timeSavedLabel: string | null;
  readonly acts: readonly VivenIQJourneyAct[];
}

export interface VivenIQReply {
  readonly reply: string;
  readonly picks: readonly VivenIQPick[];
  readonly followUps: readonly string[];
  /** Present when the traveller described an occasion a journey answers. */
  readonly journeys?: readonly VivenIQJourney[];
}
