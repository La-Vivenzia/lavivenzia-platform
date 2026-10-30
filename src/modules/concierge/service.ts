import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import { formatGuestRange, formatMoneyMinor } from "@/lib/format";
import type { Coordinates } from "@/modules/discovery/geo";
import { quoteBooking } from "@/modules/booking/pricing";
import {
  CONCIERGE_CURRENCY,
  MATCH_LIMIT,
  PARTY_SIZE,
  formatBudget,
  partyKind,
  type ConciergeBudget,
  type Hotspot,
  type PartyKind,
} from "@/modules/concierge/options";
import {
  distanceMetres,
  findHotspot,
  normalise,
  resolveLocation,
  type ResolvedLocation,
} from "@/modules/concierge/places";

// Re-exported so callers keep one import for the concierge's arithmetic.
export { CONCIERGE_CURRENCY, formatBudget } from "@/modules/concierge/options";
export {
  PILOT_AREA_METRES,
  distanceMetres,
  findHotspot,
  findHotspotInText,
  resolveLocation,
  type LocationSource,
  type ResolvedLocation,
} from "@/modules/concierge/places";

/**
 * The concierge's ranking — "I'm here, I want this, there are N of us, this
 * is my budget: where do we go right now?"
 *
 * Deterministic and framework-free. Every fact on a match is read from the
 * pilot catalogue (`PILOT_EXPERIENCES`, the same definition the seed writes to
 * PostgreSQL): the price, the guest range and the venue coordinates. The party
 * total is `quoteBooking` — the same arithmetic checkout charges — so the
 * concierge cannot quote a number the booking flow will not honour
 * (CLAUDE.md §7). Distance is straight-line arithmetic over stored
 * coordinates, labelled as an estimate by the walking pace below.
 *
 * What this module owns is ranking: which listings fit, and in what order.
 */

/* -------------------------------------------------------------- distance */

/** Listings further than this are never "right now" recommendations. */
const MAX_MATCH_METRES = 15_000;

/** Above this the label stops saying "walk". */
const WALKABLE_METRES = 2_500;

/**
 * Typical adult walking pace, ~4.8 km/h. Must equal `WALKING_SPEED_MPS` in
 * components/map/live-map-tracking.ts so a card's minutes agree with the
 * tracker it opens; tests/unit/concierge.test.ts asserts the two match. It is
 * restated rather than imported because domain modules may not import from
 * `@/components` (src/modules/README.md).
 */
export const CONCIERGE_WALKING_SPEED_MPS = 1.33;

/* --------------------------------------------------------------- craving */

export type CravingId = "beer" | "coffee" | "arcade" | "dining" | "spa" | "rooftop";

interface CravingDefinition {
  readonly id: CravingId;
  readonly label: string;
  readonly aliases: readonly string[];
  /** Whole words or phrases; a trailing plural "s"/"es" also matches. */
  readonly keywords: readonly string[];
}

export const CRAVINGS: readonly CravingDefinition[] = [
  {
    id: "beer",
    label: "beer",
    aliases: ["beers", "pint", "pints", "brewery", "pub", "bar"],
    keywords: [
      "beer",
      "brewhouse",
      "brewpub",
      "microbrew",
      "draught",
      "pint",
      "gastropub",
      "taproom",
      "cider",
    ],
  },
  {
    id: "coffee",
    label: "coffee",
    aliases: ["cafe", "café", "espresso", "latte"],
    keywords: ["coffee", "espresso", "barista", "pour-over", "roastery", "latte", "cappuccino"],
  },
  {
    id: "arcade",
    label: "gaming",
    aliases: ["gaming", "games", "game", "arcade", "bowling", "vr"],
    keywords: [
      "arcade",
      "gaming",
      "game",
      "vr",
      "bowling",
      "laser tag",
      "escape room",
      "simulator",
    ],
  },
  {
    id: "dining",
    label: "dining",
    aliases: ["food", "dinner", "lunch", "brunch", "eat", "restaurant"],
    keywords: [
      "dining",
      "dinner",
      "brunch",
      "barbecue",
      "grill",
      "ramen",
      "feast",
      "buffet",
      "tasting menu",
      "gourmet",
      "bite",
    ],
  },
  {
    id: "spa",
    label: "spa",
    aliases: ["massage", "wellness", "relax"],
    keywords: ["spa", "massage", "aromatherapy", "reflexology", "therapist", "sound healing"],
  },
  {
    id: "rooftop",
    label: "rooftop",
    aliases: ["roof", "terrace", "skyline"],
    keywords: ["rooftop", "terrace", "open-air", "skyline", "starlit", "cabana"],
  },
];

