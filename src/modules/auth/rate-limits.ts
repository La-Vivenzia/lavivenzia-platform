/**
 * Rate limit policy for authentication endpoints.
 *
 * Backed by PostgreSQL counters rather than Redis (ADR-0001). These endpoints
 * are low-volume and high-value, so precision matters more than throughput;
 * volumetric and bot protection belongs at the edge (WAF), not here.
 *
 * Every limit is applied on **two** keys — the identifier and the client IP.
 * Either alone is insufficient: limiting only by email lets one host spray
 * thousands of accounts, and limiting only by IP lets a distributed attacker
 * target a single account from many addresses.
 */

export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  /** OTP issuance per address. Deliberately tight — each request sends an email. */
  otpRequestPerEmail: { limit: 5, windowMs: HOUR },
  /** OTP issuance per client, so one host cannot spray many addresses. */
  otpRequestPerIp: { limit: 20, windowMs: HOUR },

  /** OTP verification per address, on top of the per-challenge attempt cap. */
  otpVerifyPerEmail: { limit: 10, windowMs: HOUR },

  /** Password login per address. */
  loginPerEmail: { limit: 10, windowMs: 15 * MINUTE },
  /** Password login per client. Higher, since offices share an address. */
  loginPerIp: { limit: 50, windowMs: 15 * MINUTE },

  /** Registration per client — the main defence against scripted signups. */
  registerPerIp: { limit: 10, windowMs: HOUR },

  /** TOTP verification. Tight: 6 digits with no per-challenge counter. */
  mfaVerifyPerUser: { limit: 10, windowMs: 15 * MINUTE },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Build a counter key.
 *
 * The subject is lower-cased so `User@x.com` and `user@x.com` share a bucket —
 * otherwise case variation trivially multiplies the allowance.
 */
export function rateLimitKey(name: RateLimitName, subject: string): string {
  return `${name}:${subject.toLowerCase()}`;
}
