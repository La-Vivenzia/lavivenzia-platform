import { NotFoundError, RateLimitedError, ValidationError } from "@/lib/errors";
import { authorize, type Principal } from "@/modules/auth/authorization";
import { PERMISSIONS } from "@/modules/auth/permissions";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import type { AuditRepository, RateLimiter } from "@/modules/auth/ports";
import { RATE_LIMITS, rateLimitKey } from "@/modules/auth/rate-limits";
import { lifetimeForRoles } from "@/modules/auth/service";
import { isSessionActive } from "@/modules/auth/session";
import {
  describeUserAgent,
  normalizePreferences,
  normalizeProfileChanges,
} from "@/modules/user-profile/profile";
import type {
  AccountSessionRepository,
  ProfileRecord,
  UserProfileRepository,
} from "@/modules/user-profile/ports";
import type {
  ChangePasswordInput,
  UpdateProfileInput,
  UserProfile,
  UserSessionItem,
} from "@/modules/user-profile/types";

/**
 * Account settings: profile, password and sessions.
 *
 * Framework-free, like the auth and host services. Two rules from those carry
 * over unchanged:
 *
 * **The account is the principal's.** No method takes a user ID from a caller.
 * There is no way to name someone else's profile, because there is nowhere to
 * put the name.
 *
 * **Authorization happens here.** Every method calls `authorize`, which also
 * applies the MFA gate — so an operator whose session has not cleared TOTP
 * cannot change the password through this door either.
 */

export interface UserProfileDependencies {
  readonly profiles: UserProfileRepository;
  readonly sessions: AccountSessionRepository;
  readonly audit: AuditRepository;
  readonly rateLimiter: RateLimiter;
  readonly now: () => Date;
}

export interface ProfileRequestContext {
  readonly ipAddress: string | null;
  readonly correlationId: string | null;
}

function toProfile(record: ProfileRecord): UserProfile {
  return {
    id: record.id,
    email: record.email,
    fullName: record.fullName,
    phone: record.phone,
    avatarUrl: record.avatarUrl,
    bio: record.bio,
    preferences: normalizePreferences(record.preferences),
    roles: record.roles,
    emailVerifiedAt: record.emailVerifiedAt?.toISOString() ?? null,
    mfaEnabled: record.mfaEnrolledAt !== null,
    hasPassword: record.hasPassword,
    createdAt: record.createdAt.toISOString(),
  };
}

export class UserProfileService {
  readonly #deps: UserProfileDependencies;

  constructor(deps: UserProfileDependencies) {
    this.#deps = deps;
  }

