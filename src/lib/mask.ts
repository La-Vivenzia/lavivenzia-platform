/**
 * Masking helpers for log output.
 *
 * Structured logs are retained, shipped to CloudWatch and read by more people
 * than the database is. An address that identifies a customer does not need to
 * be there in full to make a log line useful for support or debugging.
 *
 * Deliberately dependency-free — including no import of the environment — so
 * that anything may use it, including the domain layer and tests that run with
 * no configuration at all.
 */

/**
 * Reduce an email address to something recognisable but not reusable:
 * `traveller@example.com` becomes `t********r@example.com`.
 *
 * Length is preserved rather than truncated to a fixed width, because support
 * staff match these against an address the user reads out, and a mask that
 * hides the length hides the typo.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");

  // Not an address shape. Mask the whole thing rather than guessing — the input
  // is user-supplied, and a malformed value is exactly the case where logging
  // it verbatim is least defensible.
  if (at <= 0) return "***";

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (local.length <= 2) return `${"*".repeat(local.length)}@${domain}`;

  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}
