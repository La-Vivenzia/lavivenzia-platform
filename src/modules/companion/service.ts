import { NotFoundError, ValidationError } from "@/lib/errors";
import { CURATION_TRACK_LABELS, type CurationTrack } from "@/modules/discovery/curation";
import type { ExperienceDetail, ExperienceSummary } from "@/modules/discovery/ports";
import { VIBE_OPTIONS, type TravelPreferences } from "@/modules/user-profile/profile";
import { favouredTracks, tasteAffinity } from "@/modules/viveniq/tracks";
import type {
  CompanionDependencies,
  CompanionDispatchInput,
  CompanionDispatchResult,
  CompanionRecommendation,
  InJourneyRecommendations,
  InJourneyRequest,
  TravelMode,
} from "@/modules/companion/ports";

export const COMPANION_LIMITS = {
  /** "Walking distance or a short drive." */
  radiusMetres: 2_500,
  /** Beyond this a walk stops being the natural suggestion. */
  walkMaxMetres: 1_200,
  defaultRecommendations: 2,
  maxRecommendations: 3,
  /** Nearby listings considered — well above what a 2.5 km circle holds. */
  scan: 50,
  patronName: { max: 80 },
} as const;

/** ~4.8 km/h, an unhurried city walk. */
const WALK_METRES_PER_MINUTE = 80;
/** ~15 km/h door to door, which is what Pune traffic allows. */
const DRIVE_METRES_PER_MINUTE = 250;

/**
 * What follows each mood well. After a savoury table, coffee or a walk; after
 * an adrenaline hour, a slower pour. Zero means "the same evening again",
 * which a butler would not suggest.
 */
const COMPLEMENTS: Readonly<Record<CurationTrack, Partial<Record<CurationTrack, number>>>> = {
  CONNOISSEUR: { ARTISANAL_FOCUS: 3, MINDFUL_WELLNESS: 2, ALFRESCO_SUNDOWNER: 1 },
  ALFRESCO_SUNDOWNER: { CONNOISSEUR: 2, HIGH_OCTANE_NIGHTLIFE: 2, ARTISANAL_FOCUS: 1 },
  HIGH_OCTANE_NIGHTLIFE: { CONNOISSEUR: 3, ALFRESCO_SUNDOWNER: 2, ARTISANAL_FOCUS: 1 },
  MINDFUL_WELLNESS: { ARTISANAL_FOCUS: 3, ALFRESCO_SUNDOWNER: 2, CONNOISSEUR: 1 },
  ARTISANAL_FOCUS: { MINDFUL_WELLNESS: 2, ALFRESCO_SUNDOWNER: 2, CONNOISSEUR: 2 },
};

/** The butler's opening, keyed by where the traveller is now. */
const SEGUES: Readonly<Record<CurationTrack, string>> = {
  CONNOISSEUR: "After a table like that, the evening deserves a gentle close.",
  ALFRESCO_SUNDOWNER: "As the light fades, the neighbourhood has more to give.",
  HIGH_OCTANE_NIGHTLIFE: "After the adrenaline, the night wants a slower pour.",
  MINDFUL_WELLNESS: "Carry that calm a little further.",
  ARTISANAL_FOCUS: "Stay in this unhurried register a while longer.",
};

/**
 * Neighbourhoods, most specific first. Read from the listing's own address,
 * so a zone is never guessed from coordinates.
 */
const ZONES: readonly (readonly [string, RegExp])[] = [
  ["Kalyani Nagar", /kalyani/i],
  ["Viman Nagar", /viman/i],
  ["Koregaon Park", /koregaon/i],
  ["Amanora", /amanora/i],
  ["Magarpatta", /magarpatta|seasons mall/i],
  ["Hadapsar", /hadapsar/i],
];

export function zoneOf(
  experience: Pick<ExperienceDetail, "addressLine" | "title" | "city">,
): string {
  const text = `${experience.addressLine ?? ""} ${experience.title}`;
  return ZONES.find(([, pattern]) => pattern.test(text))?.[0] ?? experience.city ?? "the city";
}

function shortTitle(title: string): string {
  const head = title.split(/[:—]/)[0]!.trim();
  return head.length > 0 ? head : title;
}

