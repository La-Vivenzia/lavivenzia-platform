import type { RoleKey } from "@/modules/auth/permissions";
import type { OtpChallengeState } from "@/modules/auth/otp";

/**
 * Persistence ports the auth domain owns.
 *
 * The domain depends on these interfaces; Prisma implementations live in
 * `src/adapters/persistence` and are injected at the composition root. This is
 * what keeps `src/modules` free of framework and driver imports (ADR-0002).
 */

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string | null;
  readonly emailVerifiedAt: Date | null;
  readonly mfaSecret: string | null;
  readonly mfaEnrolledAt: Date | null;
  readonly status: UserStatus;
  readonly deletedAt: Date | null;
  readonly roles: readonly RoleKey[];
}

export interface StoredSession {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly mfaSatisfiedAt: Date | null;
}

export interface CreateSessionInput {
  readonly userId: string;
  readonly tokenHash: string;
  /**
   * Creation time, supplied by the caller rather than left to a database
   * default. Mixing the two sources means `expiresAt` is computed from the app
   * clock while `lastSeenAt` comes from the database clock, so any skew between
   * the app server and PostgreSQL corrupts the idle-timeout calculation.
   */
  readonly now: Date;
  readonly expiresAt: Date;
  readonly mfaSatisfied: boolean;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** Creates the user and grants the role in one transaction. */
  createWithRole(input: {
    readonly email: string;
    readonly passwordHash: string | null;
    readonly role: RoleKey;
    readonly emailVerified: boolean;
  }): Promise<UserRecord>;
  markEmailVerified(userId: string, at: Date): Promise<void>;
  setMfaSecret(userId: string, secret: string): Promise<void>;
  confirmMfaEnrolment(userId: string, at: Date): Promise<void>;
  grantRole(userId: string, role: RoleKey): Promise<void>;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<StoredSession>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  touch(sessionId: string, at: Date): Promise<void>;
  markMfaSatisfied(sessionId: string, at: Date): Promise<void>;
  revoke(sessionId: string, at: Date): Promise<void>;
  /** Used on credential change and on suspension — kills every live session. */
  revokeAllForUser(userId: string, at: Date): Promise<number>;
}

export interface OtpRepository {
  create(input: {
    readonly email: string;
    readonly purpose: "LOGIN" | "EMAIL_VERIFICATION";
    readonly codeHash: string;
    readonly expiresAt: Date;
    readonly requestedIp: string | null;
  }): Promise<void>;
  /** Most recent unconsumed challenge for this address and purpose. */
  findActive(
    email: string,
    purpose: "LOGIN" | "EMAIL_VERIFICATION",
  ): Promise<(OtpChallengeState & { readonly id: string }) | null>;
  recordFailedAttempt(challengeId: string): Promise<void>;
  consume(challengeId: string, at: Date): Promise<void>;
  /** Invalidate outstanding challenges when a new one is issued. */
  consumeAllForEmail(
    email: string,
    purpose: "LOGIN" | "EMAIL_VERIFICATION",
    at: Date,
  ): Promise<void>;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Atomically increments the window counter and reports whether to proceed. */
  consume(key: string, limit: number, windowMs: number, now?: Date): Promise<RateLimitDecision>;
}

export interface AuditRepository {
  record(input: {
    readonly actorId: string | null;
    readonly sessionId: string | null;
    readonly action: string;
    readonly subjectType: string;
    readonly subjectId: string | null;
    readonly ipAddress: string | null;
    readonly correlationId: string | null;
    readonly before?: unknown;
    readonly after?: unknown;
  }): Promise<void>;
}
