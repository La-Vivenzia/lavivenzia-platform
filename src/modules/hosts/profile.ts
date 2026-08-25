/**
 * Host profile rules (FR-05).
 *
 * Pure: no database, no framework. The service applies these decisions, the UI
 * renders them, and both get the same answer because there is only one.
 */

export const HOST_TYPES = ["INDIVIDUAL", "COMPANY"] as const;
export type HostType = (typeof HOST_TYPES)[number];

export const HOST_VERIFICATION_STATUSES = ["DRAFT", "PENDING", "VERIFIED", "REJECTED"] as const;
export type HostVerificationStatus = (typeof HOST_VERIFICATION_STATUSES)[number];

/** Field limits, shared by the Zod schemas and the domain so they cannot diverge. */
export const HOST_LIMITS = {
  displayName: { min: 2, max: 80 },
  legalName: { max: 160 },
  headline: { max: 120 },
  about: { min: 80, max: 2000 },
  city: { max: 80 },
  region: { max: 80 },
  phone: { max: 24 },
  websiteUrl: { max: 200 },
} as const;

/**
 * The editable shape of a host profile.
 *
 * Every field except the display name is nullable, which is what makes "save
 * and continue later" work without half-filled rows failing a NOT NULL. What
 * makes the profile *complete* is decided below, not by the column definitions.
 */
export interface HostProfileDraft {
  readonly displayName: string;
  readonly legalName: string | null;
  readonly hostType: HostType;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly websiteUrl: string | null;
  readonly headline: string | null;
  readonly about: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string;
}

export type HostProfileField = keyof HostProfileDraft;

export interface MissingField {
  readonly field: HostProfileField;
  readonly label: string;
}

export interface HostProfileAssessment {
  readonly isComplete: boolean;
  readonly missing: readonly MissingField[];
  /** Progress for the onboarding indicator. */
  readonly completed: number;
  readonly total: number;
}

const FIELD_LABELS: Partial<Record<HostProfileField, string>> = {
  displayName: "Display name",
  legalName: "Registered legal name",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  headline: "Headline",
  about: "About",
  city: "City",
};

/** Required of every host, whatever their type. */
const ALWAYS_REQUIRED: readonly HostProfileField[] = [
  "displayName",
  "contactEmail",
  "contactPhone",
  "city",
  "headline",
  "about",
];

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

/**
 * Which fields a given profile still needs before it can be submitted.
 *
 * A registered company must also supply its legal name: the brand a traveller
 * sees and the entity that is verified and eventually paid are different
 * things, and only the second one can be checked against a registry. An
 * individual host has no such entity, so requiring it there would be a field
 * nobody can fill.
 */
export function requiredFieldsFor(hostType: HostType): readonly HostProfileField[] {
  return hostType === "COMPANY" ? [...ALWAYS_REQUIRED, "legalName"] : ALWAYS_REQUIRED;
}

export function assessHostProfile(profile: HostProfileDraft): HostProfileAssessment {
  const required = requiredFieldsFor(profile.hostType);

  const missing = required
    .filter((field) => isBlank(profile[field] as string | null))
    .map((field) => ({ field, label: FIELD_LABELS[field] ?? field }));

  // The About text carries the whole first impression on a public host page, so
  // a two-word placeholder counts as missing rather than complete.
  const about = profile.about;
  if (about !== null && about.trim().length > 0 && about.trim().length < HOST_LIMITS.about.min) {
    missing.push({ field: "about", label: `About (at least ${HOST_LIMITS.about.min} characters)` });
  }

  return {
    isComplete: missing.length === 0,
    missing,
    completed: required.length - missing.filter((m) => required.includes(m.field)).length,
    total: required.length,
  };
}

/**
 * Whether the host may still change their profile.
 *
 * Locked while PENDING: an operations reviewer must decide on the profile they
 * were shown, not on one that moved underneath them. VERIFIED is locked for the
 * same reason in reverse — re-verification is an operations action, not a side
 * effect of a host editing a field.
 */
export function canEditProfile(status: HostVerificationStatus): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

export function canSubmitForVerification(status: HostVerificationStatus): boolean {
  return status === "DRAFT" || status === "REJECTED";
}
