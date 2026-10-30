import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import { formatGuestRange, formatMoneyMinor } from "@/lib/format";
import { parseCoordinates, type Coordinates } from "@/modules/discovery/geo";
import { quoteBooking } from "@/modules/booking/pricing";
import {
  BUDGET_TIERS,
  DEFAULT_HOTSPOT_ID,
  HOTSPOTS,
  MATCH_LIMIT,
  PARTY_SIZE,
  partyKind,
  type BudgetTier,
  type BudgetTierDefinition,
  type Hotspot,
  type HotspotId,
  type PartyKind,
} from "@/modules/concierge/options";

/**
 * The Instant Vibe Concierge — "I'm here, I want this, there are N of us, this
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

/* ------------------------------------------------------------- location */

/** A GPS fix this close to a hotspot's centre is treated as being in it. */
const HOTSPOT_SNAP_METRES = 250;

/** Further than this from every hotspot, the traveller is outside the pilot. */
export const PILOT_AREA_METRES = 25_000;

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

const EARTH_RADIUS_METRES = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMetres(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function findHotspot(id: string | undefined | null): Hotspot | null {
  if (!id) return null;
  const key = id.trim().toLowerCase();
  return HOTSPOTS.find((hotspot) => hotspot.id === key) ?? null;
}

function defaultHotspot(): Hotspot {
  return findHotspot(DEFAULT_HOTSPOT_ID)!;
}

export type LocationSource = "gps" | "hotspot" | "fallback";

export interface ResolvedLocation {
  readonly source: LocationSource;
  /** The hotspot the traveller is in, or null when a GPS fix is between hotspots. */
  readonly hotspotId: HotspotId | null;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Set on a fallback, explaining it to the traveller. */
  readonly notice: string | null;
}

/**
 * Coordinates first, then a hotspot id, then the default hotspot.
 *
 * Never throws: a denied geolocation prompt, a mangled coordinate or an
 * unknown hotspot should still produce recommendations, with a notice saying
 * where they are measured from.
 */
export function resolveLocation(input: {
  readonly latitude?: string | number | undefined;
  readonly longitude?: string | number | undefined;
  readonly hotspot?: string | undefined;
}): ResolvedLocation {
  const coordinates = parseCoordinates(input.latitude, input.longitude);
  const fromHotspot = (hotspot: Hotspot, source: LocationSource, notice: string | null) => ({
    source,
    hotspotId: hotspot.id,
    label: hotspot.label,
    latitude: hotspot.latitude,
    longitude: hotspot.longitude,
    notice,
  });

  if (coordinates) {
    let nearest = defaultHotspot();
    let nearestMetres = Infinity;
    for (const hotspot of HOTSPOTS) {
      const metres = distanceMetres(coordinates, hotspot);
      if (metres < nearestMetres) {
        nearest = hotspot;
        nearestMetres = metres;
      }
    }

    if (nearestMetres > PILOT_AREA_METRES) {
      const fallback = findHotspot(input.hotspot) ?? defaultHotspot();
      return fromHotspot(
        fallback,
        "fallback",
        `You're outside our East Pune pilot, so we're showing picks around ${fallback.label}.`,
      );
    }

    const snapped = nearestMetres <= HOTSPOT_SNAP_METRES;
    return {
      source: "gps",
      hotspotId: snapped ? nearest.id : null,
      label: snapped ? nearest.label : `Near ${nearest.label}`,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      notice: null,
    };
  }

  const hotspot = findHotspot(input.hotspot);
  if (hotspot) return fromHotspot(hotspot, "hotspot", null);

  const fallback = defaultHotspot();
  return fromHotspot(
    fallback,
    "fallback",
    `We couldn't place you, so we're showing picks around ${fallback.label}.`,
  );
}

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

/** Lower-case, accents stripped, so "Café" and "cafe" are one word. */
function normalise(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

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

export function budgetTier(id: BudgetTier): BudgetTierDefinition {
  return BUDGET_TIERS.find((tier) => tier.id === id)!;
}

export type BudgetFit = "in-tier" | "under-tier" | "over-tier";

/** Over the tier's ceiling is excluded; under its floor still fits, a little less well. */
export function budgetFit(perPersonMinor: number, tier: BudgetTierDefinition): BudgetFit {
  if (tier.maxInclusiveMinor !== null && perPersonMinor > tier.maxInclusiveMinor) {
    return "over-tier";
  }
  return perPersonMinor > tier.minExclusiveMinor ? "in-tier" : "under-tier";
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

/** Every pilot listing is priced in rupees (scripts/seed-pune-pilot.ts). */
export const CONCIERGE_CURRENCY = "INR";

/* -------------------------------------------------------------- distance */

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
  readonly budget: BudgetTier;
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
  readonly budgetFit: Exclude<BudgetFit, "over-tier">;
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
  readonly budget: { readonly tier: BudgetTier; readonly label: string };
  readonly matches: readonly ConciergeMatch[];
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
  const tier = budgetTier(request.budget);
  const limit = Math.min(MATCH_LIMIT.max, Math.max(1, request.limit ?? MATCH_LIMIT.default));

  const ranked = catalogue.flatMap((listing) => {
    if (listing.basePriceMinor <= 0) return [];
    if (partySize < listing.minGuests || partySize > listing.maxGuests) return [];

    const cravingWeight = cravingScore(listing, craving);
    if (cravingWeight === 0) return [];

    const { totalMinor, perPersonMinor } = partyCost(listing, partySize);
    const fit = budgetFit(perPersonMinor, tier);
    if (fit === "over-tier") return [];

    const metres = distanceMetres(origin, listing);
    if (metres > MAX_MATCH_METRES) return [];

    const within = hotspot !== null && isWithinHotspot(listing, hotspot);
    const distanceWeight = within ? 1 : Math.max(0, 1 - metres / 5_000);
    const budgetWeight = fit === "in-tier" ? 1 : 0.6;
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
      fit === "in-tier"
        ? `${perHead} a head sits inside your ${tier.label} budget`
        : `${perHead} a head — under your ${tier.label} budget`,
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
        book: { label: "Book Slot", href: `/experiences/${encodeURIComponent(listing.slug)}` },
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
    budget: { tier: tier.id, label: tier.label },
    matches: ranked.slice(0, limit),
  };
}
