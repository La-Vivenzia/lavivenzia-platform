import { ConflictError } from "@/lib/errors";

/**
 * Experience listing lifecycle (FR-07).
 *
 * FR-07 names the states; this file names who may move between them. The rule
 * that shapes everything else is that a host cannot publish their own listing —
 * approval sits between draft and published, and it belongs to Operations.
 */

export const EXPERIENCE_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export type ExperienceStatus = (typeof EXPERIENCE_STATUSES)[number];

/** Actions a host may take on their own listing. */
export const HOST_ACTIONS = ["submit", "withdraw", "archive", "restore"] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

/**
 * Host transitions, exhaustively.
 *
 * Anything absent is refused — the table is the authority, not a chain of `if`
 * statements that quietly permits an unlisted combination.
 */
const HOST_TRANSITIONS: Readonly<
  Record<HostAction, Readonly<Partial<Record<ExperienceStatus, ExperienceStatus>>>>
> = {
  submit: { DRAFT: "IN_REVIEW", REJECTED: "IN_REVIEW" },
  // A host can pull a listing back out of the queue while nobody has ruled on
  // it, which is cheaper for everyone than a reviewer reading a listing the
  // host already knows is wrong.
  withdraw: { IN_REVIEW: "DRAFT" },
  archive: {
    DRAFT: "ARCHIVED",
    REJECTED: "ARCHIVED",
    PUBLISHED: "ARCHIVED",
    SUSPENDED: "ARCHIVED",
  },
  restore: { ARCHIVED: "DRAFT" },
};

/**
 * Whether the host may change the content of the listing.
 *
 * DRAFT and REJECTED only. IN_REVIEW is locked so a reviewer decides on what
 * they were shown. PUBLISHED is locked because an edit that skipped review
 * would make approval meaningless — the listing a traveller books would not be
 * the one anybody approved.
 *
 * That is deliberately the conservative reading. FR-07 does not say what should
 * happen when a host wants to fix a typo on a live listing, and the two candidate
 * answers (allow it, or send the listing back to review on every edit) are a
 * product decision rather than an engineering one. Recorded as A-009; nothing is
 * blocked by it today because no listing can reach PUBLISHED until the
 * operations console exists.
 */
export function canEditContent(status: ExperienceStatus): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

export function canPerform(action: HostAction, status: ExperienceStatus): boolean {
  return HOST_TRANSITIONS[action][status] !== undefined;
}

/** Actions available from here, for rendering controls without duplicating the table. */
export function availableHostActions(status: ExperienceStatus): readonly HostAction[] {
  return HOST_ACTIONS.filter((action) => canPerform(action, status));
}

/**
 * Resolve the next status, or refuse.
 *
 * `ConflictError` rather than `ValidationError`: the request is well formed, it
 * is the current state of the record that makes it impossible. That distinction
 * is what lets the client tell "you typed something wrong" apart from "someone
 * else moved this while you had it open".
 */
export function applyHostAction(action: HostAction, from: ExperienceStatus): ExperienceStatus {
  const next = HOST_TRANSITIONS[action][from];

  if (next === undefined) {
    throw new ConflictError(`Cannot ${action} an experience that is ${from.toLowerCase()}.`, {
      action,
      from,
    });
  }

  return next;
}

/** Statuses a traveller could ever see. Used by future public queries. */
export const PUBLICLY_VISIBLE_STATUSES: readonly ExperienceStatus[] = ["PUBLISHED"];

export function isVisibleToTravellers(status: ExperienceStatus): boolean {
  return PUBLICLY_VISIBLE_STATUSES.includes(status);
}
