import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from "@/lib/errors";
import { authorize, type Principal } from "@/modules/auth/authorization";
import { PERMISSIONS } from "@/modules/auth/permissions";
import type { AuditRepository, RateLimiter } from "@/modules/auth/ports";
import { RATE_LIMITS, rateLimitKey, type RateLimitName } from "@/modules/auth/rate-limits";
import type { HostRecord } from "@/modules/hosts/ports";
import {
  applyHostAction,
  availableHostActions,
  canEditContent,
  type ExperienceStatus,
  type HostAction,
} from "@/modules/experiences/lifecycle";
import {
  assessExperienceReadiness,
  EXPERIENCE_LIMITS,
  type ExperienceReadiness,
} from "@/modules/experiences/readiness";
import { buildAvailableSlug } from "@/modules/experiences/slug";
import { validateImageUpload } from "@/modules/media/image";
import { buildStorageKey } from "@/modules/media/storage-key";
import type {
  CategoryRepository,
  ExperienceContentInput,
  ExperienceListItem,
  ExperienceRecord,
  ExperienceRepository,
  MediaRecord,
} from "@/modules/experiences/ports";
import type { StoragePort } from "@/ports/storage";

/**
 * Experience inventory (FR-06, FR-07).
 *
 * The single most important property in this file is that **every read and
 * every write is scoped to the host derived from the session**. No method
 * accepts a host ID. The repository's `findByIdForHost` requires one, so there
 * is no code path here that can reach a listing belonging to somebody else —
 * the insecure-direct-object-reference class of bug is closed by the shape of
 * the interface rather than by remembering to add a check.
 */

export interface ExperienceDependencies {
  readonly experiences: ExperienceRepository;
  readonly categories: CategoryRepository;
  readonly storage: StoragePort;
  readonly audit: AuditRepository;
  readonly rateLimiter: RateLimiter;
  readonly now: () => Date;
}

export interface ExperienceRequestContext {
  readonly ipAddress: string | null;
  readonly correlationId: string | null;
}

export interface ExperienceView {
  readonly experience: ExperienceRecord;
  readonly readiness: ExperienceReadiness;
  readonly canEdit: boolean;
  readonly actions: readonly HostAction[];
}

/** Upper bound on how many listings one host may hold in an unreviewed state. */
export const MAX_OPEN_DRAFTS = 50;

export class ExperienceService {
  readonly #deps: ExperienceDependencies;

  constructor(deps: ExperienceDependencies) {
    this.#deps = deps;
  }

