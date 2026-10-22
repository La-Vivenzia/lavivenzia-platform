import { prisma } from "@/lib/db";
import { RateLimitedError } from "@/lib/errors";
import { getRequestContext } from "@/lib/auth-context";
import { createRateLimiter } from "@/adapters/persistence/prisma/auth-repositories";
import { RATE_LIMITS, rateLimitKey, type RateLimitName } from "@/modules/auth/rate-limits";

/**
 * Rate limiting for public HTTP routes.
 *
 * The authenticated flows enforce their limits inside `AuthService`, where the
 * subject is a known email or user id. The public endpoints have no such
 * subject — a stranger browsing has only a client address — so the enforcement
 * point is here, at the HTTP edge, rather than pushed into a domain service
 * that would have to be handed an IP to satisfy it.
 *
 * The same PostgreSQL counters back both (ADR-0001). One mechanism, two call
 * sites, because the subject differs and nothing else does.
 */

const limiter = createRateLimiter(prisma);

/**
 * Consume one unit against the caller's address, throwing when exhausted.
 *
 * An absent `x-forwarded-for` is treated as one shared subject rather than as
 * an exemption. In production the ALB always sets it, so the only way to arrive
 * without one is to reach the app off the expected path — and the safe reading
 * of that is "count it", not "let it through".
 */
export async function enforceIpRateLimit(name: RateLimitName): Promise<void> {
  try {
    const rule = RATE_LIMITS[name];
    const { ipAddress } = await getRequestContext();

    const decision = await limiter.consume(
      rateLimitKey(name, ipAddress ?? "unknown"),
      rule.limit,
      rule.windowMs,
      new Date(),
    );

    if (!decision.allowed) {
      throw new RateLimitedError("Too many requests. Please try again shortly.", {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
  } catch (error) {
    if (error instanceof RateLimitedError) throw error;
    if (process.env.NODE_ENV !== "production") {
      // In local dev/preview when DB is offline, fail-open for rate limiting
      return;
    }
    throw error;
  }
}
