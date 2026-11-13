import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";

/**
 * Curated journeys — two or three pilot listings sequenced into one evening.
 *
 * Two collections share one definition format and one set of invariants:
 *
 * - **Featured** (`listJourneys`) — the four launch arcs the home page and the
 *   taste profiler present. Kept deliberately short: a picker of eleven tabs is
 *   a directory, not a curation.
 * - **Curated** (`listCuratedJourneys`) — the featured arcs plus the signature
 *   collection. VivenIQ, the journey page and the companion map read this one.
 *
 * **Price and duration are never written here.** Each chapter names a pilot
 * listing by slug, and `resolveJourneys` copies its title, per-person price and
 * duration from `PILOT_EXPERIENCES` — the same definition the seed writes into
 * PostgreSQL. A journey's combined price is therefore the sum of real listing
 * prices and cannot drift from what a traveller is charged per chapter
 * (CLAUDE.md §7).
 *
 * What this file does own is editorial: the order, the suggested start times
 * and the privilege copy. Start times are a suggested running order, not
 * reserved slots — availability stays with each listing's own booking flow.
 *
 * **Privileges are not yet agreed with venues.** Every privilege ships with
 * `confirmed: false`, and the interface labels an unconfirmed privilege as a
 * request rather than a promise. Flip the flag only once the venue has signed
 * up to honour it.
 */

export type ChapterRole = "prelude" | "centerpiece" | "epilogue";

export const CHAPTER_ROLES: readonly ChapterRole[] = ["prelude", "centerpiece", "epilogue"];

export const CHAPTER_LABELS: Readonly<Record<ChapterRole, string>> = {
  prelude: "Prelude",
  centerpiece: "Centerpiece",
  epilogue: "Epilogue",
};

export interface VipPrivilege {
  readonly title: string;
  readonly detail: string;
  /** True only once the venue has agreed to honour it. */
  readonly confirmed: boolean;
}

/**
 * The moments a journey answers. VivenIQ maps a traveller's words onto one of
 * these and offers the journeys tagged with it.
 */
export type JourneyOccasion = "date" | "celebration" | "unwind" | "connoisseur" | "weekend";

export const JOURNEY_OCCASIONS: readonly JourneyOccasion[] = [
  "date",
  "celebration",
  "unwind",
  "connoisseur",
  "weekend",
];

/**
 * The transition between two acts, in minutes — enough to walk or take a short
 * cab between nearby venues, short enough that the evening keeps its thread.
 */
export const TRANSITION_MINUTES = { min: 15, max: 30 } as const;

interface ChapterDefinition {
  readonly role: ChapterRole;
  readonly experienceSlug: string;
  /** Suggested start, minutes after midnight (local time). */
  readonly startMinute: number;
  readonly privilege: VipPrivilege;
}

interface JourneyDefinition {
  readonly id: string;
  readonly title: string;
  readonly mood: string;
  readonly tagline: string;
  readonly occasions: readonly JourneyOccasion[];
  /** Two acts (prelude, centerpiece) or three (prelude, centerpiece, epilogue). */
  readonly chapters:
    | readonly [ChapterDefinition, ChapterDefinition]
    | readonly [ChapterDefinition, ChapterDefinition, ChapterDefinition];
}

/** Every pilot listing is priced in rupees (scripts/seed-pune-pilot.ts). */
export const JOURNEY_CURRENCY = "INR";

const at = (hour: number, minute = 0): number => hour * 60 + minute;

