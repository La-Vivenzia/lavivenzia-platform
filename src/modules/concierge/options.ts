/**
 * The concierge's choices — hotspots, party bounds, budget bounds and the
 * suggestion chips the conversation offers.
 *
 * Separate from `service.ts` so the browser can import them without pulling the
 * catalogue into its bundle, and a plain module rather than `"use client"` so
 * they are real values on both sides of the RSC boundary
 * (tests/unit/client-boundary.test.ts).
 */

import { formatMoneyMinor } from "@/lib/format";

export type HotspotId = "seasons" | "amanora" | "magarpatta";

export interface Hotspot {
  readonly id: HotspotId;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  /** What a traveller might type for it, lower-case: "seasons", "hadapsar". */
  readonly aliases: readonly string[];
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
    // Seasons Mall's own address reads "Magarpatta City, Hadapsar", and it is
    // the pilot's default centre, so the locality resolves here.
    aliases: ["seasons", "seasons mall", "hadapsar"],
    addressMarkers: ["Seasons Mall"],
    withinRadiusMetres: 250,
  },
  {
    id: "amanora",
    label: "Amanora Mall",
    latitude: 18.5179,
    longitude: 73.9345,
    aliases: ["amanora", "amanora mall", "amanora town centre", "amanora park town"],
    addressMarkers: ["Amanora Mall", "Amanora Town Centre"],
    withinRadiusMetres: 300,
  },
  {
    id: "magarpatta",
    label: "Magarpatta City",
    latitude: 18.5155,
    longitude: 73.9265,
    aliases: ["magarpatta", "magarpatta city"],
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

/**
 * The traveller's own budget, in minor units — never a tier. `each` is a cap
 * per person; `total` is a cap on what the whole party pays. Null means
 * "flexible": no cap at all.
 */
export type BudgetBasis = "each" | "total";

export interface ConciergeBudget {
  readonly basis: BudgetBasis;
  readonly amountMinor: number;
}

/** Every pilot listing is priced in rupees (scripts/seed-pune-pilot.ts). */
export const CONCIERGE_CURRENCY = "INR";

/** "₹500 each", "₹2,000 total", or "Flexible" — the traveller's words, not a tier. */
export function formatBudget(budget: ConciergeBudget | null): string {
  if (budget === null) return "Flexible";
  const money = formatMoneyMinor(budget.amountMinor, CONCIERGE_CURRENCY) ?? "";
  return `${money} ${budget.basis === "each" ? "each" : "total"}`;
}

/** ₹1 to ₹1,00,000, in rupees as typed. Outside this, the number is a typo. */
export const BUDGET_RUPEES = { min: 1, max: 100_000 } as const;

/** One-tap answers to "what can each of you spend?" — rupees per person. */
export const BUDGET_SUGGESTIONS_RUPEES: readonly number[] = [300, 500, 1_000, 2_000];

export const MATCH_LIMIT = { default: 3, max: 10 } as const;

/**
 * The one-tap craving chips. `value` is the craving the ranking is sent — a
 * canonical id, so "Beer & chill" does not also search for the word "chill";
 * `label` is what the chip and the traveller's reply say.
 */
export const CRAVING_CHIPS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "beer", label: "Beer & chill" },
  { value: "coffee", label: "Coffee & work" },
  { value: "arcade", label: "Arcade & fun" },
  { value: "dining", label: "Dinner date" },
  { value: "rooftop", label: "Rooftop" },
  { value: "spa", label: "Spa" },
];

/** The label a chip value is shown with, or the text itself when it is not a chip. */
export function cravingDisplay(value: string): string {
  return CRAVING_CHIPS.find((chip) => chip.value === value)?.label ?? value;
}
