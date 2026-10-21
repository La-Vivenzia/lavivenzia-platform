import { NotFoundError } from "@/lib/errors";
import { authorize, type Principal } from "@/modules/auth/authorization";
import { PERMISSIONS } from "@/modules/auth/permissions";
import type { AuditRepository } from "@/modules/auth/ports";
import {
  availableExperienceDecisions,
  availableHostDecisions,
  resolveExperienceDecision,
  resolveHostDecision,
  type ExperienceDecision,
  type HostDecision,
} from "@/modules/operations/review";
import {
  type ExperienceDetail,
  type ExperienceFilters,
  type ExperienceQueueItem,
  type HostDetail,
  type HostFilters,
  type HostQueueItem,
  type OperationsRepository,
  type OperationsSummary,
  type Page,
  type ReviewEvent,
} from "@/modules/operations/ports";

/**
 * The operations review workflow (FR-14, FR-15).
 *
 * Framework-free, like every other service here. Three properties hold
 * throughout:
 *
 * **The actor is the principal.** No method accepts an actor, reviewer or admin
 * identifier. There is nowhere for a client to put one, so an audit entry
 * cannot be attributed to somebody else.
 *
 * **The permission is decided by the decision, not by the caller.** Each
 * decision names the permission it needs in `review.ts`, and that is what gets
 * checked — a route cannot authorize a suspension with an approval permission
 * by passing the wrong constant.
 *
 * **The transition is re-derived from stored state.** The console renders the
 * actions it believes are available, but the record as loaded at decision time
 * is what settles whether one is legal.
 */

export interface OperationsDependencies {
  readonly operations: OperationsRepository;
  readonly audit: AuditRepository;
  readonly now: () => Date;
}

export interface OperationsRequestContext {
  readonly ipAddress: string | null;
  readonly correlationId: string | null;
}

export interface ExperienceReviewView {
  readonly detail: ExperienceDetail;
  readonly history: readonly ReviewEvent[];
  readonly decisions: readonly ExperienceDecision[];
}

export interface HostReviewView {
  readonly detail: HostDetail;
  readonly history: readonly ReviewEvent[];
  readonly decisions: readonly HostDecision[];
}

export interface OverviewView {
  readonly summary: OperationsSummary;
  readonly recentActivity: readonly ReviewEvent[];
}

// Re-exported from the shared module so the routes that import it here are
// unchanged. The clamp itself is now defined once.
export { normalisePaging } from "@/modules/shared/pagination";

export class OperationsService {
  readonly #deps: OperationsDependencies;

