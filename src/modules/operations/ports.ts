import type { ExperienceStatus } from "@/modules/experiences/lifecycle";
import type { HostVerificationStatus, HostType } from "@/modules/hosts/profile";
import type { ExperienceRecord } from "@/modules/experiences/ports";
import type { HostRecord } from "@/modules/hosts/ports";

/**
 * Persistence ports the operations domain owns.
 *
 * Distinct from the host-scoped ports on purpose. Those take a host ID and
 * refuse to answer without one; these deliberately read across every host,
 * which is exactly the capability `experience:read:all` grants. Keeping them in
 * separate interfaces means an unscoped query cannot be reached by accident
 * from the host surface — the two have no method in common.
 */

// Paging lives in the shared module: discovery needs the same clamp, and a
// page-size limit that differs between the console and the public site is a
// bug waiting to happen. Re-exported so existing imports are unchanged.
export { MAX_PAGE_SIZE, PAGE_SIZE } from "@/modules/shared/pagination";
export type { Page } from "@/modules/shared/pagination";

import type { Page } from "@/modules/shared/pagination";

// ── Queue rows ─────────────────────────────────────────────────────────────

/**
 * A listing as it appears in the review queue.
 *
 * Carries the host's display name so the table does not have to resolve it per
 * row. The alternative is a query per row, which is how a twenty-row page
 * becomes twenty-one round trips.
 */
export interface ExperienceQueueItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly status: ExperienceStatus;
  readonly city: string | null;
  readonly categoryName: string | null;
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly coverUrl: string | null;
  readonly submittedAt: Date | null;
  readonly updatedAt: Date;
  readonly hostId: string;
  readonly hostName: string;
  readonly hostVerification: HostVerificationStatus;
}

export interface HostQueueItem {
  readonly id: string;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly hostType: HostType;
  readonly contactEmail: string | null;
  readonly accountEmail: string;
  readonly city: string | null;
  readonly verificationStatus: HostVerificationStatus;
  readonly submittedAt: Date | null;
  readonly createdAt: Date;
  readonly experienceCount: number;
}

// ── Filters ────────────────────────────────────────────────────────────────

export interface ExperienceFilters {
  readonly status?: ExperienceStatus;
  readonly categoryId?: string;
  readonly hostId?: string;
  readonly city?: string;
  /** Free text over title and host name. */
  readonly search?: string;
  readonly submittedFrom?: Date;
  readonly submittedTo?: Date;
  readonly page: number;
  readonly pageSize: number;
}

export interface HostFilters {
  readonly status?: HostVerificationStatus;
  /** Free text over display name, legal name and both email addresses. */
  readonly search?: string;
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
  readonly page: number;
  readonly pageSize: number;
}

// ── Detail ─────────────────────────────────────────────────────────────────

/** A reviewer, resolved for display. Never the full user record. */
export interface ReviewerSummary {
  readonly id: string;
  readonly email: string;
}

export interface ExperienceDetail {
  readonly experience: ExperienceRecord;
  readonly categoryName: string | null;
  readonly host: HostRecord;
  readonly hostAccountEmail: string;
  readonly reviewer: ReviewerSummary | null;
}

export interface HostDetail {
  readonly host: HostRecord;
  readonly accountEmail: string;
  readonly reviewer: ReviewerSummary | null;
  readonly experienceCounts: Readonly<Partial<Record<ExperienceStatus, number>>>;
}

/** One line of review history, read from the existing audit log. */
export interface ReviewEvent {
  readonly id: string;
  readonly action: string;
  readonly actorEmail: string | null;
  readonly occurredAt: Date;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly note: string | null;
}

/** Counts the overview is built from. One query, not one per figure. */
export interface OperationsSummary {
  readonly hostsPending: number;
  readonly experiencesInReview: number;
  readonly experiencesPublished: number;
  readonly experiencesRejected: number;
  readonly experiencesSuspended: number;
  /** Oldest unreviewed submission, so the console can show how stale the queue is. */
  readonly oldestSubmissionAt: Date | null;
}

export interface OperationsRepository {
  summary(): Promise<OperationsSummary>;

  listExperiences(filters: ExperienceFilters): Promise<Page<ExperienceQueueItem>>;
  findExperience(id: string): Promise<ExperienceDetail | null>;

  listHosts(filters: HostFilters): Promise<Page<HostQueueItem>>;
  findHost(id: string): Promise<HostDetail | null>;

  /** Review history for one entity, read from `audit_logs`. */
  historyFor(
    subjectType: "experience" | "host",
    subjectId: string,
  ): Promise<readonly ReviewEvent[]>;
  /** Most recent decisions across everything, for the overview. */
  recentActivity(limit: number): Promise<readonly ReviewEvent[]>;

  recordExperienceDecision(input: {
    readonly id: string;
    readonly status: ExperienceStatus;
    readonly reviewerId: string;
    readonly reviewedAt: Date;
    readonly note: string | null;
    /** Set when publishing for the first time; never cleared afterwards. */
    readonly publishedAt: Date | null;
  }): Promise<void>;

  recordHostDecision(input: {
    readonly id: string;
    readonly status: HostVerificationStatus;
    readonly reviewerId: string;
    readonly reviewedAt: Date;
    readonly note: string | null;
  }): Promise<void>;
}
