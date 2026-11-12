import { formatClock, formatDuration, formatMoneyMinor } from "@/lib/format";
import { timeSavedLabel } from "@/modules/discovery/curation";
import type { Journey, JourneyOccasion } from "@/modules/journeys/data";
import type { TravelPreferences, VibeKey } from "@/modules/user-profile/profile";
import { seenJourneyKey, type VivenIQJourney } from "@/modules/viveniq/options";

export { seenJourneyKey };

/**
 * Experience curation mode — VivenIQ's answer to "plan a date night".
 *
 * A question about an evening is not a question about a venue. When the
 * traveller describes an occasion, VivenIQ offers whole curated journeys —
 * two or three acts sequenced, priced and privileged as one — alongside the
 * single-venue picks.
 *
 * Deterministic and invented-nothing (CLAUDE.md §7): journeys come from the
 * curated collection, whose every price and duration is a listing's own. This
 * module only decides which occasion was asked for and which journeys answer
 * it, in what order.
 */

/* --------------------------------------------------------------- occasions */

export interface OccasionIntent {
  readonly key: JourneyOccasion;
  /** Whether the traveller's words ask for it. Tested on normalised text. */
  readonly asks: RegExp;
  /** How the reply names it: "for your {label}". */
  readonly label: string;
}

/**
 * Checked in order; the first match wins. A "chill birthday" is still a
 * birthday, so celebrations precede unwinding; a "date" outranks both. A bare
 * "party" is deliberately absent: "party of 6" is a headcount, not a theme.
 */
export const OCCASION_INTENTS: readonly OccasionIntent[] = [
  {
    key: "date",
    asks: /\b(date|date night|dates|romantic|romance|anniversary|partner|girlfriend|boyfriend|wife|husband|couple|proposal|propose|valentine\w*)\b/,
    label: "date night",
  },
  {
    key: "celebration",
    asks: /\b(birthday|bday|celebrat\w*|bachelor\w*|bachelorette|promotion|farewell|reunion|birthday party)\b/,
    label: "celebration",
  },
  {
    key: "unwind",
    asks: /\b(chill|chilled|unwind|relax\w*|calm|quiet|slow evening|recharge|sukoon|peaceful|self[- ]care)\b/,
    label: "slower evening",
  },
  {
    key: "connoisseur",
    asks: /\b(connoisseur|foodie|epicure\w*|gourmet|crawl|tasting (trail|journey|tour))\b/,
    label: "tasting evening",
  },
  {
    key: "weekend",
    asks: /\b(weekend|plan|plans|planning|outing|evening|night out|day out|things to do|itinerary)\b/,
    label: "evening out",
  },
];

/** The occasion a message describes, or null when it asks for something specific. */
export function detectOccasion(normalisedText: string): OccasionIntent | null {
  return OCCASION_INTENTS.find((occasion) => occasion.asks.test(normalisedText)) ?? null;
}

/* --------------------------------------------------------------- selection */

/** Which occasions each stated vibe leans toward. */
const VIBE_OCCASIONS: Readonly<Record<VibeKey, readonly JourneyOccasion[]>> = {
  craft_breweries: ["connoisseur"],
  culinary_tastings: ["connoisseur", "date"],
  sunset_retreats: ["unwind"],
  adventure: ["celebration"],
};

/**
 * Up to `limit` journeys that answer the occasion. Journeys that lead with it
 * come first, then taste nudges between equals, then catalogue order. Journeys
 * already shown are dropped when the traveller asked for something different,
 * and otherwise sink below unseen ones.
 */
export function selectJourneys(input: {
  readonly journeys: readonly Journey[];
  readonly occasion: OccasionIntent;
  readonly taste?: TravelPreferences | null | undefined;
  readonly seen: ReadonlySet<string>;
  readonly wantsMore: boolean;
  readonly limit: number;
}): Journey[] {
  const favoured = new Set((input.taste?.vibes ?? []).flatMap((vibe) => VIBE_OCCASIONS[vibe]));
  const avoidsHighEnergy =
    !!input.taste && input.taste.vibes.length > 0 && !input.taste.vibes.includes("adventure");

  const weight = (journey: Journey) => {
    let score = journey.occasions[0] === input.occasion.key ? 2 : 0;
    if (journey.occasions.some((occasion) => favoured.has(occasion))) score += 1;
    if (avoidsHighEnergy && journey.occasions.includes("celebration")) score -= 1;
    return score;
  };

  const order = new Map(input.journeys.map((journey, index) => [journey.id, index]));
  const seen = (journey: Journey) => input.seen.has(seenJourneyKey(journey.id));

  return input.journeys
    .filter((journey) => journey.occasions.includes(input.occasion.key))
    .filter((journey) => !(input.wantsMore && seen(journey)))
    .sort(
      (a, b) =>
        Number(seen(a)) - Number(seen(b)) ||
        weight(b) - weight(a) ||
        order.get(a.id)! - order.get(b.id)!,
    )
    .slice(0, input.limit);
}

/* ------------------------------------------------------------------- wire */

/**
 * A journey as the chat renders it. Every figure is copied from the journey,
 * which copied it from the listings; covers come from what discovery returned
 * this turn and are null when it returned none.
 */
export function toVivenIQJourney(
  journey: Journey,
  covers: ReadonlyMap<string, { readonly url: string; readonly alt: string }>,
): VivenIQJourney {
  const price = formatMoneyMinor(journey.totalPriceMinor, journey.currency);
  return {
    id: journey.id,
    title: journey.title,
    mood: journey.mood,
    tagline: journey.tagline,
    durationLabel: formatDuration(journey.totalDurationMinutes) ?? "",
    priceLabel: price === null ? null : `${price} / person`,
    timeSavedLabel: timeSavedLabel(journey.timeSavedMinutes),
    acts: journey.chapters.map((chapter) => {
      const cover = covers.get(chapter.experienceSlug);
      return {
        role: chapter.role,
        label: chapter.label,
        slug: chapter.experienceSlug,
        title: chapter.experienceTitle,
        place: chapter.addressLine,
        startLabel: formatClock(chapter.startMinute),
        privilegeTitle: chapter.privilege.title,
        privilegeConfirmed: chapter.privilege.confirmed,
        coverUrl: cover?.url ?? null,
        coverAlt: cover?.alt ?? "",
      };
    }),
  };
}

const COUNT_WORDS = ["one", "two", "three", "four", "five"] as const;

function joinTitles(titles: readonly string[]): string {
  if (titles.length <= 1) return titles.join("");
  return `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)!}`;
}

/**
 * The reply's lead when journeys are offered. Deterministic, and free of
 * digits, so it can sit before a model-phrased sentence without tripping the
 * factual-claim guard.
 */
export function composeJourneyLead(
  occasion: OccasionIntent,
  journeys: readonly Pick<Journey, "title">[],
): string {
  const count = COUNT_WORDS[journeys.length - 1] ?? String(journeys.length);
  const arcs =
    journeys.length === 1 ? "one complete evening arc" : `${count} complete evening arcs`;
  return (
    `Rather than isolated venues, I have sequenced ${arcs} for your ${occasion.label} — ` +
    `${joinTitles(journeys.map((journey) => journey.title))}. ` +
    "Each is a single booking with one VIP pass: pay once, then simply show up."
  );
}
