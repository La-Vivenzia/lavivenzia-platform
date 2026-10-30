import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";

/**
 * Curated end-to-end trips — a stay plus a two-day running order, Pune and the
 * Western Ghats.
 *
 * **Two kinds of line, and they are never confused.**
 *
 * - A `listing` line names a pilot listing by slug. Title, address, duration
 *   and per-person price are copied from `PILOT_EXPERIENCES`, exactly as
 *   `modules/journeys/data.ts` does, so they cannot drift from the listing.
 * - A `planned` line is something the catalogue does not carry yet — the
 *   Mulshi villa, the Pawna domes, the guided kayaking. Its price is an
 *   **indicative** planning figure written here, not a venue quote, and every
 *   reader is told so (`priceBasis: "indicative"`). It must be replaced by the
 *   venue's own price before anything other than a simulation is sold.
 *
 * **Curator scores are provisional.** There is no reviews module and no
 * traveller rating anywhere in the product yet. Each line carries La
 * Vivenzia's own curation assessment — a score and a note in the curation
 * team's voice — with `verified: false` until a curator has actually visited
 * and signed it off. The interface labels an unverified score as provisional.
 * Nothing here is, or may be presented as, a guest review or a quotation from
 * a third-party publication.
 */

/** The premium bar every trip line must clear (definition-time invariant). */
export const PREMIUM_RATING_FLOOR = 4.8;

/** Every pilot listing is priced in rupees (scripts/seed-pune-pilot.ts). */
export const TRIP_CURRENCY = "INR";

export type TripDay = 1 | 2;
export type TripLineKind = "activity" | "dining";
export type PriceBasis = "listing" | "indicative";

export interface CuratorAssessment {
  /** La Vivenzia's curation score out of 5. */
  readonly score: number;
  /** One line in the curation team's voice. Never a guest or press quote. */
  readonly note: string;
  /** True only once a curator has visited and signed the score off. */
  readonly verified: boolean;
}

interface ListingSource {
  readonly kind: "listing";
  readonly slug: string;
}

interface PlannedSource {
  readonly kind: "planned";
  readonly title: string;
  readonly addressLine: string;
  readonly durationMinutes: number;
  /** Indicative, per person. Not a venue quote. */
  readonly indicativePriceMinor: number;
}

interface LineDefinition {
  readonly id: string;
  readonly day: TripDay;
  readonly kind: TripLineKind;
  /** Minutes after midnight, local time. */
  readonly startMinute: number;
  readonly source: ListingSource | PlannedSource;
  readonly curation: CuratorAssessment;
}

interface StayDefinition {
  readonly title: string;
  readonly addressLine: string;
  readonly summary: string;
  /** Day 1, minutes after midnight. */
  readonly checkInMinute: number;
  /** Day 2, minutes after midnight. */
  readonly checkOutMinute: number;
  /** Indicative, per person, twin share, for the one night. */
  readonly indicativePriceMinor: number;
  readonly curation: CuratorAssessment;
}

interface TripDefinition {
  readonly id: string;
  readonly title: string;
  readonly region: string;
  readonly mood: string;
  readonly tagline: string;
  readonly stay: StayDefinition;
  readonly lines: readonly LineDefinition[];
}

const at = (hour: number, minute = 0): number => hour * 60 + minute;
const rupees = (amount: number): number => amount * 100;

const provisional = (score: number, note: string): CuratorAssessment => ({
  score,
  note,
  verified: false,
});

