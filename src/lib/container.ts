import { prisma } from "@/lib/db";
import { env, isProduction } from "@/lib/env";
import { getLogger } from "@/lib/logger";
import { AuthService } from "@/modules/auth/service";
import {
  createAuditRepository,
  createOtpRepository,
  createRateLimiter,
  createSessionRepository,
  createUserRepository,
} from "@/adapters/persistence/prisma/auth-repositories";

/**
 * Composition root.
 *
 * The one place allowed to know both the domain and its concrete adapters.
 * Everything else depends on interfaces, which is what keeps `src/modules`
 * free of driver imports (ADR-0002).
 */

/**
 * Deliver a login code.
 *
 * The SES adapter is a boundary with no implementation yet, so there is no way
 * to actually send mail. Rather than pretend, this logs the code in development
 * and refuses in production — a silent no-op would make every traveller login
 * fail with no explanation.
 *
 * Replace with the email port once the SES adapter is built. Tracked in
 * PROJECT_STATE.md.
 */
async function deliverOtp(email: string, code: string): Promise<void> {
  if (isProduction) {
    // Failing loudly is the safe behaviour: a production deploy that cannot send
    // mail must not appear to succeed while every user is locked out.
    throw new Error("No email transport is configured; cannot deliver login codes.");
  }

  // Development only, and gated on NODE_ENV rather than a flag someone could
  // flip by accident. A login code in a production log is a full account
  // takeover for anyone with log access.
  getLogger().warn(
    { email, code, transport: "console" },
    "email transport not configured — login code logged for local development only",
  );
}

let authService: AuthService | undefined;

export function getAuthService(): AuthService {
  authService ??= new AuthService({
    users: createUserRepository(prisma),
    sessions: createSessionRepository(prisma),
    otps: createOtpRepository(prisma),
    rateLimiter: createRateLimiter(prisma),
    audit: createAuditRepository(prisma),
    now: () => new Date(),
    deliverOtp,
  });

  return authService;
}

export { env };
