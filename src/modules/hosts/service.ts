import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { authorize, type Principal } from "@/modules/auth/authorization";
import { PERMISSIONS } from "@/modules/auth/permissions";
import type { AuditRepository } from "@/modules/auth/ports";
import {
  assessHostProfile,
  canEditProfile,
  canSubmitForVerification,
  type HostProfileAssessment,
} from "@/modules/hosts/profile";
import type {
  CreateHostInput,
  HostRecord,
  HostRepository,
  UpdateHostInput,
} from "@/modules/hosts/ports";

/**
 * Host onboarding (FR-05).
 *
 * Framework-free, like the auth service: it takes repositories and a clock and
 * returns plain values.
 *
 * Two rules run through every method here.
 *
 * **Ownership is derived, never accepted.** No method takes a host ID from the
 * caller to decide whose record to touch. The principal identifies the user,
 * the user identifies the host. A request cannot name a host it does not own,
 * because there is nowhere to put that name.
 *
 * **Authorization is checked here, not only at the route.** A route-only check
 * is one forgotten import away from an open endpoint, and it does not cover
 * worker jobs or internal callers.
 */

export interface HostDependencies {
  readonly hosts: HostRepository;
  readonly audit: AuditRepository;
  readonly now: () => Date;
}

export interface HostRequestContext {
  readonly ipAddress: string | null;
  readonly correlationId: string | null;
}

export interface HostProfileView {
  readonly host: HostRecord;
  readonly assessment: HostProfileAssessment;
  readonly canEdit: boolean;
  readonly canSubmit: boolean;
}

export class HostService {
  readonly #deps: HostDependencies;

  constructor(deps: HostDependencies) {
    this.#deps = deps;
  }

  #view(host: HostRecord): HostProfileView {
    const assessment = assessHostProfile(host);

    return {
      host,
      assessment,
      canEdit: canEditProfile(host.verificationStatus),
      canSubmit: canSubmitForVerification(host.verificationStatus) && assessment.isComplete,
    };
  }

  /**
   * The caller's own host record, resolved from the session.
   *
   * Returns null rather than throwing when there is no profile yet: "you have
   * not started onboarding" is a normal state the dashboard renders, not an
   * error.
   */
  async getOwnProfile(principal: Principal): Promise<HostProfileView | null> {
    authorize(principal, PERMISSIONS.HOST_PROFILE_MANAGE_OWN);

    const host = await this.#deps.hosts.findByUserId(principal.userId);
    return host ? this.#view(host) : null;
  }

  /**
   * Resolve the caller's host record or refuse.
   *
   * Used by the experience service, which cannot do anything useful for a user
   * who has not become a host.
   */
  async requireOwnHost(principal: Principal): Promise<HostRecord> {
    const host = await this.#deps.hosts.findByUserId(principal.userId);

    if (!host) {
      throw new ForbiddenError("Complete your host profile before managing experiences.", {
        reason: "no_host_profile",
      });
    }

    return host;
  }

  /** Begin onboarding. One profile per user, enforced by a unique constraint. */
  async createProfile(
    principal: Principal,
    input: Omit<CreateHostInput, "userId">,
    context: HostRequestContext,
  ): Promise<HostProfileView> {
    authorize(principal, PERMISSIONS.HOST_PROFILE_MANAGE_OWN);

    const existing = await this.#deps.hosts.findByUserId(principal.userId);
    if (existing) {
      throw new ConflictError("You already have a host profile.");
    }

    const host = await this.#deps.hosts.create({
      // From the session, never from the request body.
      userId: principal.userId,
      displayName: input.displayName,
      hostType: input.hostType,
      contactEmail: input.contactEmail,
    });

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: "host.profile.created",
      subjectType: "host",
      subjectId: host.id,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      after: { displayName: host.displayName, hostType: host.hostType },
    });

    return this.#view(host);
  }

  /**
   * Save progress.
   *
   * Partial by design — the onboarding form saves whatever has been filled in
   * so far. Completeness is asserted at submission, not on every keystroke.
   */
  async updateProfile(principal: Principal, input: UpdateHostInput): Promise<HostProfileView> {
    authorize(principal, PERMISSIONS.HOST_PROFILE_MANAGE_OWN);

    const host = await this.requireOwnHost(principal);

    if (!canEditProfile(host.verificationStatus)) {
      throw new ConflictError(
        host.verificationStatus === "PENDING"
          ? "Your profile is being reviewed and cannot be edited right now."
          : "A verified profile can only be changed by our team.",
        { verificationStatus: host.verificationStatus },
      );
    }

    const updated = await this.#deps.hosts.update(host.id, input);
    return this.#view(updated);
  }

  /**
   * Submit for verification (FR-05, FR-15).
   *
   * Completeness is re-derived from the stored record rather than trusted from
   * the client: the browser can be told the form is complete, but only the row
   * decides.
   */
  async submitForVerification(
    principal: Principal,
    context: HostRequestContext,
  ): Promise<HostProfileView> {
    authorize(principal, PERMISSIONS.HOST_PROFILE_MANAGE_OWN);

    const host = await this.requireOwnHost(principal);

    if (!canSubmitForVerification(host.verificationStatus)) {
      throw new ConflictError("This profile has already been submitted.", {
        verificationStatus: host.verificationStatus,
      });
    }

    const assessment = assessHostProfile(host);
    if (!assessment.isComplete) {
      throw new ValidationError("Complete your profile before submitting it for verification.", {
        missing: assessment.missing.map((entry) => entry.field),
      });
    }

    const submitted = await this.#deps.hosts.markSubmitted(host.id, this.#deps.now());

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: "host.verification.submitted",
      subjectType: "host",
      subjectId: host.id,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      before: { verificationStatus: host.verificationStatus },
      after: { verificationStatus: submitted.verificationStatus },
    });

    return this.#view(submitted);
  }

  /** A host record by id, for internal callers that already hold one. */
  async getById(id: string): Promise<HostRecord> {
    const host = await this.#deps.hosts.findById(id);
    if (!host) throw new NotFoundError("Host not found.");
    return host;
  }
}
