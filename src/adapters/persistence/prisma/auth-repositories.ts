import type { PrismaClient } from "@/lib/db";
import type { RoleKey } from "@/modules/auth/permissions";
import { isRoleKey } from "@/modules/auth/permissions";
import type {
  AuditRepository,
  CreateSessionInput,
  OtpRepository,
  RateLimitDecision,
  RateLimiter,
  SessionRepository,
  StoredSession,
  UserRecord,
  UserRepository,
  UserStatus,
} from "@/modules/auth/ports";
import type { OtpChallengeState } from "@/modules/auth/otp";
import { InternalError } from "@/lib/errors";

/**
 * Prisma implementations of the auth ports.
 *
 * Lives in `src/adapters` so `src/modules` never imports a database driver
 * (ADR-0002). Wiring happens at the composition root in `src/lib/container.ts`.
 */

type UserRow = {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  mfaSecret: string | null;
  mfaEnrolledAt: Date | null;
  status: string;
  deletedAt: Date | null;
  roles: { role: { key: string } }[];
};

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    emailVerifiedAt: row.emailVerifiedAt,
    mfaSecret: row.mfaSecret,
    mfaEnrolledAt: row.mfaEnrolledAt,
    status: row.status as UserStatus,
    deletedAt: row.deletedAt,
    // Filter rather than cast: a role key that no longer exists in code must not
    // silently become a valid RoleKey and widen someone's permissions.
    roles: row.roles.map((link) => link.role.key).filter(isRoleKey),
  };
}

const USER_SELECTION = {
  id: true,
  email: true,
  passwordHash: true,
  emailVerifiedAt: true,
  mfaSecret: true,
  mfaEnrolledAt: true,
  status: true,
  deletedAt: true,
  roles: { select: { role: { select: { key: true } } } },
} as const;

export function createUserRepository(prisma: PrismaClient): UserRepository {
  return {
    async findByEmail(email) {
      const row = await prisma.user.findUnique({ where: { email }, select: USER_SELECTION });
      return row ? toUserRecord(row) : null;
    },

    async findById(id) {
      const row = await prisma.user.findUnique({ where: { id }, select: USER_SELECTION });
      return row ? toUserRecord(row) : null;
    },

    async createWithRole({ email, passwordHash, role, emailVerified }) {
      // One transaction: a user without their role would be an account that can
      // authenticate but do nothing, which is worse than a failed signup.
      const row = await prisma.$transaction(async (tx) => {
        const roleRow = await tx.role.findUnique({ where: { key: role }, select: { id: true } });
        if (!roleRow) {
          throw new InternalError(`Role '${role}' is not seeded. Run npm run db:seed.`);
        }

        return tx.user.create({
          data: {
            email,
            passwordHash,
            emailVerifiedAt: emailVerified ? new Date() : null,
            roles: { create: { roleId: roleRow.id } },
          },
          select: USER_SELECTION,
        });
      });

      return toUserRecord(row);
    },

    async markEmailVerified(userId, at) {
      await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: at } });
    },

    async setMfaSecret(userId, secret) {
      await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
    },

    async confirmMfaEnrolment(userId, at) {
      await prisma.user.update({ where: { id: userId }, data: { mfaEnrolledAt: at } });
    },

    async grantRole(userId, role: RoleKey) {
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { key: role },
        select: { id: true },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId: roleRow.id } },
        create: { userId, roleId: roleRow.id },
        update: {},
      });
    },
  };
}

const SESSION_SELECTION = {
  id: true,
  userId: true,
  createdAt: true,
  lastSeenAt: true,
  expiresAt: true,
  revokedAt: true,
  mfaSatisfiedAt: true,
} as const;

export function createSessionRepository(prisma: PrismaClient): SessionRepository {
  return {
    async create(input: CreateSessionInput): Promise<StoredSession> {
      return prisma.session.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          createdAt: input.now,
          lastSeenAt: input.now,
          expiresAt: input.expiresAt,
          mfaSatisfiedAt: input.mfaSatisfied ? input.now : null,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
        select: SESSION_SELECTION,
      });
    },

    async findByTokenHash(tokenHash) {
      return prisma.session.findUnique({ where: { tokenHash }, select: SESSION_SELECTION });
    },

    async touch(sessionId, at) {
      await prisma.session.update({ where: { id: sessionId }, data: { lastSeenAt: at } });
    },

    async markMfaSatisfied(sessionId, at) {
      await prisma.session.update({ where: { id: sessionId }, data: { mfaSatisfiedAt: at } });
    },

    async revoke(sessionId, at) {
      // updateMany, not update: revoking an already-deleted session must be a
      // no-op rather than a 500 on the logout path.
      await prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: at },
      });
    },

    async revokeAllForUser(userId, at) {
      const result = await prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: at },
      });
      return result.count;
    },
  };
}

export function createOtpRepository(prisma: PrismaClient): OtpRepository {
  return {
    async create(input) {
      await prisma.otpChallenge.create({
        data: {
          email: input.email,
          purpose: input.purpose,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          requestedIp: input.requestedIp,
        },
      });
    },

    async findActive(email, purpose): Promise<(OtpChallengeState & { id: string }) | null> {
      return prisma.otpChallenge.findFirst({
        where: { email, purpose, consumedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, codeHash: true, attempts: true, expiresAt: true, consumedAt: true },
      });
    },

    async recordFailedAttempt(challengeId) {
      await prisma.otpChallenge.update({
        where: { id: challengeId },
        data: { attempts: { increment: 1 } },
      });
    },

    async consume(challengeId, at) {
      await prisma.otpChallenge.updateMany({
        where: { id: challengeId, consumedAt: null },
        data: { consumedAt: at },
      });
    },

    async consumeAllForEmail(email, purpose, at) {
      await prisma.otpChallenge.updateMany({
        where: { email, purpose, consumedAt: null },
        data: { consumedAt: at },
      });
    },
  };
}

export function createRateLimiter(prisma: PrismaClient): RateLimiter {
  return {
    async consume(key, limit, windowMs, now = new Date()): Promise<RateLimitDecision> {
      const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

      // A single atomic statement. Read-then-write would let concurrent requests
      // each observe a count below the limit and all proceed, which is precisely
      // the burst a rate limiter exists to stop.
      //
      // The ON CONFLICT branch resets the counter when the stored window is
      // older than the current one, so windows roll without a separate sweep.
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO rate_limit_counters (key, window_start, count)
        VALUES (${key}, ${windowStart}, 1)
        ON CONFLICT (key) DO UPDATE
        SET count = CASE
              WHEN rate_limit_counters.window_start < ${windowStart} THEN 1
              ELSE rate_limit_counters.count + 1
            END,
            window_start = CASE
              WHEN rate_limit_counters.window_start < ${windowStart} THEN ${windowStart}
              ELSE rate_limit_counters.window_start
            END
        RETURNING count
      `;

      const count = rows[0]?.count ?? 1;
      const resetAt = windowStart.getTime() + windowMs;

      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
      };
    },
  };
}

export function createAuditRepository(prisma: PrismaClient): AuditRepository {
  return {
    async record(input) {
      await prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          sessionId: input.sessionId,
          action: input.action,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          ipAddress: input.ipAddress,
          correlationId: input.correlationId,
          before: input.before === undefined ? undefined : JSON.parse(JSON.stringify(input.before)),
          after: input.after === undefined ? undefined : JSON.parse(JSON.stringify(input.after)),
        },
      });
    },
  };
}