  async #requireRecord(userId: string): Promise<ProfileRecord> {
    const record = await this.#deps.profiles.findById(userId);
    // A live session for a missing account means it was deleted mid-session.
    if (!record) throw new NotFoundError("Account not found.");
    return record;
  }

  async getProfile(principal: Principal): Promise<UserProfile> {
    authorize(principal, PERMISSIONS.PROFILE_MANAGE_OWN, this.#deps.now());
    return toProfile(await this.#requireRecord(principal.userId));
  }

  async updateProfile(
    principal: Principal,
    input: UpdateProfileInput,
    context: ProfileRequestContext,
  ): Promise<UserProfile> {
    authorize(principal, PERMISSIONS.PROFILE_MANAGE_OWN, this.#deps.now());

    const changes = normalizeProfileChanges(input);
    const fields = Object.keys(changes);
    if (fields.length === 0) return this.getProfile(principal);

    const updated = await this.#deps.profiles.update(principal.userId, changes);

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: "user.profile.updated",
      subjectType: "user",
      subjectId: principal.userId,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      // Which fields, not their values. The audit log is read by more people
      // than the profile is, and a phone number does not need to be there.
      after: { fields },
    });

    return toProfile(updated);
  }

  /**
   * Change the password and sign out every other device.
   *
   * Other sessions are revoked because the usual reason to change a password
   * is suspicion that someone else knows it. The current session survives:
   * the person who just proved the old password should not be thrown out too.
   */
  async changePassword(
    principal: Principal,
    input: ChangePasswordInput,
    context: ProfileRequestContext,
  ): Promise<{ readonly revokedSessions: number }> {
    const now = this.#deps.now();
    authorize(principal, PERMISSIONS.PROFILE_MANAGE_OWN, now);

    const rule = RATE_LIMITS.passwordChangePerUser;
    const decision = await this.#deps.rateLimiter.consume(
      rateLimitKey("passwordChangePerUser", principal.userId),
      rule.limit,
      rule.windowMs,
      now,
    );
    if (!decision.allowed) {
      throw new RateLimitedError("Too many attempts. Please try again later.", {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }

    const currentHash = await this.#deps.profiles.findPasswordHash(principal.userId);
    if (currentHash === null) {
      // Setting a first password would switch a traveller from email codes to
      // password sign-in — and the OTP path refuses password accounts — so it
      // is a credential-model change, not a settings tweak.
      throw new ValidationError(
        "Your account signs in with an emailed code, so there is no password to change.",
      );
    }

    if (!(await verifyPassword(input.currentPassword, currentHash))) {
      await this.#deps.audit.record({
        actorId: principal.userId,
        sessionId: principal.sessionId,
        action: "user.password.change_failed",
        subjectType: "user",
        subjectId: principal.userId,
        ipAddress: context.ipAddress,
        correlationId: context.correlationId,
      });
      // 400 rather than 401: the session is fine, the answer was wrong. A 401
      // would read as "you have been signed out".
      throw new ValidationError("Your current password is not correct.", {
        field: "currentPassword",
      });
    }

    if (input.newPassword === input.currentPassword) {
      throw new ValidationError("Choose a new password that differs from your current one.", {
        field: "newPassword",
      });
    }

    // Enforces the length policy before hashing.
    const passwordHash = await hashPassword(input.newPassword);

    const { revokedSessions } = await this.#deps.profiles.replacePassword({
      userId: principal.userId,
      passwordHash,
      keepSessionId: principal.sessionId,
      at: now,
    });

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: "user.password.changed",
      subjectType: "user",
      subjectId: principal.userId,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      after: { revokedSessions },
    });

    return { revokedSessions };
  }

  /**
   * Live sessions, the current one first.
   *
   * Filtered with the same `isSessionActive` the resolver uses, so a session
   * that went idle — dead for authentication — is not listed as a device that
   * is still signed in.
   */
  async listSessions(principal: Principal): Promise<readonly UserSessionItem[]> {
    const now = this.#deps.now();
    authorize(principal, PERMISSIONS.PROFILE_MANAGE_OWN, now);

    const lifetime = lifetimeForRoles(principal.roles);
    const rows = await this.#deps.sessions.listUnexpired(principal.userId, now);

    return rows
      .filter((row) => isSessionActive(row, lifetime, now))
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        isCurrent: row.id === principal.sessionId,
        userAgent: row.userAgent,
        device: describeUserAgent(row.userAgent),
        ip: row.ipAddress,
      }))
      .sort((a, b) =>
        a.isCurrent !== b.isCurrent
          ? a.isCurrent
            ? -1
            : 1
          : b.lastSeenAt.localeCompare(a.lastSeenAt),
      );
  }

  async revokeOtherSessions(
    principal: Principal,
    context: ProfileRequestContext,
  ): Promise<{ readonly revokedSessions: number }> {
    const now = this.#deps.now();
    authorize(principal, PERMISSIONS.PROFILE_MANAGE_OWN, now);

    const revokedSessions = await this.#deps.sessions.revokeAllExcept(
      principal.userId,
      principal.sessionId,
      now,
    );

    await this.#deps.audit.record({
      actorId: principal.userId,
      sessionId: principal.sessionId,
      action: "user.sessions.revoked_others",
      subjectType: "user",
      subjectId: principal.userId,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      after: { revokedSessions },
    });

    return { revokedSessions };
  }
}