  /**
   * Bound how often a host may take an expensive action.
   *
   * Keyed on the host rather than the IP: these are authenticated actions, so
   * the account is the meaningful subject, and a host on a shared office
   * connection should not be limited by a colleague.
   */
  async #enforceLimit(name: RateLimitName, hostId: string): Promise<void> {
    const rule = RATE_LIMITS[name];
    const decision = await this.#deps.rateLimiter.consume(
      rateLimitKey(name, hostId),
      rule.limit,
      rule.windowMs,
      this.#deps.now(),
    );

    if (!decision.allowed) {
      throw new RateLimitedError("Too many requests. Please try again shortly.", {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
  }

  #view(experience: ExperienceRecord): ExperienceView {
    return {
      experience,
      readiness: assessExperienceReadiness(experience),
      canEdit: canEditContent(experience.status),
      actions: availableHostActions(experience.status),
    };
  }

  /**
   * Load one of the host's own listings, or 404.
   *
   * A listing owned by someone else is reported as not found, not as forbidden.
   * A 403 would confirm the id exists, which is exactly the fact an enumeration
   * attempt is trying to establish.
   */
  async #requireOwn(host: HostRecord, experienceId: string): Promise<ExperienceRecord> {
    const experience = await this.#deps.experiences.findByIdForHost(experienceId, host.id);
    if (!experience) throw new NotFoundError("Experience not found.");
    return experience;
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  async listOwn(
    principal: Principal,
    host: HostRecord,
    options?: { readonly status?: ExperienceStatus },
  ): Promise<readonly ExperienceListItem[]> {
    authorize(principal, PERMISSIONS.EXPERIENCE_READ_OWN);
    return this.#deps.experiences.listForHost(host.id, options);
  }

  async getOwn(
    principal: Principal,
    host: HostRecord,
    experienceId: string,
  ): Promise<ExperienceView> {
    authorize(principal, PERMISSIONS.EXPERIENCE_READ_OWN);
    return this.#view(await this.#requireOwn(host, experienceId));
  }

  // ── Creation and editing ─────────────────────────────────────────────────

  /**
   * Create a draft.
   *
   * Only a title is required to start. Everything else is filled in over as
   * many sittings as the host needs, which is what "save as draft and continue
   * later" actually means — not a form that refuses to save until it is
   * finished.
   */
  async createDraft(
    principal: Principal,
    host: HostRecord,
    input: { readonly title: string },
    context: ExperienceRequestContext,
  ): Promise<ExperienceView> {
    authorize(principal, PERMISSIONS.EXPERIENCE_CREATE);

    // The cap below counts only unarchived listings, so archiving frees a slot.
    // On its own that bounds what a host *holds*, not how many rows they can
    // create — this is what bounds the second thing.
    await this.#enforceLimit("experienceCreatePerHost", host.id);

    // Not a business rule so much as an abuse bound: a scripted client should
    // not be able to fill the table while a human host never approaches it.
    const existing = await this.#deps.experiences.countForHost(host.id);
    if (existing >= MAX_OPEN_DRAFTS) {
      throw new ConflictError(
        "You have reached the maximum number of experiences. Archive one before creating another.",
        { limit: MAX_OPEN_DRAFTS },
      );
    }

    const slug = await buildAvailableSlug(input.title, (candidate) =>
      this.#deps.experiences.isSlugTaken(candidate),
    );

    const experience = await this.#deps.experiences.create({
      // From the resolved host, never from the request.
      hostId: host.id,
      slug,
      title: input.title,
    });

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: "experience.created",
      subjectType: "experience",
      subjectId: experience.id,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      after: { title: experience.title, slug: experience.slug },
    });

    return this.#view(experience);
  }

  /** Save edits to a draft. Partial: the editor saves a section at a time. */
  async updateContent(
    principal: Principal,
    host: HostRecord,
    experienceId: string,
    input: ExperienceContentInput,
  ): Promise<ExperienceView> {
    authorize(principal, PERMISSIONS.EXPERIENCE_UPDATE_OWN);

    const experience = await this.#requireOwn(host, experienceId);
    this.#assertEditable(experience);

    if (input.categoryId != null && !(await this.#deps.categories.exists(input.categoryId))) {
      throw new ValidationError("That category does not exist.", { categoryId: input.categoryId });
    }

    // Cross-field rules the database also enforces. Checked here so the host
    // gets a sentence rather than a constraint-violation error, and there so
    // the invariant holds no matter which code path writes the row.
    const minGuests = input.minGuests ?? experience.minGuests;
    const maxGuests = input.maxGuests === undefined ? experience.maxGuests : input.maxGuests;

    if (maxGuests !== null && maxGuests < minGuests) {
      throw new ValidationError("Maximum guests cannot be fewer than the minimum.", {
        minGuests,
        maxGuests,
      });
    }

    const latitude = input.latitude === undefined ? experience.latitude : input.latitude;
    const longitude = input.longitude === undefined ? experience.longitude : input.longitude;

    if ((latitude === null) !== (longitude === null)) {
      // A half-set coordinate looks like a location and maps to nowhere.
      throw new ValidationError("Provide both a latitude and a longitude, or neither.");
    }

    return this.#view(await this.#deps.experiences.updateContent(experience.id, input));
  }

  #assertEditable(experience: ExperienceRecord): void {
    if (canEditContent(experience.status)) return;

    throw new ConflictError(
      experience.status === "IN_REVIEW"
        ? "This experience is being reviewed. Withdraw it to make changes."
        : `A ${experience.status.toLowerCase().replace("_", " ")} experience cannot be edited.`,
      { status: experience.status },
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Move a listing through the lifecycle (FR-07).
   *
   * Submission re-derives readiness from the stored row. The editor shows the
   * same checklist, but the client is not the authority on whether a listing is
   * finished — otherwise the checklist is advice rather than a gate.
   */
  async performAction(
    principal: Principal,
    host: HostRecord,
    experienceId: string,
    action: HostAction,
    context: ExperienceRequestContext,
  ): Promise<ExperienceView> {
    authorize(
      principal,
      action === "submit" ? PERMISSIONS.EXPERIENCE_SUBMIT : PERMISSIONS.EXPERIENCE_UPDATE_OWN,
    );

    const experience = await this.#requireOwn(host, experienceId);
    const nextStatus = applyHostAction(action, experience.status);

    if (action === "submit") {
      const readiness = assessExperienceReadiness(experience);
      if (!readiness.isReady) {
        throw new ValidationError("This experience is not ready to submit.", {
          issues: readiness.issues.map((issue) => issue.field),
        });
      }
    }

    const now = this.#deps.now();

    const updated = await this.#deps.experiences.updateStatus(experience.id, {
      status: nextStatus,
      // Recorded only on submission, and cleared on withdrawal so the review
      // queue orders by a time that means something.
      ...(action === "submit" ? { submittedAt: now } : {}),
      ...(action === "withdraw" ? { submittedAt: null } : {}),
    });

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: `experience.${action}`,
      subjectType: "experience",
      subjectId: experience.id,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      before: { status: experience.status },
      after: { status: updated.status },
    });

    return this.#view(updated);
  }

  // ── Media ────────────────────────────────────────────────────────────────

  /**
   * Attach an image.
   *
   * Order matters: validate the bytes, store them, then record the row. A row
   * is never written for an object that does not exist. The reverse ordering
   * can leave a gallery referring to nothing, which renders as a broken image
   * on a listing a host believed was finished.
   */
  async addMedia(
    principal: Principal,
    host: HostRecord,
    experienceId: string,
    upload: { readonly bytes: Uint8Array; readonly declaredType: string },
  ): Promise<MediaRecord> {
    authorize(principal, PERMISSIONS.EXPERIENCE_UPDATE_OWN);

    // Before the bytes are inspected: an upload is the most expensive thing a
    // host can ask for, and each accepted one is up to 8 MB of stored data.
    await this.#enforceLimit("mediaUploadPerHost", host.id);

    const experience = await this.#requireOwn(host, experienceId);
    this.#assertEditable(experience);

    if (experience.media.length >= EXPERIENCE_LIMITS.media.max) {
      throw new ConflictError(
        `An experience can have at most ${EXPERIENCE_LIMITS.media.max} photographs.`,
      );
    }

    const validated = validateImageUpload(upload);
    const key = buildStorageKey(experience.id, validated.extension);

    const stored = await this.#deps.storage.put({
      key,
      contentType: validated.contentType,
      bytes: upload.bytes,
    });

    return this.#deps.experiences.addMedia({
      experienceId: experience.id,
      storageKey: stored.key,
      url: stored.url,
      contentType: validated.contentType,
      byteSize: validated.byteSize,
      position: await this.#deps.experiences.nextMediaPosition(experience.id),
    });
  }

  async updateMedia(
    principal: Principal,
    host: HostRecord,
    experienceId: string,
    mediaId: string,
    input: { readonly altText?: string | null; readonly position?: number },
  ): Promise<MediaRecord> {
    authorize(principal, PERMISSIONS.EXPERIENCE_UPDATE_OWN);

    const experience = await this.#requireOwn(host, experienceId);
    this.#assertEditable(experience);

    // Scoped by experience as well as by id, so a media id belonging to another
    // listing cannot be steered into this one.
    const updated = await this.#deps.experiences.updateMedia(mediaId, experience.id, input);
    if (!updated) throw new NotFoundError("Image not found.");

    return updated;
  }

  /**
   * Detach an image and delete the bytes.
   *
   * The row goes first. If the object delete then fails, the result is an
   * orphaned file — invisible, costing storage — rather than a gallery entry
   * pointing at something that no longer exists. Of the two failure modes, only
   * one is visible to a traveller.
   */
  async removeMedia(
    principal: Principal,
    host: HostRecord,
    experienceId: string,
    mediaId: string,
  ): Promise<void> {
    authorize(principal, PERMISSIONS.EXPERIENCE_UPDATE_OWN);

    const experience = await this.#requireOwn(host, experienceId);
    this.#assertEditable(experience);

    const storageKey = await this.#deps.experiences.removeMedia(mediaId, experience.id);
    if (!storageKey) throw new NotFoundError("Image not found.");

    await this.#deps.storage.remove(storageKey);
  }
}