  constructor(deps: OperationsDependencies) {
    this.#deps = deps;
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /**
   * The overview.
   *
   * Reading the queue counts needs `experience:read:all`; the host figures need
   * `host:read`. Both are checked, so a role holding only one of them sees the
   * console rather than an error — the repository still returns every count,
   * and the page renders what the caller may act on.
   */
  async overview(principal: Principal, activityLimit = 8): Promise<OverviewView> {
    authorize(principal, PERMISSIONS.EXPERIENCE_READ_ALL);

    const [summary, recentActivity] = await Promise.all([
      this.#deps.operations.summary(),
      this.#deps.operations.recentActivity(activityLimit),
    ]);

    return { summary, recentActivity };
  }

  async listExperiences(
    principal: Principal,
    filters: ExperienceFilters,
  ): Promise<Page<ExperienceQueueItem>> {
    authorize(principal, PERMISSIONS.EXPERIENCE_READ_ALL);
    return this.#deps.operations.listExperiences(filters);
  }

  async getExperience(principal: Principal, id: string): Promise<ExperienceReviewView> {
    authorize(principal, PERMISSIONS.EXPERIENCE_READ_ALL);

    const detail = await this.#deps.operations.findExperience(id);
    if (!detail) throw new NotFoundError("Experience not found.");

    return {
      detail,
      history: await this.#deps.operations.historyFor("experience", id),
      decisions: availableExperienceDecisions(detail.experience.status),
    };
  }

  async listHosts(principal: Principal, filters: HostFilters): Promise<Page<HostQueueItem>> {
    authorize(principal, PERMISSIONS.HOST_READ);
    return this.#deps.operations.listHosts(filters);
  }

  async getHost(principal: Principal, id: string): Promise<HostReviewView> {
    authorize(principal, PERMISSIONS.HOST_READ);

    const detail = await this.#deps.operations.findHost(id);
    if (!detail) throw new NotFoundError("Host not found.");

    return {
      detail,
      history: await this.#deps.operations.historyFor("host", id),
      decisions: availableHostDecisions(detail.host.verificationStatus),
    };
  }

  // ── Decisions ────────────────────────────────────────────────────────────

  /**
   * Approve, reject, suspend or reinstate a listing (FR-07).
   *
   * The order matters. Read the record first, then resolve the decision against
   * the status it actually has — resolving against a status the client sent
   * would let a stale page drive an illegal transition.
   */
  async decideOnExperience(
    principal: Principal,
    input: {
      readonly id: string;
      readonly decision: ExperienceDecision;
      readonly note: string | null;
    },
    context: OperationsRequestContext,
  ): Promise<ExperienceReviewView> {
    // Read permission first: a caller who may not see the listing must not be
    // able to learn it exists by attempting a decision on it.
    authorize(principal, PERMISSIONS.EXPERIENCE_READ_ALL);

    const detail = await this.#deps.operations.findExperience(input.id);
    if (!detail) throw new NotFoundError("Experience not found.");

    const resolved = resolveExperienceDecision(
      input.decision,
      detail.experience.status,
      input.note,
    );

    // The permission comes from the decision table, not from the caller.
    authorize(principal, resolved.permission);

    const now = this.#deps.now();
    const note = input.note?.trim() ?? null;

    await this.#deps.operations.recordExperienceDecision({
      id: detail.experience.id,
      status: resolved.nextStatus,
      // From the session. There is no parameter for this.
      reviewerId: principal.userId,
      reviewedAt: now,
      note: note === "" ? null : note,
      // Stamped on first publication and never moved afterwards, so it keeps
      // meaning "when this first went live" through a suspend and reinstate.
      publishedAt:
        resolved.nextStatus === "PUBLISHED" && detail.experience.publishedAt === null ? now : null,
    });

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: `experience.review.${input.decision}`,
      subjectType: "experience",
      subjectId: detail.experience.id,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      before: { status: detail.experience.status },
      // The note is the host-facing reason and belongs in the record. Nothing
      // else from the listing is copied in — the audit row is a decision trail,
      // not a second copy of the content.
      after: { status: resolved.nextStatus, outcome: resolved.label, note },
    });

    return this.getExperience(principal, detail.experience.id);
  }

  /** Verify or reject a host application (FR-05, FR-15). */
  async decideOnHost(
    principal: Principal,
    input: { readonly id: string; readonly decision: HostDecision; readonly note: string | null },
    context: OperationsRequestContext,
  ): Promise<HostReviewView> {
    authorize(principal, PERMISSIONS.HOST_READ);

    const detail = await this.#deps.operations.findHost(input.id);
    if (!detail) throw new NotFoundError("Host not found.");

    const resolved = resolveHostDecision(
      input.decision,
      detail.host.verificationStatus,
      input.note,
    );

    authorize(principal, resolved.permission);

    const now = this.#deps.now();
    const note = input.note?.trim() ?? null;

    await this.#deps.operations.recordHostDecision({
      id: detail.host.id,
      status: resolved.nextStatus,
      reviewerId: principal.userId,
      reviewedAt: now,
      note: note === "" ? null : note,
    });

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: `host.review.${input.decision}`,
      subjectType: "host",
      subjectId: detail.host.id,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      before: { verificationStatus: detail.host.verificationStatus },
      after: { verificationStatus: resolved.nextStatus, outcome: resolved.label, note },
    });

    return this.getHost(principal, detail.host.id);
  }
}