export interface ResolvedCraving {
  /** A known craving, or "custom" for free text that names none. */
  readonly id: CravingId | "custom";
  readonly label: string;
  readonly terms: readonly string[];
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "some",
  "something",
  "want",
  "need",
  "near",
  "nearby",
  "here",
  "cheap",
  "budget",
  "good",
  "place",
  "spot",
  "now",
  "right",
  "around",
  "chilled",
  "quick",
]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A known craving id or alias, or free text.
 *
 * Free text keeps its own meaningful words as terms and folds in the keywords
 * of any craving it names — "cheap beer near me" searches as the beer craving.
 */
export function resolveCraving(input: string): ResolvedCraving {
  const text = normalise(input).trim();
  const known = CRAVINGS.find(
    (craving) => craving.id === text || craving.aliases.some((alias) => normalise(alias) === text),
  );
  if (known) return { id: known.id, label: known.label, terms: known.keywords.map(normalise) };

  const words = text
    .split(/[^a-z0-9-]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  const named = CRAVINGS.filter(
    (craving) =>
      words.includes(craving.id) ||
      craving.aliases.some((alias) => words.includes(normalise(alias))) ||
      craving.keywords.some((keyword) => words.includes(normalise(keyword))),
  );

  if (named.length === 1) {
    const [craving] = named;
    return {
      id: craving!.id,
      label: craving!.label,
      terms: [...new Set([...craving!.keywords.map(normalise), ...words])],
    };
  }

  const terms = [...new Set([...named.flatMap((craving) => craving.keywords), ...words])].map(
    normalise,
  );
  return { id: "custom", label: input.trim().slice(0, 40), terms };
}

function termPattern(term: string): RegExp {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(term)}(?:s|es)?(?![a-z0-9])`);
}

/**
 * How strongly a listing answers the craving: 1 when the title says it, less
 * when only the summary or the small print does, 0 when nothing does.
 */
export function cravingScore(listing: PilotExperienceInput, craving: ResolvedCraving): number {
  if (craving.terms.length === 0) return 0;
  const patterns = craving.terms.map(termPattern);
  const fields: readonly [string, number][] = [
    [listing.title, 1],
    [listing.summary, 0.75],
    [[listing.description, ...listing.inclusions].join(" "), 0.45],
  ];

  for (const [text, weight] of fields) {
    const haystack = normalise(text);
    if (patterns.some((pattern) => pattern.test(haystack))) return weight;
  }
  return 0;
}

/* ---------------------------------------------------- party and budget */

function partyPhrase(size: number): string {
  const kind = partyKind(size);
  if (kind === "solo") return "solo plan";
  if (kind === "duo") return "duo";
  return `squad of ${size}`;
}

export type BudgetFit = "within" | "flexible" | "over";

/** What the budget is compared against: the per-head share, or the party total. */
function spendAgainst(
  cost: { readonly totalMinor: number; readonly perPersonMinor: number },
  budget: ConciergeBudget,
): number {
  return budget.basis === "each" ? cost.perPersonMinor : cost.totalMinor;
}

/** Over the traveller's own cap is excluded; no cap at all is "flexible". */
export function budgetFit(
  cost: { readonly totalMinor: number; readonly perPersonMinor: number },
  budget: ConciergeBudget | null,
): BudgetFit {
  if (budget === null) return "flexible";
  return spendAgainst(cost, budget) <= budget.amountMinor ? "within" : "over";
}

/**
 * What the whole party pays, via the booking quote — never re-derived here.
 * Per person is the quote divided back out, rounded up, so a per-group listing
 * is compared against the budget at what each guest actually contributes.
 */
export function partyCost(
  listing: Pick<PilotExperienceInput, "basePriceMinor" | "pricingUnit">,
  partySize: number,
): { readonly totalMinor: number; readonly perPersonMinor: number } {
  const quote = quoteBooking({
    basePriceMinor: listing.basePriceMinor,
    currency: CONCIERGE_CURRENCY,
    pricingUnit: listing.pricingUnit,
    guests: partySize,
  });
  return { totalMinor: quote.totalMinor, perPersonMinor: Math.ceil(quote.totalMinor / partySize) };
}

/** "total for 2", or "for 1" for a solo plan. */
export function formatPartyQualifier(partySize: number): string {
  return partySize === 1 ? "for 1" : `total for ${partySize}`;
}

/** "₹998 total for 2", or "₹499 for 1" for a solo plan. */
export function formatPartyPrice(totalMinor: number, partySize: number): string {
  const money = formatMoneyMinor(totalMinor, CONCIERGE_CURRENCY) ?? "";
  return `${money} ${formatPartyQualifier(partySize)}`;
}

export function walkMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / CONCIERGE_WALKING_SPEED_MPS / 60));
}

/** "Within Seasons Mall", "450m walk", "1.4 km walk", "6.2 km away". */
export function formatProximity(metres: number, withinLabel: string | null): string {
  if (withinLabel) return `Within ${withinLabel}`;
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)}m walk`;
  const km = (metres / 1000).toFixed(1);
  return metres <= WALKABLE_METRES ? `${km} km walk` : `${km} km away`;
}

