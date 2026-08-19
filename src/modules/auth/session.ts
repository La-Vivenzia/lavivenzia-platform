import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Session token handling (ADR-0005).
 *
 * Sessions are opaque random tokens, not JWTs, so that suspending a host or
 * deprovisioning an admin takes effect immediately rather than at token expiry.
 *
 * Only a SHA-256 hash of the token is persisted: a database disclosure must not
 * hand an attacker a set of live sessions. SHA-256 rather than a slow KDF is
 * correct here because the token is high-entropy random, not a human secret —
 * there is nothing to brute force.
 */

/** 256 bits of entropy, url-safe encoded. */
const TOKEN_BYTES = 32;

export interface IssuedSessionToken {
  /** Returned to the client once, in the cookie. Never stored. */
  readonly token: string;
  /** Persisted in sessions.token_hash. */
  readonly tokenHash: string;
}

export function issueSessionToken(): IssuedSessionToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two session token hashes. */
export function sessionHashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface SessionLifetime {
  readonly absoluteMs: number;
  readonly idleMs: number;
}

/**
 * Lifetimes per ADR-0005. Admin-tier sessions are short and absolutely bounded;
 * traveller sessions favour convenience because they gate far less.
 */
export const SESSION_LIFETIMES = {
  traveller: { absoluteMs: 30 * 24 * 60 * 60 * 1000, idleMs: 30 * 24 * 60 * 60 * 1000 },
  host: { absoluteMs: 7 * 24 * 60 * 60 * 1000, idleMs: 7 * 24 * 60 * 60 * 1000 },
  admin: { absoluteMs: 8 * 60 * 60 * 1000, idleMs: 30 * 60 * 1000 },
} as const satisfies Record<string, SessionLifetime>;

export interface SessionRecord {
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

/**
 * Whether a stored session is still usable. Checks revocation, absolute expiry
 * and idle timeout — a session can be within its expiry window and still be
 * dead because it went idle.
 */
export function isSessionActive(
  session: SessionRecord,
  lifetime: SessionLifetime,
  now: Date = new Date(),
): boolean {
  if (session.revokedAt !== null) return false;
  if (session.expiresAt.getTime() <= now.getTime()) return false;

  const idleFor = now.getTime() - session.lastSeenAt.getTime();
  return idleFor <= lifetime.idleMs;
}
