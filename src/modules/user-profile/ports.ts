import type { RoleKey } from "@/modules/auth/permissions";
import type { ProfileFieldChanges } from "@/modules/user-profile/profile";

/**
 * Persistence ports for account settings. Prisma implementations live in
 * `src/adapters/persistence/prisma/user-profile-repositories.ts`.
 */

export interface ProfileRecord {
  readonly id: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
  /** Raw JSON as stored; the service normalises it before anyone sees it. */
  readonly preferences: unknown;
  readonly roles: readonly RoleKey[];
  readonly emailVerifiedAt: Date | null;
  readonly mfaEnrolledAt: Date | null;
  readonly hasPassword: boolean;
  readonly createdAt: Date;
}

export interface AccountSessionRecord {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

export interface UserProfileRepository {
  /** Null for a missing or soft-deleted account. */
  findById(userId: string): Promise<ProfileRecord | null>;
  update(userId: string, changes: ProfileFieldChanges): Promise<ProfileRecord>;
  /** Kept off `ProfileRecord` so the hash is read only where it is needed. */
  findPasswordHash(userId: string): Promise<string | null>;
  /**
   * Store the new hash and revoke every other session, in one transaction.
   *
   * Together because the point of revoking is to evict whoever knew the old
   * password. If the hash were written and the revocation then failed, the
   * person being evicted would still be signed in.
   */
  replacePassword(input: {
    readonly userId: string;
    readonly passwordHash: string;
    readonly keepSessionId: string;
    readonly at: Date;
  }): Promise<{ readonly revokedSessions: number }>;
}

export interface AccountSessionRepository {
  /** Sessions that are neither revoked nor past absolute expiry. */
  listUnexpired(userId: string, now: Date): Promise<readonly AccountSessionRecord[]>;
  revokeAllExcept(userId: string, keepSessionId: string, at: Date): Promise<number>;
}