const TRIP_DEFINITIONS: readonly TripDefinition[] = [
  {
    id: "mulshi-rainforest-retreat",
    title: "The 48-Hour Mulshi Rainforest & Adventure Retreat",
    region: "Mulshi, Western Ghats",
    mood: "Wild & restorative",
    tagline: "A glass villa in the rain forest, clay at sunset, supper among the vines.",
    stay: {
      title: "Hillside Glass Villa",
      addressLine: "Mulshi valley, off Pune–Kolad Road",
      summary: "A glass-walled villa above the backwaters, with a private deck facing the ridge.",
      checkInMinute: at(12),
      checkOutMinute: at(11),
      indicativePriceMinor: rupees(9500),
      curation: provisional(4.9, "Floor-to-ceiling glass and nothing but forest beyond it."),
    },
    lines: [
      {
        id: "mulshi-pottery",
        day: 1,
        kind: "activity",
        startMinute: at(17),
        source: {
          kind: "planned",
          title: "Sunset Pottery Masterclass",
          addressLine: "Studio deck, Mulshi valley",
          durationMinutes: 120,
          indicativePriceMinor: rupees(2200),
        },
        curation: provisional(4.8, "Wheel work in the last light, led by a resident potter."),
      },
      {
        id: "mulshi-vineyard-dinner",
        day: 1,
        kind: "dining",
        startMinute: at(20),
        source: {
          kind: "planned",
          title: "Vineyard Farm Dinner",
          addressLine: "Farm estate, Mulshi valley",
          durationMinutes: 150,
          indicativePriceMinor: rupees(3500),
        },
        curation: provisional(4.9, "A long table between the rows, cooked from the farm."),
      },
      {
        id: "mulshi-kayaking",
        day: 2,
        kind: "activity",
        startMinute: at(7),
        source: {
          kind: "planned",
          title: "Private Guided Lake Kayaking",
          addressLine: "Mulshi backwaters launch point",
          durationMinutes: 120,
          indicativePriceMinor: rupees(1800),
        },
        curation: provisional(4.8, "Mist still on the water, a guide in the next boat."),
      },
    ],
  },
  {
    id: "east-pune-nightlife-sprint",
    title: "The East Pune High-Octane & Nightlife Sprint",
    region: "Amanora & Hadapsar, East Pune",
    mood: "High-energy",
    tagline: "Own the lanes, take the rooftop, then a slow craft tasting to close.",
    stay: {
      title: "Amanora Luxury Suite",
      addressLine: "Amanora Park Town, Hadapsar",
      summary: "A serviced suite a short walk from the mall, the lanes and the rooftop.",
      checkInMinute: at(14),
      checkOutMinute: at(12),
      indicativePriceMinor: rupees(6500),
      curation: provisional(4.8, "Everything on the itinerary is within walking distance."),
    },
    lines: [
      {
        id: "east-pune-smaaash",
        day: 1,
        kind: "activity",
        startMinute: at(15, 30),
        source: { kind: "listing", slug: "smaaash-vr-twilight-bowling-amanora" },
        curation: provisional(4.8, "UV lanes and VR rigs — the loudest two hours of the trip."),
      },
      {
        id: "east-pune-spice-factory",
        day: 1,
        kind: "dining",
        startMinute: at(20),
        source: { kind: "listing", slug: "spice-factory-rooftop-cocktails-hadapsar" },
        curation: provisional(4.8, "Open sky, a long cocktail list, the city lit below."),
      },
      {
        id: "east-pune-effingut",
        day: 2,
        kind: "dining",
        startMinute: at(13),
        source: { kind: "listing", slug: "effingut-brewhouse-craft-tasting-seasons" },
        curation: provisional(4.8, "An unhurried flight of house brews after check-out."),
      },
    ],
  },
  {
    id: "pawna-stargazing-glamping",
    title: "The Pawna Stargazing & Acoustic Glamping Escape",
    region: "Pawna Lake, Western Ghats",
    mood: "Starlit & slow",
    tagline: "A dome by the lake, a fire and a guitar, a telescope, and a fort at dawn.",
    stay: {
      title: "Luxury Dome Glamping",
      addressLine: "Pawna Lake shore, near Lonavala",
      summary: "A geodesic dome with a proper bed, a lake view and a clear-panel skylight.",
      checkInMinute: at(15),
      checkOutMinute: at(11),
      indicativePriceMinor: rupees(4500),
      curation: provisional(4.8, "Fall asleep under the skylight with the lake below."),
    },
    lines: [
      {
        id: "pawna-barbecue",
        day: 1,
        kind: "dining",
        startMinute: at(19),
        source: {
          kind: "planned",
          title: "Acoustic Barbecue by the Lake",
          addressLine: "Campfire circle, Pawna Lake shore",
          durationMinutes: 150,
          indicativePriceMinor: rupees(1600),
        },
        curation: provisional(4.8, "Live acoustic sets around the fire while the grill works."),
      },
      {
        id: "pawna-stargazing",
        day: 1,
        kind: "activity",
        startMinute: at(22),
        source: {
          kind: "planned",
          title: "Telescope Stargazing Session",
          addressLine: "Observation point, Pawna Lake shore",
          durationMinutes: 90,
          indicativePriceMinor: rupees(1200),
        },
        curation: provisional(4.9, "Away from the city glow, with someone who knows the sky."),
      },
      {
        id: "pawna-fort-trek",
        day: 2,
        kind: "activity",
        startMinute: at(5, 30),
        source: {
          kind: "planned",
          title: "Morning Fort Trek",
          addressLine: "Trailhead, Pawna Lake",
          durationMinutes: 210,
          indicativePriceMinor: rupees(900),
        },
        curation: provisional(4.8, "A guided climb timed for sunrise over the reservoir."),
      },
    ],
  },
];

