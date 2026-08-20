import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  assertPasswordPolicy,
  getTimingEqualisationHash,
  hashPassword,
  verifyPassword,
} from "@/modules/auth/password";
import { buildTotpProvisioningUri, generateTotpSecret, verifyTotpCode } from "@/modules/auth/totp";
import { ValidationError } from "@/lib/errors";
import { TOTP, Secret } from "otpauth";

describe("password policy", () => {
  it("rejects passwords below the minimum length", () => {
    expect(() => assertPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH - 1))).toThrow(
      ValidationError,
    );
  });

  it("accepts a password at exactly the minimum", () => {
    expect(() => assertPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH))).not.toThrow();
  });

  it("rejects an unbounded password", () => {
    // Not pedantry: argon2 cost scales with input, so an unbounded password is
    // a denial-of-service vector against the hashing itself.
    expect(() => assertPasswordPolicy("a".repeat(MAX_PASSWORD_LENGTH + 1))).toThrow(
      ValidationError,
    );
  });

  it("imposes no character-class rules", () => {
    // NIST SP 800-63B: composition rules push users toward predictable
    // substitutions without adding entropy. Length is what matters.
    expect(() => assertPasswordPolicy("aaaaaaaaaaaaaaaa")).not.toThrow();
  });
});

describe("password hashing", () => {
  it("produces an argon2id hash that verifies", async () => {
    const hashed = await hashPassword("correct horse battery staple");

    expect(hashed).toMatch(/^\$argon2id\$/);
    expect(hashed).not.toContain("correct horse");
    await expect(verifyPassword("correct horse battery staple", hashed)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hashed = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong horse battery staple", hashed)).resolves.toBe(false);
  });

  it("salts — the same password hashes differently each time", async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    expect(a).not.toBe(b);
    await expect(verifyPassword("correct horse battery staple", b)).resolves.toBe(true);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    // A corrupt row must read as "authentication failed", not as a 500 that
    // tells an attacker something unusual happened.
    await expect(verifyPassword("anything", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
  });

  it("provides a timing-equalisation hash that no password matches", async () => {
    const dummy = await getTimingEqualisationHash();
    expect(dummy).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword("", dummy)).resolves.toBe(false);
    await expect(verifyPassword("password", dummy)).resolves.toBe(false);
  });

  it("returns a stable dummy hash so it is computed once", async () => {
    expect(await getTimingEqualisationHash()).toBe(await getTimingEqualisationHash());
  });
});

describe("TOTP", () => {
  it("generates a 160-bit base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(Secret.fromBase32(secret).bytes).toHaveLength(20);
  });

  it("generates distinct secrets", () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(50);
  });

  it("builds a provisioning URI an authenticator app can read", () => {
    const secret = generateTotpSecret();
    const uri = buildTotpProvisioningUri(secret, "host@example.com");

    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("issuer=La%20Vivenzia");
    expect(uri).toContain(secret);
  });

  it("accepts a code generated from the same secret", () => {
    const secret = generateTotpSecret();
    const code = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    }).generate();

    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects a code from a different secret", () => {
    const code = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(generateTotpSecret()),
    }).generate();

    expect(verifyTotpCode(generateTotpSecret(), code)).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "abcdef")).toBe(false);
    expect(verifyTotpCode(secret, "12345")).toBe(false);
    expect(verifyTotpCode(secret, "1234567")).toBe(false);
    expect(verifyTotpCode(secret, "")).toBe(false);
    // A bad secret must be indistinguishable from a bad code to the caller.
    expect(verifyTotpCode("not-base32!", "123456")).toBe(false);
  });
});
