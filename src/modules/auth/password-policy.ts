import { ValidationError } from "@/lib/errors";

/**
 * Password policy, separated from password *hashing*.
 *
 * The split is not cosmetic. `password.ts` imports `@node-rs/argon2`, a native
 * addon with no browser build, so anything importing it is server-only. The
 * sign-up form needs the minimum length to show the rule as the host types —
 * and pulling the constant from the hashing module would drag argon2 into the
 * client bundle, where it fails the build.
 *
 * So the rule lives here, where both sides can read it, and there is still only
 * one number.
 */

/**
 * Minimum length only.
 *
 * NIST SP 800-63B advises against composition rules (must contain a symbol, a
 * digit, …): they push users toward predictable substitutions without adding
 * real entropy. Length is the property that matters. Breached-password
 * screening would be the next genuine improvement, not a character-class rule.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Upper bound guarding against a denial-of-service through the hash itself:
 * argon2 cost grows with input, so an unbounded password is an attack.
 */
export const MAX_PASSWORD_LENGTH = 256;

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
}
