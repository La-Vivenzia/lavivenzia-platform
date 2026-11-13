import type { CurationTrack } from "@/modules/discovery/curation";
import type { TasteGenomeAccountRepository } from "./ports";
import {
  defaultGenome,
  deleteTasteGenome,
  foldTelemetry,
  getTasteGenome,
  normalizeWeights,
  parseStoredGenome,
  saveTasteGenome,
  toStoredGenome,
} from "./repository";
import type {
  AcousticComfort,
  BeveragePalate,
  CalibrationAnswers,
  DietaryPhilosophy,
  SeatingPreference,
  TasteGenome,
  TelemetryEvent,
} from "./types";

/**
 * Taste Genome use cases: read, calibrate from onboarding, learn from
 * browsing, and anchor a guest genome to an account.
 *
 * Where a genome lives depends on who owns it. A guest's lives only in the
 * in-memory session store, keyed by their cookie. A signed-in patron's lives
 * in PostgreSQL (`users.preferences.tasteGenome`), with the session store as a
 * write-through cache so telemetry does not read the row on every batch.
 *
 * The genome is a ranking hint only. Nothing here states availability, price
 * or policy (CLAUDE.md §7); dietary philosophy in particular is a preference
 * for ordering results, never a claim that a venue can cater for it.
 */

/*
 * Calibration priors. Every track keeps a base weight so no track is ever
 * ruled out by one quiz. Seating and acoustic comfort say most about the kind
 * of evening a patron enjoys, so they lead; the bar palate is shared across
 * however many were chosen, so ticking all five cannot outweigh one seating
 * answer; dietary philosophy leans lightly, because it says what someone eats
 * far more than where they like to spend an evening.
 */
const BASE_WEIGHT = 1;
const SEATING_WEIGHT = 1.5;
const ACOUSTIC_WEIGHT = 1.5;
const BEVERAGE_WEIGHT = 1;
const DIETARY_WEIGHT = 0.5;

const SEATING_TRACKS: Readonly<Record<SeatingPreference, CurationTrack>> = {
  SECLUDED_BOOTH: "CONNOISSEUR",
  ALFRESCO_ROOFTOP: "ALFRESCO_SUNDOWNER",
  CHEF_COUNTER: "ARTISANAL_FOCUS",
  PRIVATE_DINING_SALON: "CONNOISSEUR",
};

const ACOUSTIC_TRACKS: Readonly<Record<AcousticComfort, CurationTrack>> = {
  WHISPER_CONVERSATION: "MINDFUL_WELLNESS",
  LIVE_JAZZ_ACOUSTIC: "ALFRESCO_SUNDOWNER",
  UPBEAT_LOUNGE: "HIGH_OCTANE_NIGHTLIFE",
};

const BEVERAGE_TRACKS: Readonly<Record<BeveragePalate, CurationTrack>> = {
  SINGLE_MALT_SPIRITS: "CONNOISSEUR",
  CRAFT_BREW_ARTISANAL: "ARTISANAL_FOCUS",
  FINE_WINE_CHAMPAGNE: "CONNOISSEUR",
  BOTANICAL_MIXOLOGY: "HIGH_OCTANE_NIGHTLIFE",
  ZERO_PROOF_TEMPERANCE: "MINDFUL_WELLNESS",
};

/** Flexible eaters carry no lean; every other philosophy points somewhere. */
const DIETARY_TRACKS: Readonly<Record<DietaryPhilosophy, CurationTrack | null>> = {
  PURE_VEGETARIAN: "MINDFUL_WELLNESS",
  JAIN_HAUTE: "CONNOISSEUR",
  SEAFOOD_CARNIVORE: "CONNOISSEUR",
  VEGAN_BOTANICAL: "MINDFUL_WELLNESS",
  OMNIVORE_FLEXIBLE: null,
};

export function calibratedWeights(answers: CalibrationAnswers): Record<CurationTrack, number> {
  const raw: Record<CurationTrack, number> = {
    CONNOISSEUR: BASE_WEIGHT,
    ALFRESCO_SUNDOWNER: BASE_WEIGHT,
    HIGH_OCTANE_NIGHTLIFE: BASE_WEIGHT,
    MINDFUL_WELLNESS: BASE_WEIGHT,
    ARTISANAL_FOCUS: BASE_WEIGHT,
  };
  raw[SEATING_TRACKS[answers.seating]] += SEATING_WEIGHT;
  raw[ACOUSTIC_TRACKS[answers.acoustic]] += ACOUSTIC_WEIGHT;

  const beverages = [...new Set(answers.beverages)];
  for (const beverage of beverages) {
    raw[BEVERAGE_TRACKS[beverage]] += BEVERAGE_WEIGHT / beverages.length;
  }

  const dietaryTrack = DIETARY_TRACKS[answers.dietary];
  if (dietaryTrack) raw[dietaryTrack] += DIETARY_WEIGHT;

  return normalizeWeights(raw);
}

