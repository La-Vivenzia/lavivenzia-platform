import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * One-time codes for the passwordless traveller flow (ADR-0005).
 *
 * The security of a 6-digit code rests entirely on how few guesses it allows,
 * not on its length: 10^6 is trivially brute-forced given unlimited attempts.
 * Three properties enforce that together, and all three are required —
 * weakening any one makes the others insufficient:
 *
 *   1. short expiry (10 minutes)
 *   2. a hard attempt cap per challenge, after which the code is burned
 *   3. a rate limit on issuance, so an attacker cannot mint fresh challenges
 *
 * Codes are stored as SHA-256 hashes. A fast hash is correct here — unlike a
 * password, the code is high-entropy relative to its 10-minute life and there is
 * nothing to slow-hash against.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;

/** Verification attempts allowed against a single challenge before it is burned. */
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Generate a numeric code using a cryptographically secure source.
 *
 * `randomInt` is used rather than `Math.random()` — the latter is predictable
 * and would let an attacker who observes a few codes derive the rest.
 * Zero-padded so every code is the same length; a variable-length code leaks
 * information and confuses users.
 */
export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Constant-time comparison, so a timing signal cannot reveal a partial match. */
export function otpHashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Shape of a stored challenge, as the policy below needs to see it. */
export interface OtpChallengeState {
  readonly codeHash: string;
  readonly attempts: number;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export type OtpVerificationResult =
  | { readonly outcome: "valid" }
  | { readonly outcome: "expired" }
  | { readonly outcome: "already_used" }
  | { readonly outcome: "too_many_attempts" }
  | { readonly outcome: "mismatch" };

/**
 * Decide whether a submitted code satisfies a challenge.
 *
 * Pure: no database, no clock beyond what is passed in, so every branch is
 * directly testable. The caller is responsible for persisting the attempt
 * increment — including on a mismatch, which is what makes the cap real.
 */
export function verifyOtpChallenge(
  challenge: OtpChallengeState,
  submittedCode: string,
  now: Date = new Date(),
): OtpVerificationResult {
  if (challenge.consumedAt !== null) return { outcome: "already_used" };
  if (challenge.expiresAt.getTime() <= now.getTime()) return { outcome: "expired" };
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { outcome: "too_many_attempts" };

  const submittedHash = hashOtpCode(submittedCode);
  if (!otpHashesEqual(submittedHash, challenge.codeHash)) return { outcome: "mismatch" };

  return { outcome: "valid" };
}

export function otpExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MS);
}
