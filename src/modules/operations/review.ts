import { ConflictError, ValidationError } from "@/lib/errors";
import { PERMISSIONS, type PermissionKey } from "@/modules/auth/permissions";
import type { ExperienceStatus } from "@/modules/experiences/lifecycle";
import type { HostVerificationStatus } from "@/modules/hosts/profile";

/**
 * Operations review decisions (FR-07, FR-14, FR-15).
 *
 * Pure. This file is the authority on three questions, and nothing else in the
 * codebase is allowed a second opinion on any of them:
 *
 *   1. which decisions exist,
 *   2. which permission each one needs,
 *   3. which state each one may be taken from, and what it produces.
 *
 * Declared as tables rather than as branching code. A transition that is not in
 * the table cannot happen — there is no `else` for someone to widen later.
 */

// ── Experiences ────────────────────────────────────────────────────────────

export const EXPERIENCE_DECISIONS = ["approve", "reject", "suspend", "reinstate"] as const;
export type ExperienceDecision = (typeof EXPERIENCE_DECISIONS)[number];

interface DecisionRule<TStatus extends string> {
  /** Statuses this decision may be taken from, and the status it produces. */
  readonly from: Readonly<Partial<Record<TStatus, TStatus>>>;
  readonly permission: PermissionKey;
  /**
   * Whether a written reason is mandatory.
   *
   * Required wherever the decision costs the host something. A rejection they
   * cannot act on is a dead end, and a listing suspended without explanation
   * reads as the platform breaking. Approval needs no justification.
   */
  readonly requiresNote: boolean;
  /** Shown in the console and written to the audit trail. */
  readonly label: string;
}

const EXPERIENCE_RULES: Readonly<Record<ExperienceDecision, DecisionRule<ExperienceStatus>>> = {
  approve: {
    from: { IN_REVIEW: "PUBLISHED" },
    permission: PERMISSIONS.EXPERIENCE_APPROVE,
    requiresNote: false,
    label: "Approved and published",
  },
  reject: {
    from: { IN_REVIEW: "REJECTED" },
    permission: PERMISSIONS.EXPERIENCE_APPROVE,
    requiresNote: true,
    label: "Changes requested",
  },
  suspend: {
    // Only from PUBLISHED. Suspending a draft is meaningless — it is already
    // invisible — and allowing it would put a listing in a state its own host
    // cannot recover from.
    from: { PUBLISHED: "SUSPENDED" },
    permission: PERMISSIONS.EXPERIENCE_SUSPEND,
    requiresNote: true,
    label: "Suspended",
  },
  reinstate: {
    from: { SUSPENDED: "PUBLISHED" },
    permission: PERMISSIONS.EXPERIENCE_SUSPEND,
    requiresNote: false,
    label: "Reinstated",
  },
};

// ── Hosts ──────────────────────────────────────────────────────────────────

export const HOST_DECISIONS = ["verify", "reject"] as const;
export type HostDecision = (typeof HOST_DECISIONS)[number];

const HOST_RULES: Readonly<Record<HostDecision, DecisionRule<HostVerificationStatus>>> = {
  verify: {
    from: { PENDING: "VERIFIED" },
    permission: PERMISSIONS.HOST_VERIFY,
    requiresNote: false,
    label: "Verified",
  },
  reject: {
    from: { PENDING: "REJECTED" },
    permission: PERMISSIONS.HOST_VERIFY,
    requiresNote: true,
    label: "Changes requested",
  },
};

// ── Shared resolution ──────────────────────────────────────────────────────

export interface ResolvedDecision<TStatus extends string> {
  readonly nextStatus: TStatus;
  readonly permission: PermissionKey;
  readonly label: string;
}

export const REVIEW_NOTE_LIMITS = { min: 10, max: 2000 } as const;

function resolve<TDecision extends string, TStatus extends string>(
  rules: Readonly<Record<TDecision, DecisionRule<TStatus>>>,
  decision: TDecision,
  current: TStatus,
  note: string | null,
  /** Carries its own article, so the sentence reads correctly for both. */
  subject: string,
): ResolvedDecision<TStatus> {
  const rule = rules[decision];
  const nextStatus = rule.from[current];

  if (nextStatus === undefined) {
    // Conflict, not validation: the request is well formed, the record has
    // moved. Two reviewers opening the same queue item is the ordinary way this
    // happens, and the second one needs to be told that rather than shown a
    // field error.
    // Phrased so the decision verb needs no conjugation. Appending "d" gives
    // "approved" and "reinstated" but also "rejectd", "suspendd" and "verifyd".
    throw new ConflictError(
      `Cannot ${decision} ${subject} that is ${current.toLowerCase().replace("_", " ")}.`,
      { decision, from: current },
    );
  }

  if (rule.requiresNote) {
    const trimmed = note?.trim() ?? "";

    if (trimmed.length < REVIEW_NOTE_LIMITS.min) {
      throw new ValidationError(
        `Explain the decision in at least ${REVIEW_NOTE_LIMITS.min} characters. The host sees this.`,
        { decision },
      );
    }
  }

  return { nextStatus, permission: rule.permission, label: rule.label };
}

export function resolveExperienceDecision(
  decision: ExperienceDecision,
  current: ExperienceStatus,
  note: string | null,
): ResolvedDecision<ExperienceStatus> {
  return resolve(EXPERIENCE_RULES, decision, current, note, "an experience");
}

export function resolveHostDecision(
  decision: HostDecision,
  current: HostVerificationStatus,
  note: string | null,
): ResolvedDecision<HostVerificationStatus> {
  return resolve(HOST_RULES, decision, current, note, "a host");
}

/** Decisions available from a status, for rendering controls without duplicating the table. */
export function availableExperienceDecisions(
  status: ExperienceStatus,
): readonly ExperienceDecision[] {
  return EXPERIENCE_DECISIONS.filter((decision) => EXPERIENCE_RULES[decision].from[status]);
}

export function availableHostDecisions(status: HostVerificationStatus): readonly HostDecision[] {
  return HOST_DECISIONS.filter((decision) => HOST_RULES[decision].from[status]);
}

export function experienceDecisionRequiresNote(decision: ExperienceDecision): boolean {
  return EXPERIENCE_RULES[decision].requiresNote;
}

export function hostDecisionRequiresNote(decision: HostDecision): boolean {
  return HOST_RULES[decision].requiresNote;
}

/** The permission a decision needs, for a client deciding what to offer. */
export function experienceDecisionPermission(decision: ExperienceDecision): PermissionKey {
  return EXPERIENCE_RULES[decision].permission;
}

export function hostDecisionPermission(decision: HostDecision): PermissionKey {
  return HOST_RULES[decision].permission;
}