/**
 * A genome recalibrated from answers.
 *
 * Recalibrating replaces the taste and the weights — the patron has told us
 * directly, which outranks anything inferred — but keeps the interaction
 * count, which is a history rather than a preference.
 */
function withAnswers(current: TasteGenome, answers: CalibrationAnswers, now: Date): TasteGenome {
  return {
    ...current,
    taste: {
      dietary: answers.dietary,
      beverages: [...new Set(answers.beverages)],
      seating: answers.seating,
      acoustic: answers.acoustic,
    },
    trackAffinity: calibratedWeights(answers),
    calibrated: true,
    updatedAt: now.toISOString(),
  };
}

const USER_PREFIX = "user:";

/** The account id behind a patron id, or null for a guest. */
export function accountIdOf(patronId: string): string | null {
  return patronId.startsWith(USER_PREFIX) ? patronId.slice(USER_PREFIX.length) : null;
}

export interface TasteGenomeDependencies {
  readonly accounts: TasteGenomeAccountRepository;
  readonly now: () => Date;
  /** Where degraded-but-handled failures are reported. Injected to keep logging out of the domain. */
  readonly warn: (message: string, reason: string) => void;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

export class TasteGenomeService {
  readonly #deps: TasteGenomeDependencies;

  constructor(deps: TasteGenomeDependencies) {
    this.#deps = deps;
  }

  /**
   * The stored genome, or an uncalibrated uniform one. Reading never creates a
   * guest session.
   *
   * An account read that fails degrades to the default rather than failing
   * the page: personalisation is never a dependency. A default that came from
   * a failure is not cached, so the next read tries the database again.
   */
  async getGenome(patronId: string): Promise<TasteGenome> {
    const now = this.#deps.now();
    const cached = getTasteGenome(patronId);
    if (cached) return cached;

    const userId = accountIdOf(patronId);
    if (!userId) return defaultGenome(patronId, now);

    try {
      const stored = parseStoredGenome(patronId, await this.#deps.accounts.load(userId));
      return saveTasteGenome(stored ?? defaultGenome(patronId, now));
    } catch (error) {
      this.#deps.warn(
        "taste genome could not be read from the account; serving the default",
        reasonOf(error),
      );
      return defaultGenome(patronId, now);
    }
  }

  /**
   * Seed the genome from onboarding answers.
   *
   * For an account, the database write must succeed before anything is
   * cached or returned: the patron is about to be told their taste is saved
   * to their profile, and that must be true.
   */
  async calibrate(patronId: string, answers: CalibrationAnswers): Promise<TasteGenome> {
    const now = this.#deps.now();
    const next = withAnswers(await this.getGenome(patronId), answers, now);

    const userId = accountIdOf(patronId);
    if (userId) await this.#deps.accounts.save(userId, toStoredGenome(next));
    return saveTasteGenome(next);
  }

  /**
   * Fold a batch of browsing events in.
   *
   * Best-effort for accounts: a failed write is logged and the cached genome
   * still moves, so the next successful batch carries the drift with it.
   */
  async processTelemetry(
    patronId: string,
    events: readonly TelemetryEvent[],
  ): Promise<TasteGenome> {
    const now = this.#deps.now();
    const next = saveTasteGenome(foldTelemetry(await this.getGenome(patronId), events, now));

    const userId = accountIdOf(patronId);
    if (userId) {
      try {
        await this.#deps.accounts.save(userId, toStoredGenome(next));
      } catch (error) {
        this.#deps.warn(
          "taste genome telemetry could not be persisted to the account",
          reasonOf(error),
        );
      }
    }
    return next;
  }

  /**
   * Move a guest's genome onto an account the patron has just proved they own.
   *
   * The answers come with the request rather than from the guest session, so
   * anchoring still works if the session was evicted or the server restarted
   * between calibrating and entering the code. What the session does add —
   * browsing history — is carried over when it is still there.
   */
  async anchor(input: {
    readonly userId: string;
    readonly guestPatronId: string | null;
    readonly answers: CalibrationAnswers;
    readonly fullName: string | null;
  }): Promise<TasteGenome> {
    const now = this.#deps.now();
    const patronId = `${USER_PREFIX}${input.userId}`;

    const account = await this.getGenome(patronId);
    const guest = input.guestPatronId ? getTasteGenome(input.guestPatronId) : null;
    const next = withAnswers(
      { ...account, interactionCount: account.interactionCount + (guest?.interactionCount ?? 0) },
      input.answers,
      now,
    );

    await this.#deps.accounts.anchor(input.userId, toStoredGenome(next), input.fullName);
    if (input.guestPatronId) deleteTasteGenome(input.guestPatronId);
    return saveTasteGenome(next);
  }
}