// ── Resolved shape ──────────────────────────────────────────────────────────

export interface TripLine {
  readonly id: string;
  readonly day: TripDay;
  readonly kind: TripLineKind;
  readonly title: string;
  readonly addressLine: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly durationMinutes: number;
  /** Per person. */
  readonly priceMinor: number;
  readonly priceBasis: PriceBasis;
  /** Set only for a catalogue listing, so the view can link to it. */
  readonly experienceSlug: string | null;
  readonly curation: CuratorAssessment;
}

export interface TripStay {
  readonly title: string;
  readonly addressLine: string;
  readonly summary: string;
  readonly checkInMinute: number;
  readonly checkOutMinute: number;
  readonly nights: 1;
  /** Per person, twin share. */
  readonly priceMinor: number;
  readonly priceBasis: "indicative";
  readonly curation: CuratorAssessment;
}

export interface TripDayPlan {
  readonly day: TripDay;
  readonly lines: readonly TripLine[];
}

export interface Trip {
  readonly id: string;
  readonly title: string;
  readonly region: string;
  readonly mood: string;
  readonly tagline: string;
  readonly stay: TripStay;
  readonly days: readonly [TripDayPlan, TripDayPlan];
  /** Stay plus every line, per person. */
  readonly perPersonPriceMinor: number;
  readonly currency: string;
  /** True when any figure in the total is indicative rather than a listing price. */
  readonly hasIndicativePricing: boolean;
  /** The lowest curator score across the stay and every line. */
  readonly minCuratorScore: number;
  /** True only if every score on the trip has been verified by a curator. */
  readonly fullyVerified: boolean;
  /** The largest party every listing on the trip will take. */
  readonly maxPartySize: number;
}

export class TripDefinitionError extends Error {
  override readonly name = "TripDefinitionError";
}

/** Planned lines have no host-set maximum yet; this is the trip-level cap. */
export const TRIP_PARTY_MAX = 6;

const DAY_END = 24 * 60;

function assertCuration(tripId: string, label: string, curation: CuratorAssessment): void {
  if (curation.score < PREMIUM_RATING_FLOOR || curation.score > 5) {
    throw new TripDefinitionError(
      `Trip "${tripId}" ${label} has curator score ${curation.score}; the bar is ${PREMIUM_RATING_FLOOR}–5.`,
    );
  }
  if (!curation.note.trim()) {
    throw new TripDefinitionError(`Trip "${tripId}" ${label} has no curator note.`);
  }
}

function resolveLine(
  tripId: string,
  definition: LineDefinition,
  catalogue: ReadonlyMap<string, PilotExperienceInput>,
): { line: TripLine; maxGuests: number } {
  assertCuration(tripId, `line "${definition.id}"`, definition.curation);
  const { source } = definition;

  if (source.kind === "listing") {
    const listing = catalogue.get(source.slug);
    if (!listing) {
      throw new TripDefinitionError(
        `Trip "${tripId}" names "${source.slug}", which is not in the catalogue.`,
      );
    }
    // A group price cannot be summed with per-person ones without the party.
    if (listing.pricingUnit !== "PER_PERSON") {
      throw new TripDefinitionError(
        `Trip "${tripId}" line "${listing.slug}" is not priced per person.`,
      );
    }
    return {
      line: {
        id: definition.id,
        day: definition.day,
        kind: definition.kind,
        title: listing.title,
        addressLine: listing.addressLine,
        startMinute: definition.startMinute,
        endMinute: definition.startMinute + listing.durationMinutes,
        durationMinutes: listing.durationMinutes,
        priceMinor: listing.basePriceMinor,
        priceBasis: "listing",
        experienceSlug: listing.slug,
        curation: definition.curation,
      },
      maxGuests: listing.maxGuests,
    };
  }

  return {
    line: {
      id: definition.id,
      day: definition.day,
      kind: definition.kind,
      title: source.title,
      addressLine: source.addressLine,
      startMinute: definition.startMinute,
      endMinute: definition.startMinute + source.durationMinutes,
      durationMinutes: source.durationMinutes,
      priceMinor: source.indicativePriceMinor,
      priceBasis: "indicative",
      experienceSlug: null,
      curation: definition.curation,
    },
    maxGuests: TRIP_PARTY_MAX,
  };
}