function isWithinHotspot(listing: PilotExperienceInput, hotspot: Hotspot): boolean {
  const address = listing.addressLine.toLowerCase();
  return (
    hotspot.addressMarkers.some((marker) => address.includes(marker.toLowerCase())) &&
    distanceMetres(hotspot, listing) <= hotspot.withinRadiusMetres
  );
}

/* --------------------------------------------------------------- ranking */

export interface ConciergeRequest {
  readonly latitude?: string | number | undefined;
  readonly longitude?: string | number | undefined;
  readonly hotspot?: string | undefined;
  readonly craving: string;
  readonly partySize: number;
  /** The traveller's own cap, or null for "flexible". */
  readonly budget: ConciergeBudget | null;
  readonly limit?: number | undefined;
}

export interface ConciergeMatch {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly addressLine: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly distanceMetres: number;
  readonly distanceLabel: string;
  readonly walkMinutes: number;
  readonly walkable: boolean;
  readonly withinHotspot: boolean;
  readonly currency: string;
  readonly perPersonMinor: number;
  readonly totalMinor: number;
  /** "₹998" — the party total alone. */
  readonly totalLabel: string;
  /** "total for 2" */
  readonly partyLabel: string;
  /** "₹998 total for 2" */
  readonly priceLabel: string;
  readonly budgetFit: Exclude<BudgetFit, "over">;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly actions: {
    readonly book: { readonly label: string; readonly href: string };
    readonly walk: {
      readonly label: string;
      readonly slug: string;
      readonly title: string;
      readonly destination: { readonly lat: number; readonly lng: number };
    };
  };
}

export interface ConciergeResult {
  readonly location: ResolvedLocation;
  readonly craving: { readonly id: ResolvedCraving["id"]; readonly label: string };
  readonly party: { readonly size: number; readonly kind: PartyKind };
  readonly budget: { readonly cap: ConciergeBudget | null; readonly label: string };
  readonly matches: readonly ConciergeMatch[];
  /**
   * The cheapest listing that fitted everything but the budget, at its real
   * price — so an empty result can say what it would take, rather than
   * guessing. Null when nothing was excluded on price.
   */
  readonly stretch: {
    readonly slug: string;
    readonly title: string;
    /** In the budget's own basis: per head for "each", the party total for "total". */
    readonly amountMinor: number;
    readonly label: string;
  } | null;
}

/** Craving matters most, then how close, then how well the price sits. */
const WEIGHTS = { craving: 0.5, distance: 0.3, budget: 0.2 } as const;

function clampPartySize(size: number): number {
  if (!Number.isFinite(size)) return 2;
  return Math.min(PARTY_SIZE.max, Math.max(PARTY_SIZE.min, Math.round(size)));
}

