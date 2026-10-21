import { describe, expect, it } from "vitest";
import { extractTotpSecret, formatSecretForEntry, renderTotpQrCode } from "@/modules/auth/totp-qr";
import { buildTotpProvisioningUri, generateTotpSecret } from "@/modules/auth/totp";
import { ValidationError } from "@/lib/errors";

/**
 * The QR encodes the shared secret of an account that can approve listings and
 * read every host's data. So the assertions that matter here are not "does it
 * draw a square" — they are about where that secret can end up.
 */

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/La%20Vivenzia:ops@example.com?secret=${SECRET}&issuer=La%20Vivenzia`;

describe("renderTotpQrCode", () => {
  it("produces an inline SVG data URI", () => {
    const rendered = renderTotpQrCode(URI);

    expect(rendered.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(rendered.split(",")[1]!, "base64").toString("utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
  });

  it("makes no reference to any external host", () => {
    // The whole point. A QR image URL from a public service would hand that
    // service the second factor of a privileged account.
    const svg = Buffer.from(renderTotpQrCode(URI).split(",")[1]!, "base64").toString("utf8");

    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toContain("chart.googleapis.com");
    expect(svg).not.toContain("qrserver");
    // The only URL permitted is the SVG namespace, which is a declaration and
    // not a fetch.
    const urls = svg.match(/https?:\/\/[^"'\s)]+/g) ?? [];
    expect(urls.every((url) => url.startsWith("http://www.w3.org/"))).toBe(true);
  });

  it("does not embed the secret as readable text in the markup", () => {
    // It is encoded in the modules, which is unavoidable and the point. What
    // must not happen is the literal string sitting in a title or comment where
    // it would survive a screenshot, a copy-paste or an HTML scrape.
    const svg = Buffer.from(renderTotpQrCode(URI).split(",")[1]!, "base64").toString("utf8");
    expect(svg).not.toContain(SECRET);
  });

  it("refuses to render anything that is not a TOTP enrolment", () => {
    // People scan QR codes without reading them, so this function must not
    // become a general-purpose "make a QR of whatever you pass me".
    expect(() => renderTotpQrCode("https://example.com/phishing")).toThrow(ValidationError);
    expect(() => renderTotpQrCode("javascript:alert(1)")).toThrow(ValidationError);
    expect(() => renderTotpQrCode("")).toThrow(ValidationError);
    expect(() => renderTotpQrCode("otpauth://hotp/x?secret=ABC")).toThrow(ValidationError);
  });

  it("renders a real provisioning URI from the auth module", () => {
    // Guards the seam: the URI shape comes from totp.ts, and this consumes it.
    const uri = buildTotpProvisioningUri(generateTotpSecret(), "ops@example.com");
    expect(() => renderTotpQrCode(uri)).not.toThrow();
  });
});

describe("extractTotpSecret", () => {
  it("recovers the secret for manual entry", () => {
    expect(extractTotpSecret(URI)).toBe(SECRET);
  });

  it("returns null rather than throwing on a malformed URI", () => {
    expect(extractTotpSecret("not a uri")).toBeNull();
    expect(extractTotpSecret("")).toBeNull();
  });

  it("round-trips a freshly generated enrolment", () => {
    const secret = generateTotpSecret();
    const uri = buildTotpProvisioningUri(secret, "ops@example.com");
    expect(extractTotpSecret(uri)).toBe(secret);
  });
});

describe("formatSecretForEntry", () => {
  it("groups into fours so it can be typed without losing your place", () => {
    expect(formatSecretForEntry("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
  });

  it("preserves every character", () => {
    const grouped = formatSecretForEntry(SECRET);
    expect(grouped.replace(/ /g, "")).toBe(SECRET);
  });

  it("handles a length that is not a multiple of four", () => {
    expect(formatSecretForEntry("ABCDE")).toBe("ABCD E");
  });
});