function formatDistance(metres: number): string {
  return metres < 1_000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1_000).toFixed(1)} km`;
}

/** "~6-min walk · 450 m" or "~9-min drive · 2.1 km". */
export function describeJourney(metres: number): {
  readonly mode: TravelMode;
  readonly minutes: number;
  readonly label: string;
} {
  const mode: TravelMode = metres <= COMPANION_LIMITS.walkMaxMetres ? "walk" : "drive";
  const minutes = Math.max(
    mode === "walk" ? 1 : 3,
    Math.ceil(metres / (mode === "walk" ? WALK_METRES_PER_MINUTE : DRIVE_METRES_PER_MINUTE)),
  );
  return { mode, minutes, label: `~${minutes}-min ${mode} · ${formatDistance(metres)}` };
}

function normalisePatronName(name: string | undefined): string {
  const trimmed = name?.trim().replace(/\s+/g, " ").slice(0, COMPANION_LIMITS.patronName.max);
  return trimmed ? trimmed : "Dear guest";
}

export class CompanionService {
  readonly #deps: CompanionDependencies;

  constructor(deps: CompanionDependencies) {
    this.#deps = deps;
  }

  /**
   * Curated gems near the experience the traveller is at.
   *
   * Ranked by how well each complements the current mood, nudged by taste and
   * by proximity. Only listings our curators have written up qualify: a
   * butler recommends what they know, and a perk or secret is the point.
   */
  async getInJourneyRecommendations(input: InJourneyRequest): Promise<InJourneyRecommendations> {
    const limit = Math.min(
      Math.max(Math.trunc(input.limit ?? COMPANION_LIMITS.defaultRecommendations), 1),
      COMPANION_LIMITS.maxRecommendations,
    );
    const taste = input.tastePreferences ?? null;
    const patronName = normalisePatronName(input.patronName);

    // Throws NotFound for anything unpublished, exactly as the public page does.
    const active = await this.#deps.catalogue.getExperience(input.activeExperienceSlug);
    if (active.latitude === null || active.longitude === null) {
      throw new ValidationError("That experience has no location to curate around.", {
        slug: active.slug,
      });
    }

    const nearby = await this.#deps.catalogue.browse({
      near: {
        latitude: active.latitude,
        longitude: active.longitude,
        radiusMetres: COMPANION_LIMITS.radiusMetres,
      },
      sort: "distance",
      page: 1,
      pageSize: COMPANION_LIMITS.scan,
    });

    const activeTrack = active.curation?.curationTrack ?? null;

    const ranked = nearby.items
      .filter(
        (experience): experience is ExperienceSummary & { distanceMetres: number } =>
          experience.slug !== active.slug &&
          !!experience.curation &&
          experience.distanceMetres !== null &&
          experience.distanceMetres <= COMPANION_LIMITS.radiusMetres,
      )
      .map((experience) => ({
        experience,
        score: this.#score(experience, activeTrack, active.categoryKey, taste),
      }))
      .sort(
        (a, b) => b.score - a.score || a.experience.distanceMetres - b.experience.distanceMetres,
      );

    // One per track, so two suggestions are two different ideas.
    const chosen: (typeof ranked)[number][] = [];
    const tracks = new Set<CurationTrack>();
    for (const entry of ranked) {
      if (chosen.length >= limit) break;
      const track = entry.experience.curation!.curationTrack;
      if (tracks.has(track)) continue;
      chosen.push(entry);
      tracks.add(track);
    }
    for (const entry of ranked) {
      if (chosen.length >= limit) break;
      if (!chosen.includes(entry)) chosen.push(entry);
    }

    const recommendations = chosen.map(({ experience }) => this.#toRecommendation(experience));
    const zone = zoneOf(active);

    return {
      active: { slug: active.slug, title: active.title, zone },
      patronName,
      butlerNote: composeButlerNote({
        patronName: input.patronName?.trim() ? patronName : null,
        activeTitle: active.title,
        zone,
        activeTrack,
        recommendations,
        taste,
      }),
      recommendations,
    };
  }

  /**
   * Compute recommendations and send them as one email.
   *
   * Nothing curated nearby is reported as not-found rather than sent: an
   * empty butler email is worse than none.
   */
  async dispatch(input: CompanionDispatchInput): Promise<CompanionDispatchResult> {
    const result = await this.getInJourneyRecommendations(input);
    if (result.recommendations.length === 0) {
      throw new NotFoundError("Nothing curated within easy reach of that experience just yet.");
    }

    const { providerMessageId } = await this.#deps.email.send({
      to: input.to,
      template: "traveler.in-journey-companion",
      variables: {
        patronName: result.patronName,
        activeVenueTitle: shortTitle(result.active.title),
        activeZone: result.active.zone,
        butlerNote: result.butlerNote,
        recommendations: result.recommendations.map((recommendation) => ({
          title: recommendation.title,
          categoryName: recommendation.categoryName ?? recommendation.trackLabel,
          distanceOrTime: recommendation.distanceOrTime,
          curatorSecret: recommendation.curatorSecret,
          vipPerk: recommendation.vipPerk,
          experienceUrl: recommendation.experienceUrl,
        })),
      },
    });

    return { ...result, providerMessageId };
  }

  #score(
    experience: ExperienceSummary & { distanceMetres: number },
    activeTrack: CurationTrack | null,
    activeCategory: string | null,
    taste: TravelPreferences | null,
  ): number {
    const track = experience.curation!.curationTrack;
    const complement = activeTrack ? (COMPLEMENTS[activeTrack][track] ?? 0) : 1;
    // Another barbecue after a barbecue is a repeat, not a suggestion.
    const repeat = track === activeTrack && experience.categoryKey === activeCategory ? 1 : 0;
    const proximity = 1 - experience.distanceMetres / COMPANION_LIMITS.radiusMetres;

    return complement - repeat + tasteAffinity(experience, taste) + proximity * 1.5;
  }

  #toRecommendation(
    experience: ExperienceSummary & { distanceMetres: number },
  ): CompanionRecommendation {
    const curation = experience.curation!;
    const journey = describeJourney(experience.distanceMetres);
    const url = new URL(
      `/experiences/${encodeURIComponent(experience.slug)}`,
      this.#deps.appUrl,
    ).toString();

    return {
      slug: experience.slug,
      title: experience.title,
      categoryName: experience.categoryName,
      track: curation.curationTrack,
      trackLabel: CURATION_TRACK_LABELS[curation.curationTrack],
      distanceMetres: Math.round(experience.distanceMetres),
      mode: journey.mode,
      minutes: journey.minutes,
      distanceOrTime: journey.label,
      vipPerk: curation.vipPerks[0] ?? CURATION_TRACK_LABELS[curation.curationTrack],
      curatorSecret: curation.curatorSecret,
      curatedPairing: curation.curatedPairing ?? null,
      experienceUrl: url,
    };
  }
}

/**
 * The butler's note. Composed, not generated: every clause is a fact the
 * recommendations already carry, so the note can never disagree with them.
 */
export function composeButlerNote(input: {
  readonly patronName: string | null;
  readonly activeTitle: string;
  readonly zone: string;
  readonly activeTrack: CurationTrack | null;
  readonly recommendations: readonly CompanionRecommendation[];
  readonly taste: TravelPreferences | null;
}): string {
  const sentences: string[] = [];
  const where = `${shortTitle(input.activeTitle)} in ${input.zone}`;

  sentences.push(
    input.patronName ? `${input.patronName}, you’re at ${where}.` : `You’re at ${where}.`,
  );
  if (input.activeTrack) sentences.push(SEGUES[input.activeTrack]);

  const [first] = input.recommendations;
  if (!first) {
    sentences.push("Nothing we have curated is within easy reach just yet — enjoy where you are.");
    return sentences.join(" ");
  }

  sentences.push(`${shortTitle(first.title)} is a ${first.minutes}-minute ${first.mode} away.`);
  if (first.curatedPairing) sentences.push(`Our pairing there: ${first.curatedPairing}.`);

  const favoured = favouredTracks(input.taste);
  if (input.recommendations.some((recommendation) => favoured.has(recommendation.track))) {
    const vibes = VIBE_OPTIONS.filter((option) => input.taste?.vibes.includes(option.value)).map(
      (option) => option.label.toLowerCase(),
    );
    if (vibes.length > 0)
      sentences.push(`Chosen with your penchant for ${joinWords(vibes)} in mind.`);
  }

  sentences.push("One tap reserves your pass — then simply show up.");
  return sentences.join(" ");
}

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)!}`;
}