export function findVibeMatches(
  request: ConciergeRequest,
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
): ConciergeResult {
  const location = resolveLocation(request);
  const origin: Coordinates = { latitude: location.latitude, longitude: location.longitude };
  const hotspot = findHotspot(location.hotspotId);
  const craving = resolveCraving(request.craving);
  const partySize = clampPartySize(request.partySize);
  const budget = request.budget;
  const limit = Math.min(MATCH_LIMIT.max, Math.max(1, request.limit ?? MATCH_LIMIT.default));

  let stretch: ConciergeResult["stretch"] = null;

  const ranked = catalogue.flatMap((listing) => {
    if (listing.basePriceMinor <= 0) return [];
    if (partySize < listing.minGuests || partySize > listing.maxGuests) return [];

    const cravingWeight = cravingScore(listing, craving);
    if (cravingWeight === 0) return [];

    const metres = distanceMetres(origin, listing);
    if (metres > MAX_MATCH_METRES) return [];

    const cost = partyCost(listing, partySize);
    const { totalMinor, perPersonMinor } = cost;
    const fit = budgetFit(cost, budget);
    if (fit === "over") {
      const amountMinor = spendAgainst(cost, budget!);
      if (stretch === null || amountMinor < stretch.amountMinor) {
        stretch = {
          slug: listing.slug,
          title: listing.title,
          amountMinor,
          label: formatBudget({ basis: budget!.basis, amountMinor }),
        };
      }
      return [];
    }

    const within = hotspot !== null && isWithinHotspot(listing, hotspot);
    const distanceWeight = within ? 1 : Math.max(0, 1 - metres / 5_000);
    // Inside the cap is inside the cap: a cheaper listing is not a better
    // answer to "₹500 each", so the budget never reorders what fits.
    const budgetWeight = 1;
    const score =
      WEIGHTS.craving * cravingWeight +
      WEIGHTS.distance * distanceWeight +
      WEIGHTS.budget * budgetWeight;

    const minutes = walkMinutes(metres);
    const perHead = formatMoneyMinor(perPersonMinor, CONCIERGE_CURRENCY);
    const reasons = [
      cravingWeight >= 0.75
        ? `Hits your ${craving.label} craving`
        : `Has a ${craving.label} side to it`,
      within
        ? `You're already in ${hotspot.label} — no travel`
        : metres <= WALKABLE_METRES
          ? `About ${minutes} min on foot`
          : `${(metres / 1000).toFixed(1)} km away — best by cab`,
      budgetReason(fit, budget, { perHead, total: formatPartyPrice(totalMinor, partySize) }),
      `Takes ${formatGuestRange(listing.minGuests, listing.maxGuests).toLowerCase()}, so your ${partyPhrase(partySize)} fits`,
    ];

    const match: ConciergeMatch = {
      slug: listing.slug,
      title: listing.title,
      summary: listing.summary,
      addressLine: listing.addressLine,
      latitude: listing.latitude,
      longitude: listing.longitude,
      distanceMetres: Math.round(metres),
      distanceLabel: formatProximity(metres, within ? hotspot.label : null),
      walkMinutes: minutes,
      walkable: metres <= WALKABLE_METRES,
      withinHotspot: within,
      currency: CONCIERGE_CURRENCY,
      perPersonMinor,
      totalMinor,
      totalLabel: formatMoneyMinor(totalMinor, CONCIERGE_CURRENCY) ?? "",
      partyLabel: formatPartyQualifier(partySize),
      priceLabel: formatPartyPrice(totalMinor, partySize),
      budgetFit: fit,
      score: Math.round(score * 1000) / 1000,
      reasons,
      actions: {
        book: { label: "Book", href: `/experiences/${encodeURIComponent(listing.slug)}` },
        walk: {
          label: "Walk There",
          slug: listing.slug,
          title: listing.title,
          destination: { lat: listing.latitude, lng: listing.longitude },
        },
      },
    };
    return [match];
  });

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.distanceMetres - b.distanceMetres ||
      a.totalMinor - b.totalMinor ||
      a.slug.localeCompare(b.slug),
  );

  return {
    location,
    craving: { id: craving.id, label: craving.label },
    party: { size: partySize, kind: partyKind(partySize) },
    budget: { cap: budget, label: formatBudget(budget) },
    matches: ranked.slice(0, limit),
    stretch,
  };
}

/**
 * Why the price fits, quoting the traveller's own number back to them —
 * "₹499 a head — within your ₹500 each" — never a tier name.
 */
function budgetReason(
  fit: Exclude<BudgetFit, "over">,
  budget: ConciergeBudget | null,
  price: { readonly perHead: string | null; readonly total: string },
): string {
  if (fit === "flexible" || budget === null) return `${price.perHead} a head — no budget cap set`;
  const cap = formatBudget(budget);
  return budget.basis === "each"
    ? `${price.perHead} a head — within your ${cap}`
    : `${price.total} — within your ${cap}`;
}
