import { renderSVG } from "uqr";
import { ValidationError } from "@/lib/errors";

/**
 * Render a TOTP provisioning URI as a scannable QR code.
 *
 * **Generated locally, never by a third party.** The obvious shortcut here is an
 * image URL from a public QR service — and it would hand that service the
 * shared secret of an account that can approve listings and read every host's
 * data. The secret must not leave this process except to the browser that
 * asked for it, over the authenticated channel it already came down.
 *
 * Kept out of the route handler because it is a property of the second factor,
 * not of HTTP: the worker or a future admin tool would need the same thing, and
 * this is the file that already owns TOTP.
 */

/** The scheme every authenticator app expects. Anything else is not a TOTP setup. */
const OTPAUTH_PREFIX = "otpauth://totp/";

/**
 * A data URI holding an inline SVG.
 *
 * Returned as a data URI rather than raw markup so the client can render it
 * with a plain `<img src>`, with no `dangerouslySetInnerHTML` anywhere near
 * it. Base64 rather than percent-encoding because the SVG contains characters
 * that would otherwise need escaping in an attribute.
 */
export function renderTotpQrCode(provisioningUri: string): string {
  if (!provisioningUri.startsWith(OTPAUTH_PREFIX)) {
    // Guards against rendering a QR for something that is not an enrolment —
    // a scannable code carries whatever it is given, and people scan them.
    throw new ValidationError("Not a TOTP provisioning URI.");
  }

  const svg = renderSVG(provisioningUri, {
    // Medium recovery: enough redundancy for a phone camera against a screen,
    // without inflating the module count so far that it is hard to scan.
    ecc: "M",
    border: 2,
  });

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * The shared secret, extracted for manual entry.
 *
 * A QR is not enough on its own. Desktop authenticators cannot scan a screen
 * they are on, some corporate phones block camera access, and a screen-reader
 * user cannot scan anything at all — so the key is always offered alongside it.
 */
export function extractTotpSecret(provisioningUri: string): string | null {
  try {
    // `otpauth://` is not a scheme `URL` parses usefully; swapping it for https
    // gives the same query string with a parser that exists.
    return new URL(provisioningUri.replace("otpauth://", "https://")).searchParams.get("secret");
  } catch {
    return null;
  }
}

/**
 * Group the secret into fours.
 *
 * A 32-character unbroken string is genuinely hard to type without losing your
 * place, and this is the fallback path for exactly the people who cannot scan.
 */
export function formatSecretForEntry(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(" ");
}
