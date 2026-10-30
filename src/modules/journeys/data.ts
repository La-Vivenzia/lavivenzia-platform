import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";

/**
 * Curated journeys — three pilot listings sequenced into one evening.
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
  readonly chapters: readonly [ChapterDefinition, ChapterDefinition, ChapterDefinition];
}

/** Every pilot listing is priced in rupees (scripts/seed-pune-pilot.ts). */
export const JOURNEY_CURRENCY = "INR";

const at = (hour: number, minute = 0): number => hour * 60 + minute;

const JOURNEY_DEFINITIONS: readonly JourneyDefinition[] = [
  {
    id: "nocturne-epicurean",
    title: "The Nocturne Epicurean",
    mood: "Indulgent",
    tagline: "From a slow pour-over to starlit cocktails, one unhurried evening of taste.",
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

export interface JourneyChapter {
  readonly role: ChapterRole;
  readonly label: string;
  readonly experienceSlug: string;
  readonly experienceTitle: string;
  readonly addressLine: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly durationMinutes: number;
  /** Copied from the listing; per person. */
  readonly priceMinor: number;
  readonly privilege: VipPrivilege;
}

export interface Journey {
  readonly id: string;
  readonly title: string;
  readonly mood: string;
  readonly tagline: string;
  /** First start to last finish, including the walks between venues. */
  readonly totalDurationMinutes: number;
  /** Sum of the chapter prices, per person. */
  readonly totalPriceMinor: number;
  readonly currency: string;
  readonly chapters: readonly JourneyChapter[];
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
    startMinute: chapter.startMinute,
    endMinute: chapter.startMinute + listing.durationMinutes,
    durationMinutes: listing.durationMinutes,
    priceMinor: listing.basePriceMinor,
    privilege: chapter.privilege,
  };
}

function resolveJourney(
  definition: JourneyDefinition,
  catalogue: ReadonlyMap<string, PilotExperienceInput>,
): Journey {
  const chapters = definition.chapters.map((chapter) =>
    resolveChapter(definition.id, chapter, catalogue),
  );

  chapters.forEach((chapter, index) => {
    if (chapter.role !== CHAPTER_ROLES[index]) {
      throw new JourneyDefinitionError(
        `Journey "${definition.id}" chapter ${index + 1} must be the ${CHAPTER_ROLES[index]}.`,
      );
    }
    const previous = chapters[index - 1];
    if (previous && chapter.startMinute < previous.endMinute) {
      throw new JourneyDefinitionError(
        `Journey "${definition.id}" ${chapter.role} starts before the ${previous.role} ends.`,
      );
    }
  });

  const first = chapters[0]!;
  const last = chapters[chapters.length - 1]!;

  return {
    id: definition.id,
    title: definition.title,
    mood: definition.mood,
    tagline: definition.tagline,
    totalDurationMinutes: last.endMinute - first.startMinute,
    totalPriceMinor: chapters.reduce((sum, chapter) => sum + chapter.priceMinor, 0),
    currency: JOURNEY_CURRENCY,
    chapters,
  };
}

/**
 * Resolve every journey against a catalogue. Throws `JourneyDefinitionError`
 * on any inconsistency — a definition error is a defect, not a runtime state,
 * and the unit suite exercises it.
 */
export function resolveJourneys(
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
): readonly Journey[] {
  const bySlug = new Map(catalogue.map((listing) => [listing.slug, listing]));
  return JOURNEY_DEFINITIONS.map((definition) => resolveJourney(definition, bySlug));
}

let cached: readonly Journey[] | undefined;

/** The curated journeys, resolved once per process. */
export function listJourneys(): readonly Journey[] {
  cached ??= resolveJourneys();
  return cached;
}
