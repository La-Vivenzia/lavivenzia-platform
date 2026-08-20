import { describe, expect, it } from "vitest";
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  generateOtpCode,
  hashOtpCode,
  otpExpiryFrom,
  otpHashesEqual,
  verifyOtpChallenge,
  type OtpChallengeState,
} from "@/modules/auth/otp";

const NOW = new Date("2026-08-21T12:00:00.000Z");

function challenge(overrides: Partial<OtpChallengeState> = {}): OtpChallengeState {
  return {
    codeHash: hashOtpCode("123456"),
    attempts: 0,
    expiresAt: new Date(NOW.getTime() + OTP_TTL_MS),
    consumedAt: null,
    ...overrides,
  };
}

describe("generateOtpCode", () => {
  it("produces a zero-padded numeric code of the configured length", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateOtpCode();
      expect(code).toHaveLength(OTP_LENGTH);
      expect(code).toMatch(/^\d+$/);
    }
  });

  it("does not repeat trivially", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateOtpCode()));
    // Birthday collisions are possible in 10^6, but 200 draws collapsing to a
    // handful would mean the generator is broken.
    expect(codes.size).toBeGreaterThan(150);
  });
});

describe("hashOtpCode", () => {
  it("never stores the code itself", () => {
    const hashed = hashOtpCode("123456");
    expect(hashed).not.toContain("123456");
    expect(hashed).toHaveLength(64);
  });

  it("is deterministic", () => {
    expect(hashOtpCode("123456")).toBe(hashOtpCode("123456"));
    expect(hashOtpCode("123456")).not.toBe(hashOtpCode("123457"));
  });
});

describe("otpHashesEqual", () => {
  it("matches identical hashes and rejects others without throwing", () => {
    expect(otpHashesEqual(hashOtpCode("1"), hashOtpCode("1"))).toBe(true);
    expect(otpHashesEqual(hashOtpCode("1"), hashOtpCode("2"))).toBe(false);
    expect(otpHashesEqual("short", hashOtpCode("1"))).toBe(false);
  });
});

describe("verifyOtpChallenge", () => {
  it("accepts the correct code", () => {
    expect(verifyOtpChallenge(challenge(), "123456", NOW)).toEqual({ outcome: "valid" });
  });

  it("rejects an incorrect code", () => {
    expect(verifyOtpChallenge(challenge(), "000000", NOW).outcome).toBe("mismatch");
  });

  it("rejects an expired challenge", () => {
    const expired = challenge({ expiresAt: new Date(NOW.getTime() - 1) });
    expect(verifyOtpChallenge(expired, "123456", NOW).outcome).toBe("expired");
  });

  it("treats expiry as exclusive at the boundary", () => {
    const atBoundary = challenge({ expiresAt: NOW });
    expect(verifyOtpChallenge(atBoundary, "123456", NOW).outcome).toBe("expired");
  });

  it("rejects a consumed challenge even with the right code", () => {
    // Single-use is what stops a replayed code minting a second session.
    const used = challenge({ consumedAt: NOW });
    expect(verifyOtpChallenge(used, "123456", NOW).outcome).toBe("already_used");
  });

  it("burns the challenge once the attempt cap is reached", () => {
    const burned = challenge({ attempts: OTP_MAX_ATTEMPTS });
    // Even the correct code must fail — otherwise the cap does not bound a
    // brute-force attempt at all.
    expect(verifyOtpChallenge(burned, "123456", NOW).outcome).toBe("too_many_attempts");
  });

  it("still allows the final attempt below the cap", () => {
    const nearlyBurned = challenge({ attempts: OTP_MAX_ATTEMPTS - 1 });
    expect(verifyOtpChallenge(nearlyBurned, "123456", NOW).outcome).toBe("valid");
  });

  it("checks consumption before expiry", () => {
    // Ordering matters for the caller: a consumed-and-expired challenge should
    // not be reported as merely expired, which would suggest retrying.
    const both = challenge({ consumedAt: NOW, expiresAt: new Date(NOW.getTime() - 1) });
    expect(verifyOtpChallenge(both, "123456", NOW).outcome).toBe("already_used");
  });
});

describe("otpExpiryFrom", () => {
  it("expires ten minutes out", () => {
    expect(otpExpiryFrom(NOW).getTime() - NOW.getTime()).toBe(OTP_TTL_MS);
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
  });
});