function assertDayOrder(tripId: string, stay: TripStay, plan: TripDayPlan): void {
  plan.lines.forEach((line, index) => {
    if (line.endMinute > DAY_END) {
      throw new TripDefinitionError(`Trip "${tripId}" line "${line.id}" runs past midnight.`);
    }
    const previous = plan.lines[index - 1];
    if (previous && line.startMinute < previous.endMinute) {
      throw new TripDefinitionError(
        `Trip "${tripId}" line "${line.id}" starts before "${previous.id}" ends.`,
      );
    }
  });

  // Day 1 begins at check-in. On day 2 a line may run either side of
  // check-out, but not across it — nobody kayaks while handing back the key.
  if (plan.day === 1) {
    const first = plan.lines[0];
    if (first && first.startMinute < stay.checkInMinute) {
      throw new TripDefinitionError(`Trip "${tripId}" day 1 starts before check-in.`);
    }
  } else {
    const straddles = plan.lines.find(
      (line) => line.startMinute < stay.checkOutMinute && line.endMinute > stay.checkOutMinute,
    );
    if (straddles) {
      throw new TripDefinitionError(
        `Trip "${tripId}" line "${straddles.id}" runs across check-out.`,
      );
    }
  }
}

function resolveTrip(
  definition: TripDefinition,
  catalogue: ReadonlyMap<string, PilotExperienceInput>,
): Trip {
  assertCuration(definition.id, "stay", definition.stay.curation);

  const stay: TripStay = {
    title: definition.stay.title,
    addressLine: definition.stay.addressLine,
    summary: definition.stay.summary,
    checkInMinute: definition.stay.checkInMinute,
    checkOutMinute: definition.stay.checkOutMinute,
    nights: 1,
    priceMinor: definition.stay.indicativePriceMinor,
    priceBasis: "indicative",
    curation: definition.stay.curation,
  };

  const resolved = definition.lines.map((line) => resolveLine(definition.id, line, catalogue));
  const lines = resolved.map((entry) => entry.line);

  const byDay = (day: TripDay): TripDayPlan => ({
    day,
    lines: lines
      .filter((line) => line.day === day)
      .sort((left, right) => left.startMinute - right.startMinute),
  });
  const days = [byDay(1), byDay(2)] as const;

  for (const plan of days) {
    if (plan.lines.length === 0) {
      throw new TripDefinitionError(`Trip "${definition.id}" has nothing on day ${plan.day}.`);
    }
    assertDayOrder(definition.id, stay, plan);
  }

  const scores = [stay.curation, ...lines.map((line) => line.curation)];

  return {
    id: definition.id,
    title: definition.title,
    region: definition.region,
    mood: definition.mood,
    tagline: definition.tagline,
    stay,
    days,
    perPersonPriceMinor: lines.reduce((sum, line) => sum + line.priceMinor, stay.priceMinor),
    currency: TRIP_CURRENCY,
    hasIndicativePricing: [stay, ...lines].some((entry) => entry.priceBasis === "indicative"),
    minCuratorScore: Math.min(...scores.map((curation) => curation.score)),
    fullyVerified: scores.every((curation) => curation.verified),
    maxPartySize: Math.min(TRIP_PARTY_MAX, ...resolved.map((entry) => entry.maxGuests)),
  };
}

/**
 * Resolve every trip against a catalogue. Throws `TripDefinitionError` on any
 * inconsistency — a definition error is a defect, and the unit suite runs it.
 */
export function resolveTrips(
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
): readonly Trip[] {
  const bySlug = new Map(catalogue.map((listing) => [listing.slug, listing]));
  return TRIP_DEFINITIONS.map((definition) => resolveTrip(definition, bySlug));
}

let cached: readonly Trip[] | undefined;

/** The curated trips, resolved once per process. */
export function listTrips(): readonly Trip[] {
  cached ??= resolveTrips();
  return cached;
}

export function findTrip(id: string): Trip | undefined {
  return listTrips().find((trip) => trip.id === id);
}

/**
 * Trips whose every line clears `minScore`. With `verifiedOnly`, a trip also
 * needs every score signed off — which today returns none, and should.
 */
export function filterTripsByRating(
  trips: readonly Trip[],
  { minScore = PREMIUM_RATING_FLOOR, verifiedOnly = false } = {},
): readonly Trip[] {
  return trips.filter(
    (trip) => trip.minCuratorScore >= minScore && (!verifiedOnly || trip.fullyVerified),
  );
}
