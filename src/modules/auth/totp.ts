import { Secret, TOTP } from "otpauth";

/**
 * TOTP second factor (ADR-0005: mandatory for operations, content, finance and
 * super-admin roles).
 *
 * RFC 6238 defaults — SHA-1, 6 digits, 30-second period — chosen deliberately
 * over stronger-looking parameters: they are what Google Authenticator, 1Password
 * and Authy actually implement. A SHA-256 or 8-digit configuration silently
 * fails to enrol in several common apps, which in practice means admins turn MFA
 * off rather than debug it.
 */
const TOTP_CONFIG = {
  algorithm: "SHA1",
  digits: 6,
  period: 30,
} as const;

const ISSUER = "La Vivenzia";

/**
 * Accepted clock drift, in periods, either side of now.
 *
 * 1 means the previous, current and next 30-second window are accepted — a
 * 90-second span. This is the standard trade-off: phone clocks drift, and a
 * window of 0 produces support tickets. Widening it further meaningfully
 * increases the odds of a blind guess landing.
 */
const DRIFT_WINDOW = 1;

/** Generate a new secret. 160 bits, the RFC 4226 recommendation for HMAC-SHA1. */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function build(secret: string, accountLabel: string): TOTP {
  return new TOTP({
    ...TOTP_CONFIG,
    issuer: ISSUER,
    label: accountLabel,
    secret: Secret.fromBase32(secret),
  });
}

/**
 * The `otpauth://` URI an authenticator app scans.
 *
 * Contains the shared secret, so it must never be logged, cached, or returned
 * to anyone but the enrolling user over an authenticated channel.
 */
export function buildTotpProvisioningUri(secret: string, accountLabel: string): string {
  return build(secret, accountLabel).toString();
}

export interface VerifyTotpOptions {
  /** Label used when rebuilding the TOTP; must match enrolment. */
  readonly accountLabel?: string;
  /**
   * Evaluation time in epoch milliseconds.
   *
   * Accepted rather than reading the wall clock so the caller's injected clock
   * governs TOTP exactly as it governs session expiry and OTP TTL. Without it,
   * this function silently ignores the service clock, which makes every
   * time-dependent MFA behaviour untestable and inconsistent with the rest of
   * the auth flow.
   */
  readonly timestamp?: number;
}

/**
 * Verify a submitted TOTP code.
 *
 * Returns false rather than throwing on malformed input: a bad code and a bad
 * secret must be indistinguishable to the caller.
 *
 * Note this does not prevent replay within the same 30-second window — that
 * requires storing the last accepted counter per user. Deliberately deferred:
 * it matters for high-value step-up actions, and is recorded as a follow-up in
 * PROJECT_STATE.md rather than half-built here.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  options: VerifyTotpOptions = {},
): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  try {
    const delta = build(secret, options.accountLabel ?? "user").validate({
      token: code,
      window: DRIFT_WINDOW,
      ...(options.timestamp === undefined ? {} : { timestamp: options.timestamp }),
    });
    return delta !== null;
  } catch {
    return false;
  }
}
