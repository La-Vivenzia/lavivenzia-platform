/**
 * Taste archetypes — a three-question profiler that points a traveller at one
 * curated journey.
 *
 * Deterministic: every option awards points to archetypes, the highest total
 * wins, and ties break by `ARCHETYPES` order. No model is involved, so the same
 * answers always produce the same match.
 *
 * Deliberately free of catalogue imports: this module ships to the browser with
 * the profiler, and the pilot catalogue does not need to come with it.
 */

export type ArchetypeId = "epicure" | "thrill-seeker" | "restorer" | "romantic";

export interface Archetype {
  readonly id: ArchetypeId;
  readonly name: string;
  readonly description: string;
  /** A journey id from `data.ts`; the unit suite checks every one resolves. */
  readonly journeyId: string;
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: "epicure",
    name: "The Epicure",
    description: "You travel by taste — the pour, the plate and the story behind both.",
    journeyId: "nocturne-epicurean",
  },
  {
    id: "thrill-seeker",
    name: "The Thrill Seeker",
    description: "You want a pulse in the evening: a challenge, a scoreboard, a win to toast.",
    journeyId: "adrenaline-pulse",
  },
  {
    id: "restorer",
    name: "The Restorer",
    description: "You go out to come back to yourself — quiet water, slow hands, good bread.",
    journeyId: "mindful-sanctuary",
  },
  {
    id: "romantic",
    name: "The Romantic",
    description: "You plan evenings around one other person, and every detail is for them.",
    journeyId: "grand-date-night",
  },
];

export interface ProfileOption {
  readonly id: string;
  readonly label: string;
  readonly weights: Readonly<Partial<Record<ArchetypeId, number>>>;
}

export interface ProfileQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly ProfileOption[];
}

export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [
  {
    id: "evening",
    prompt: "Your ideal evening begins with…",
    options: [
      { id: "aroma", label: "The aroma of something being brewed", weights: { epicure: 3 } },
      { id: "challenge", label: "A challenge with friends", weights: { "thrill-seeker": 3 } },
      { id: "quiet", label: "A quiet walk at golden hour", weights: { restorer: 3 } },
      { id: "someone", label: "Someone special across the table", weights: { romantic: 3 } },
    ],
  },
  {
    id: "pace",
    prompt: "The pace you want tonight…",
    options: [
      {
        id: "lingering",
        label: "Lingering — course after course",
        weights: { epicure: 2, romantic: 1 },
      },
      { id: "fast", label: "Fast and loud", weights: { "thrill-seeker": 2 } },
      { id: "slow", label: "Slow, almost still", weights: { restorer: 2 } },
      { id: "cinematic", label: "Cinematic, with a reveal", weights: { romantic: 2, epicure: 1 } },
    ],
  },
  {
    id: "memory",
    prompt: "What you want to remember…",
    options: [
      { id: "flavour", label: "A flavour you had never tasted", weights: { epicure: 2 } },
      { id: "win", label: "The moment you won", weights: { "thrill-seeker": 2 } },
      { id: "calm", label: "How calm you felt", weights: { restorer: 2 } },
      { id: "look", label: "The look on their face", weights: { romantic: 2 } },
    ],
  },
];

/** One option id per question, keyed by question id. */
export type ProfileAnswers = Readonly<Record<string, string>>;

export class ProfileAnswerError extends Error {
  override readonly name = "ProfileAnswerError";
}

/** Points per archetype for a complete set of answers. */
export function scoreAnswers(answers: ProfileAnswers): Record<ArchetypeId, number> {
  const scores: Record<ArchetypeId, number> = {
    epicure: 0,
    "thrill-seeker": 0,
    restorer: 0,
    romantic: 0,
  };

  for (const question of PROFILE_QUESTIONS) {
    const answer = answers[question.id];
    if (answer === undefined) {
      throw new ProfileAnswerError(`Question "${question.id}" is unanswered.`);
    }
    const option = question.options.find((candidate) => candidate.id === answer);
    if (!option) {
      throw new ProfileAnswerError(`"${answer}" is not an option for "${question.id}".`);
    }
    for (const [archetype, points] of Object.entries(option.weights) as [ArchetypeId, number][]) {
      scores[archetype] += points;
    }
  }

  return scores;
}

/** The archetype with the most points; ties go to the earlier in `ARCHETYPES`. */
export function matchArchetype(answers: ProfileAnswers): Archetype {
  const scores = scoreAnswers(answers);
  return ARCHETYPES.reduce((best, candidate) =>
    scores[candidate.id] > scores[best.id] ? candidate : best,
  );
}

/**
 * A display reference for a journey pass, e.g. "LV-3F9A-C21E".
 *
 * A stable FNV-1a hash of the inputs, formatted for print. It is **not** a
 * credential and not encrypted: there is no membership system behind it, and
 * nothing should ever accept it as proof of anything.
 */
export function passReference(...parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hex = hash.toString(16).toUpperCase().padStart(8, "0");
  return `LV-${hex.slice(0, 4)}-${hex.slice(4)}`;
}
