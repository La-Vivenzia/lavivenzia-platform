/**
 * The Instant Vibe Concierge's choices — hotspots, party bounds, budget tiers
 * and the craving chips.
 *
 * Separate from `service.ts` so the browser can import them without pulling the
 * catalogue into its bundle, and a plain module rather than `"use client"` so
 * they are real values on both sides of the RSC boundary
 * (tests/unit/client-boundary.test.ts).
 */

export type HotspotId = "seasons" | "amanora" | "magarpatta";

export interface Hotspot {
  readonly id: HotspotId;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  /** A venue counts as "within" the hotspot when its address names one of these… */
  readonly addressMarkers: readonly string[];
  /** …and it is no further than this from the hotspot's centre. */
  readonly withinRadiusMetres: number;
}

export const HOTSPOTS: readonly Hotspot[] = [
  {
    id: "seasons",
    label: "Seasons Mall",
    latitude: 18.51955,
    longitude: 73.9316,
    addressMarkers: ["Seasons Mall"],
    withinRadiusMetres: 250,
  },
  {
    id: "amanora",
    label: "Amanora Mall",
    latitude: 18.5179,
    longitude: 73.9345,
    addressMarkers: ["Amanora Mall", "Amanora Town Centre"],
    withinRadiusMetres: 300,
  },
  {
    id: "magarpatta",
    label: "Magarpatta City",
    latitude: 18.5155,
    longitude: 73.9265,
    addressMarkers: ["North Court", "Destination Centre Courtyard"],
    withinRadiusMetres: 300,
  },
];

/** Where the concierge starts when it has no usable location: the pilot's centre. */
export const DEFAULT_HOTSPOT_ID: HotspotId = "seasons";

export const PARTY_SIZE = { min: 1, max: 6 } as const;

export type PartyKind = "solo" | "duo" | "squad";

export function partyKind(size: number): PartyKind {
  if (size <= 1) return "solo";
  if (size === 2) return "duo";
  return "squad";
}

export type BudgetTier = "pocket" | "mid" | "luxury";

export interface BudgetTierDefinition {
  readonly id: BudgetTier;
  readonly label: string;
  /** Chip copy. */
  readonly range: string;
  /** Per-person price bounds in minor units. */
  readonly minExclusiveMinor: number;
  readonly maxInclusiveMinor: number | null;
}

/** Pocket ≤ ₹600, mid ₹600–1,200, luxury above ₹1,200 — per person. */
export const BUDGET_TIERS: readonly BudgetTierDefinition[] = [
  {
    id: "pocket",
    label: "pocket-friendly",
    range: "Up to ₹600",
    minExclusiveMinor: 0,
    maxInclusiveMinor: 60_000,
  },
  {
    id: "mid",
    label: "mid-range",
    range: "₹600–1,200",
    minExclusiveMinor: 60_000,
    maxInclusiveMinor: 120_000,
  },
  {
    id: "luxury",
    label: "luxury",
    range: "₹1,200+",
    minExclusiveMinor: 120_000,
    maxInclusiveMinor: null,
  },
];

export const BUDGET_TIER_IDS = BUDGET_TIERS.map((tier) => tier.id) as [BudgetTier, ...BudgetTier[]];

export const MATCH_LIMIT = { default: 3, max: 10 } as const;

/** The one-tap craving chips. `value` is what the API is sent. */
export const CRAVING_CHIPS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "beer", label: "Beer" },
  { value: "coffee", label: "Coffee" },
  { value: "arcade", label: "Gaming" },
  { value: "rooftop", label: "Rooftop" },
  { value: "spa", label: "Spa" },
  { value: "dining", label: "Dining" },
];