const FEATURED_DEFINITIONS: readonly JourneyDefinition[] = [
  {
    id: "nocturne-epicurean",
    title: "The Nocturne Epicurean",
    mood: "Indulgent",
    tagline: "From a slow pour-over to starlit cocktails, one unhurried evening of taste.",
    occasions: ["connoisseur", "date"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "third-wave-coffee-artisan-roastery-amanora",
        startMinute: at(16, 30),
        privilege: {
          title: "Roaster's cupping flight",
          detail: "A side-by-side cupping of the week's single origins, led by the barista.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "effingut-brewhouse-craft-tasting-seasons",
        startMinute: at(18, 15),
        privilege: {
          title: "Off-menu brewmaster taster",
          detail: "A pour from the brewhouse's current experimental batch, not on the board.",
          confirmed: false,
        },
      },
      {
        role: "epilogue",
        experienceSlug: "spice-factory-rooftop-cocktails-hadapsar",
        startMinute: at(21, 0),
        privilege: {
          title: "Reserved rooftop edge table",
          detail: "A table held at the parapet for your arrival.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "adrenaline-pulse",
    title: "The Adrenaline Pulse",
    mood: "Thrilling",
    tagline: "Crack the code, own the lanes, then toast the win.",
    occasions: ["celebration", "weekend"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "mystery-rooms-escape-challenge-amanora",
        startMinute: at(16, 0),
        privilege: {
          title: "Bonus clue token",
          detail: "One extra hint from the game master, held back for when the clock is tight.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "smaaash-vr-twilight-bowling-amanora",
        startMinute: at(17, 15),
        privilege: {
          title: "Priority VIP lane",
          detail: "Your lane is held for your arrival, so the evening runs without a queue.",
          confirmed: false,
        },
      },
      {
        role: "epilogue",
        experienceSlug: "the-beer-cafe-global-taps-amanora",
        startMinute: at(19, 30),
        privilege: {
          title: "Victory tasting paddle",
          detail: "A paddle of four guest taps for the table to share.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "mindful-sanctuary",
    title: "The Mindful Sanctuary",
    mood: "Restorative",
    tagline: "Golden hour by the water, stillness in the spa, supper under the trees.",
    occasions: ["unwind", "weekend"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "amanora-lake-sunset-walk-and-mindfulness",
        startMinute: at(17, 15),
        privilege: {
          title: "Guided breathwork at the water",
          detail: "Ten minutes of guided breathing at the lake's edge before the walk.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "o2-spa-aromatherapy-and-reflexology-seasons",
        startMinute: at(18, 45),
        privilege: {
          title: "Signature oil upgrade",
          detail: "Your therapist's signature blend in place of the house oil.",
          confirmed: false,
        },
      },
      {
        role: "epilogue",
        experienceSlug: "the-flour-works-european-garden-brunch",
        startMinute: at(20, 15),
        privilege: {
          title: "Complimentary dessert",
          detail: "The dark chocolate ganache, with the kitchen's compliments.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "grand-date-night",
    title: "The Grand Date Night",
    mood: "Romantic",
    tagline: "Garden afternoon, a private screen, and a fire-lit table for two.",
    occasions: ["date", "celebration"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "the-flour-works-european-garden-brunch",
        startMinute: at(16, 0),
        privilege: {
          title: "Quiet garden corner",
          detail: "A table set apart under the canopy.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "cinepolis-vip-luxury-cinema-seasons",
        startMinute: at(18, 30),
        privilege: {
          title: "Adjoining recliners",
          detail: "Two recliners seated together, held for the screening you book.",
          confirmed: false,
        },
      },
      {
        role: "epilogue",
        experienceSlug: "absolute-barbecues-wish-grill-seasons",
        startMinute: at(21, 45),
        privilege: {
          title: "Complimentary dessert",
          detail: "A shared dessert to close the evening.",
          confirmed: false,
        },
      },
    ],
  },
];

/**
 * The signature collection. Same rules as the featured arcs: every venue is a
 * pilot listing, every price is that listing's, every privilege unconfirmed.
 */
const SIGNATURE_DEFINITIONS: readonly JourneyDefinition[] = [
  {
    id: "starlit-romance",
    title: "The Starlit Romance",
    mood: "Romantic",
    tagline: "Skyline pours on an open-air rooftop, then a mezzanine dinner of craft flights.",
    occasions: ["date", "celebration"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "spice-factory-rooftop-cocktails-hadapsar",
        startMinute: at(17, 30),
        privilege: {
          title: "Parapet table for two",
          detail: "A two-top held at the rooftop edge, set for the sunset.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "effingut-brewhouse-craft-tasting-seasons",
        startMinute: at(20, 30),
        privilege: {
          title: "Mezzanine corner booth",
          detail: "The quieter booth above the floor, away from the bar.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "sunset-mindfulness-supper",
    title: "The Mindful Sanctuary & Garden Supper",
    mood: "Restorative",
    tagline: "A lakeside sunset, an hour at the potter's wheel, a slow supper in the garden.",
    occasions: ["unwind", "weekend"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "amanora-lake-sunset-walk-and-mindfulness",
        startMinute: at(17, 0),
        privilege: {
          title: "Golden-hour vantage point",
          detail: "Your guide walks you to the quietest stretch of the lakefront first.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "pottery-and-clay-wheel-workshop-magarpatta",
        startMinute: at(18, 45),
        privilege: {
          title: "Fired and delivered",
          detail: "The studio glazes and fires your piece, ready for collection.",
          confirmed: false,
        },
      },
      {
        role: "epilogue",
        experienceSlug: "the-flour-works-european-garden-brunch",
        startMinute: at(21, 0),
        privilege: {
          title: "Lantern-lit garden table",
          detail: "A table under the canopy, away from the door.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "pune-craft-pilgrimage",
    title: "The Craft Connoisseur’s Pilgrimage",
    mood: "Connoisseur",
    tagline: "A brewmaster’s flight in Kalyani Nagar, then hand-folded dim sum in Viman Nagar.",
    occasions: ["connoisseur", "weekend"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "toit-brewery-craft-beer-tasting-kalyani-viman",
        startMinute: at(16, 0),
        privilege: {
          title: "Cellar walk with the brewer",
          detail: "A few minutes among the fermenters before the flight is poured.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "shizusan-dimsum-sushi-tasting-phoenix-marketcity",
        startMinute: at(19, 0),
        privilege: {
          title: "Counter seats at the pass",
          detail: "Two seats facing the dim sum station, so you watch every fold.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "adrenaline-nightlife-sprint",
    title: "The High-Octane Celebration Arc",
    mood: "Celebratory",
    tagline: "Laser tag to warm up, a charcoal grill to refuel, a bidding bar to finish.",
    occasions: ["celebration", "weekend"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "timezone-laser-tag-seasons-mall",
        startMinute: at(16, 30),
        privilege: {
          title: "Private arena round",
          detail: "One round with the arena held for your party alone.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "absolute-barbecues-wish-grill-seasons",
        startMinute: at(18, 15),
        privilege: {
          title: "Celebration dessert",
          detail: "A dessert to the table for whoever the evening is for.",
          confirmed: false,
        },
      },
      {
        role: "epilogue",
        experienceSlug: "agent-jacks-interactive-bidding-bar",
        startMinute: at(20, 45),
        privilege: {
          title: "Reserved high table",
          detail: "A high table by the price board, held for your arrival.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "secret-mezzanine-date",
    title: "The Intimate Date Night",
    mood: "Romantic",
    tagline: "From a slow pour-over for two to wood-fired pizza under the brewery lights.",
    occasions: ["date"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "third-wave-coffee-artisan-roastery-amanora",
        startMinute: at(16, 30),
        privilege: {
          title: "Shared pour-over ritual",
          detail: "One origin brewed two ways at your table, so you can compare.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "toit-brewery-craft-beer-tasting-kalyani-viman",
        startMinute: at(18, 30),
        privilege: {
          title: "Upper-deck table",
          detail: "A table on the upper deck, clear of the ground-floor rush.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "fast-fun-weekend",
    title: "The Twilight Bowling & Bidding Sprint",
    mood: "Thrilling",
    tagline: "Strikes under the twilight lights, then a bar where the prices move with the room.",
    occasions: ["weekend", "celebration"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "smaaash-vr-twilight-bowling-amanora",
        startMinute: at(17, 30),
        privilege: {
          title: "Lane held on arrival",
          detail: "Your lane is ready when you walk in, with no queue at the counter.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "agent-jacks-interactive-bidding-bar",
        startMinute: at(19, 45),
        privilege: {
          title: "Opening-bid round",
          detail: "Your first round locked at the board's opening price.",
          confirmed: false,
        },
      },
    ],
  },
  {
    id: "artisanal-dessert-crawl",
    title: "The European Sourdough & Korean Bingsu Walk",
    mood: "Artisanal",
    tagline: "Clay on the wheel, sourdough in the garden, shaved-ice bingsu to close.",
    occasions: ["weekend", "unwind"],
    chapters: [
      {
        role: "prelude",
        experienceSlug: "pottery-and-clay-wheel-workshop-magarpatta",
        startMinute: at(14, 30),
        privilege: {
          title: "Studio apron to keep",
          detail: "The studio's canvas apron, yours to take home.",
          confirmed: false,
        },
      },
      {
        role: "centerpiece",
        experienceSlug: "the-flour-works-european-garden-brunch",
        startMinute: at(16, 45),
        privilege: {
          title: "Baker's loaf to take home",
          detail: "A small sourdough from the morning bake, wrapped for later.",
          confirmed: false,
        },
      },
      {
        role: "epilogue",
        experienceSlug: "cafe-peter-korean-bingsu-and-ramen-hadapsar",
        startMinute: at(19, 0),
        privilege: {
          title: "Bingsu for two",
          detail: "The large bingsu, plated to share.",
          confirmed: false,
        },
      },
    ],
  },
];

export interface JourneyChapter {
  readonly role: ChapterRole;
  readonly label: string;
  readonly experienceSlug: string;
  readonly experienceTitle: string;
  readonly addressLine: string;
  /** The listing's stored pin — the companion map routes to it. */
  readonly coordinates: { readonly lat: number; readonly lng: number };
  readonly startMinute: number;
  readonly endMinute: number;
  readonly durationMinutes: number;
  /** Copied from the listing; per person. */
  readonly priceMinor: number;
  /** Copied from the listing's curation record; 0 when none is claimed. */
  readonly timeSavedMinutes: number;
  readonly privilege: VipPrivilege;
  /** The listing's cover photograph and its alt text. */
  readonly coverImage: string;
  readonly coverAlt: string;
}

export interface Journey {
  readonly id: string;
  readonly title: string;
  readonly mood: string;
  readonly tagline: string;
  readonly occasions: readonly JourneyOccasion[];
  /** True for the four launch arcs the home page presents. */
  readonly featured: boolean;
  /** First start to last finish, including the walks between venues. */
  readonly totalDurationMinutes: number;
  /** Sum of the chapter prices, per person. */
  readonly totalPriceMinor: number;
  /** Sum of the chapters' curated time savings. */
  readonly timeSavedMinutes: number;
  readonly currency: string;
  readonly chapters: readonly JourneyChapter[];
  /** The centerpiece's cover photograph — the journey's face on a card. */
  readonly coverImage: string;
  readonly coverAlt: string;
}

export class JourneyDefinitionError extends Error {
  override readonly name = "JourneyDefinitionError";
}

function resolveChapter(
  journeyId: string,
  chapter: ChapterDefinition,
  catalogue: ReadonlyMap<string, PilotExperienceInput>,
): JourneyChapter {
  const listing = catalogue.get(chapter.experienceSlug);
  if (!listing) {
    throw new JourneyDefinitionError(
      `Journey "${journeyId}" names "${chapter.experienceSlug}", which is not in the catalogue.`,
    );
  }
  // A group-priced chapter cannot be summed with per-person ones without
  // knowing the party size. Refuse rather than print a misleading total.
  if (listing.pricingUnit !== "PER_PERSON") {
    throw new JourneyDefinitionError(
      `Journey "${journeyId}" chapter "${listing.slug}" is not priced per person.`,
    );
  }

  return {
    role: chapter.role,
    label: CHAPTER_LABELS[chapter.role],
    experienceSlug: listing.slug,
    experienceTitle: listing.title,
    addressLine: listing.addressLine,
    coordinates: { lat: listing.latitude, lng: listing.longitude },
    startMinute: chapter.startMinute,
    endMinute: chapter.startMinute + listing.durationMinutes,
    durationMinutes: listing.durationMinutes,
    priceMinor: listing.basePriceMinor,
    timeSavedMinutes: listing.curation.timeSavedMinutes,
    privilege: chapter.privilege,
    coverImage: listing.coverImageKey,
    coverAlt: listing.altText,
  };
}

function resolveJourney(
  definition: JourneyDefinition,
  catalogue: ReadonlyMap<string, PilotExperienceInput>,
  featured: boolean,
): Journey {
  const chapters = definition.chapters.map((chapter) =>
    resolveChapter(definition.id, chapter, catalogue),
  );

  if (definition.occasions.length === 0) {
    throw new JourneyDefinitionError(`Journey "${definition.id}" answers no occasion.`);
  }

  chapters.forEach((chapter, index) => {
    // Acts follow the arc in order: two acts are a prelude and a centerpiece,
    // three add the epilogue. Nothing is skipped or repeated.
    if (chapter.role !== CHAPTER_ROLES[index]) {
      throw new JourneyDefinitionError(
        `Journey "${definition.id}" chapter ${index + 1} must be the ${CHAPTER_ROLES[index]}.`,
      );
    }
    const previous = chapters[index - 1];
    if (!previous) return;
    if (chapter.startMinute < previous.endMinute) {
      throw new JourneyDefinitionError(
        `Journey "${definition.id}" ${chapter.role} starts before the ${previous.role} ends.`,
      );
    }
    const transition = chapter.startMinute - previous.endMinute;
    if (transition < TRANSITION_MINUTES.min || transition > TRANSITION_MINUTES.max) {
      throw new JourneyDefinitionError(
        `Journey "${definition.id}" leaves ${transition} minutes before the ${chapter.role}; ` +
          `transitions run ${TRANSITION_MINUTES.min}–${TRANSITION_MINUTES.max}.`,
      );
    }
  });

  const first = chapters[0]!;
  const last = chapters[chapters.length - 1]!;
  const cover = chapters.find((chapter) => chapter.role === "centerpiece") ?? first;

  return {
    id: definition.id,
    title: definition.title,
    mood: definition.mood,
    tagline: definition.tagline,
    occasions: definition.occasions,
    featured,
    totalDurationMinutes: last.endMinute - first.startMinute,
    totalPriceMinor: chapters.reduce((sum, chapter) => sum + chapter.priceMinor, 0),
    timeSavedMinutes: chapters.reduce((sum, chapter) => sum + chapter.timeSavedMinutes, 0),
    currency: JOURNEY_CURRENCY,
    chapters,
    coverImage: cover.coverImage,
    coverAlt: cover.coverAlt,
  };
}

function resolveAll(
  definitions: readonly JourneyDefinition[],
  catalogue: readonly PilotExperienceInput[],
  featured: boolean,
): Journey[] {
  const bySlug = new Map(catalogue.map((listing) => [listing.slug, listing]));
  return definitions.map((definition) => resolveJourney(definition, bySlug, featured));
}

/**
 * Resolve the featured journeys against a catalogue. Throws
 * `JourneyDefinitionError` on any inconsistency — a definition error is a
 * defect, not a runtime state, and the unit suite exercises it.
 */
export function resolveJourneys(
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
): readonly Journey[] {
  return resolveAll(FEATURED_DEFINITIONS, catalogue, true);
}

/** Resolve the whole curated collection — featured first, then signature. */
export function resolveCuratedJourneys(
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
): readonly Journey[] {
  const journeys = [
    ...resolveAll(FEATURED_DEFINITIONS, catalogue, true),
    ...resolveAll(SIGNATURE_DEFINITIONS, catalogue, false),
  ];
  const ids = new Set<string>();
  for (const journey of journeys) {
    if (ids.has(journey.id)) {
      throw new JourneyDefinitionError(`Journey id "${journey.id}" is defined twice.`);
    }
    ids.add(journey.id);
  }
  return journeys;
}

let cachedCurated: readonly Journey[] | undefined;

/** The whole curated collection, resolved once per process. */
export function listCuratedJourneys(): readonly Journey[] {
  cachedCurated ??= resolveCuratedJourneys();
  return cachedCurated;
}

/** The featured launch journeys — the home page's arc picker. */
export function listJourneys(): readonly Journey[] {
  return listCuratedJourneys().filter((journey) => journey.featured);
}

/** One curated journey by id, or undefined. */
export function findJourney(id: string): Journey | undefined {
  return listCuratedJourneys().find((journey) => journey.id === id);
}
