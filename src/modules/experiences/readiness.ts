/**
 * What an experience needs before it can be submitted for review (FR-06).
 *
 * Pure. The editor renders this as a checklist, the service enforces it, and
 * the reviewer never receives a listing missing something a machine could have
 * caught.
 */

export const EXPERIENCE_LIMITS = {
  title: { min: 8, max: 120 },
  summary: { min: 20, max: 200 },
  description: { min: 200, max: 5000 },
  guestNotes: { max: 2000 },
  addressLine: { max: 200 },
  city: { max: 80 },
  region: { max: 80 },
  postalCode: { max: 16 },
  listItem: { max: 160 },
  listCount: { max: 12 },
  languages: { max: 8 },
  durationMinutes: { min: 15, max: 60 * 24 * 14 },
  guests: { min: 1, max: 500 },
  /** Ten million major units. A ceiling only, not a pricing policy. */
  basePriceMinor: { max: 1_000_000_000 },
  media: { min: 1, max: 12 },
} as const;

export const PRICING_UNITS = ["PER_PERSON", "PER_GROUP"] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

/** The subset of an experience that submission readiness depends on. */
export interface ExperienceReadinessInput {
  readonly title: string;
  readonly summary: string | null;
  readonly description: string | null;
  readonly categoryId: string | null;
  readonly city: string | null;
  readonly country: string;
  readonly durationMinutes: number | null;
  readonly maxGuests: number | null;
  readonly basePriceMinor: number | null;
  readonly media: readonly { readonly altText: string | null }[];
}

export interface ReadinessIssue {
  readonly field: string;
  readonly message: string;
}

export interface ExperienceReadiness {
  readonly isReady: boolean;
  readonly issues: readonly ReadinessIssue[];
  readonly completed: number;
  readonly total: number;
}

interface Requirement {
  readonly field: string;
  readonly message: string;
  readonly satisfied: (input: ExperienceReadinessInput) => boolean;
}

function filled(value: string | null, min = 1): boolean {
  return value !== null && value.trim().length >= min;
}

/**
 * The checklist.
 *
 * Declared as data rather than a function body so the editor can render it and
 * the service can enforce it from the same source. Adding a requirement is one
 * entry, not an edit in two places that drift.
 */
const REQUIREMENTS: readonly Requirement[] = [
  {
    field: "title",
    message: `Give the experience a title of at least ${EXPERIENCE_LIMITS.title.min} characters.`,
    satisfied: (e) => filled(e.title, EXPERIENCE_LIMITS.title.min),
  },
  {
    field: "summary",
    message: "Write a one-line summary travellers will see on cards.",
    satisfied: (e) => filled(e.summary, EXPERIENCE_LIMITS.summary.min),
  },
  {
    field: "description",
    message: `Describe the experience in at least ${EXPERIENCE_LIMITS.description.min} characters.`,
    satisfied: (e) => filled(e.description, EXPERIENCE_LIMITS.description.min),
  },
  {
    field: "categoryId",
    message: "Choose a category.",
    satisfied: (e) => e.categoryId !== null,
  },
  {
    field: "city",
    message: "Say where the experience takes place.",
    satisfied: (e) => filled(e.city),
  },
  {
    field: "durationMinutes",
    message: "Set how long the experience runs.",
    satisfied: (e) => e.durationMinutes !== null,
  },
  {
    field: "maxGuests",
    message: "Set the maximum number of guests.",
    satisfied: (e) => e.maxGuests !== null,
  },
  {
    field: "basePriceMinor",
    message: "Set your price.",
    // Zero is a valid price — a complimentary experience is a real listing.
    // Only an absent price is incomplete.
    satisfied: (e) => e.basePriceMinor !== null,
  },
  {
    field: "media",
    message: "Add at least one photograph.",
    satisfied: (e) => e.media.length >= EXPERIENCE_LIMITS.media.min,
  },
  {
    field: "media.altText",
    message: "Describe each photograph so the listing is usable with a screen reader.",
    // Vacuously true with no images; the requirement above covers that case, and
    // reporting both for an empty gallery is noise rather than guidance.
    satisfied: (e) => e.media.every((item) => filled(item.altText)),
  },
];

export function assessExperienceReadiness(input: ExperienceReadinessInput): ExperienceReadiness {
  const issues = REQUIREMENTS.filter((requirement) => !requirement.satisfied(input)).map(
    ({ field, message }) => ({ field, message }),
  );

  return {
    isReady: issues.length === 0,
    issues,
    completed: REQUIREMENTS.length - issues.length,
    total: REQUIREMENTS.length,
  };
}
