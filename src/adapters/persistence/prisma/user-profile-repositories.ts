import type { PrismaClient } from "@/lib/db";
import { isRoleKey } from "@/modules/auth/permissions";
import type {
  AccountSessionRepository,
  ProfileRecord,
  UserProfileRepository,
} from "@/modules/user-profile/ports";

/** Prisma implementations of the account-settings ports. */

const PROFILE_SELECTION = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  bio: true,
  preferences: true,
  emailVerifiedAt: true,
  mfaEnrolledAt: true,
  passwordHash: true,
  createdAt: true,
  roles: { select: { role: { select: { key: true } } } },
} as const;

type ProfileRow = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  preferences: unknown;
  emailVerifiedAt: Date | null;
  mfaEnrolledAt: Date | null;
  passwordHash: string | null;
  createdAt: Date;
  roles: { role: { key: string } }[];
};

function toProfileRecord(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    preferences: row.preferences,
    // Filter rather than cast, as the auth repository does: a role key no
    // longer in code must not become a valid RoleKey.
    roles: row.roles.map((link) => link.role.key).filter(isRoleKey),
    emailVerifiedAt: row.emailVerifiedAt,
    mfaEnrolledAt: row.mfaEnrolledAt,
    // Only the fact of a password leaves this file, never the hash.
    hasPassword: row.passwordHash !== null,
    createdAt: row.createdAt,
  };
}

export function createUserProfileRepository(prisma: PrismaClient): UserProfileRepository {
  return {
    async findById(userId) {
      const row = await prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: PROFILE_SELECTION,
      });
      return row ? toProfileRecord(row) : null;
    },

    async update(userId, changes) {
      const { preferences, ...fields } = changes;
      const row = await prisma.$transaction(async (tx) => {
        if (preferences !== undefined) {
          // Merge the profile's own keys rather than replacing the column: the
          // Taste Genome keeps `tasteGenome` in the same JSON, and a settings
          // save must not erase it.
          const own = JSON.stringify({
            dietary: [...preferences.dietary],
            vibes: [...preferences.vibes],
            clusters: [...preferences.clusters],
          });
          await tx.$executeRaw`
            UPDATE "users"
            SET "preferences" =
              CASE WHEN jsonb_typeof("preferences") = 'object' THEN "preferences" ELSE '{}'::jsonb END
              || ${own}::jsonb
            WHERE "id" = ${userId}::uuid
          `;
        }
        return tx.user.update({ where: { id: userId }, data: fields, select: PROFILE_SELECTION });
      });
      return toProfileRecord(row);
    },

    async findPasswordHash(userId) {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      return row?.passwordHash ?? null;
    },

    async replacePassword({ userId, passwordHash, keepSessionId, at }) {
      return prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { passwordHash } });
        const revoked = await tx.session.updateMany({
          where: { userId, revokedAt: null, id: { not: keepSessionId } },
          data: { revokedAt: at },
        });
        return { revokedSessions: revoked.count };
      });
    },
  };
}

export function createAccountSessionRepository(prisma: PrismaClient): AccountSessionRepository {
  return {
    async listUnexpired(userId, now) {
      return prisma.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        select: {
          id: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          revokedAt: true,
          userAgent: true,
          ipAddress: true,
        },
        orderBy: { lastSeenAt: "desc" },
        // A bound, not a page size: nobody has fifty live devices, and an
        // account that does is one this screen should not try to render whole.
        take: 50,
      });
    },

    async revokeAllExcept(userId, keepSessionId, at) {
      const result = await prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: keepSessionId } },
        data: { revokedAt: at },
      });
      return result.count;
    },
  };
}
