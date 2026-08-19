import { describe, expect, it } from "vitest";
import {
  SESSION_LIFETIMES,
  hashSessionToken,
  isSessionActive,
  issueSessionToken,
  sessionHashesEqual,
  type SessionRecord,
} from "@/modules/auth/session";

const NOW = new Date("2026-08-19T12:00:00.000Z");

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    createdAt: NOW,
    lastSeenAt: NOW,
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

describe("issueSessionToken", () => {
  it("returns a token and its hash, never storing the token itself", () => {
    const issued = issueSessionToken();

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(issued.tokenHash).toEqual(hashSessionToken(issued.token));
    expect(issued.tokenHash).not.toEqual(issued.token);
  });

  it("produces a distinct token every time", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => issueSessionToken().token));
    expect(tokens.size).toBe(100);
  });

  it("produces a 256-bit token", () => {
    // 32 bytes base64url-encoded, unpadded.
    expect(issueSessionToken().token).toHaveLength(43);
  });
});

describe("sessionHashesEqual", () => {
  it("matches identical hashes", () => {
    const hash = hashSessionToken("abc");
    expect(sessionHashesEqual(hash, hash)).toBe(true);
  });

  it("rejects different hashes without throwing on length mismatch", () => {
    expect(sessionHashesEqual(hashSessionToken("abc"), hashSessionToken("def"))).toBe(false);
    expect(sessionHashesEqual("short", hashSessionToken("abc"))).toBe(false);
  });
});

describe("isSessionActive", () => {
  const lifetime = SESSION_LIFETIMES.admin;

  it("accepts a fresh session", () => {
    expect(isSessionActive(session(), lifetime, NOW)).toBe(true);
  });

  it("rejects a revoked session even before it expires", () => {
    const revoked = session({ revokedAt: new Date(NOW.getTime() - 1_000) });
    expect(isSessionActive(revoked, lifetime, NOW)).toBe(false);
  });

  it("rejects an expired session", () => {
    const expired = session({ expiresAt: new Date(NOW.getTime() - 1) });
    expect(isSessionActive(expired, lifetime, NOW)).toBe(false);
  });

  it("rejects a session that went idle even while unexpired", () => {
    const idle = session({
      expiresAt: new Date(NOW.getTime() + SESSION_LIFETIMES.admin.absoluteMs),
      lastSeenAt: new Date(NOW.getTime() - SESSION_LIFETIMES.admin.idleMs - 1_000),
    });

    expect(isSessionActive(idle, lifetime, NOW)).toBe(false);
  });

  it("treats expiry as exclusive at the boundary", () => {
    const atBoundary = session({ expiresAt: NOW });
    expect(isSessionActive(atBoundary, lifetime, NOW)).toBe(false);
  });
});

describe("SESSION_LIFETIMES", () => {
  it("gives admin sessions the shortest idle window", () => {
    expect(SESSION_LIFETIMES.admin.idleMs).toBeLessThan(SESSION_LIFETIMES.host.idleMs);
    expect(SESSION_LIFETIMES.host.idleMs).toBeLessThan(SESSION_LIFETIMES.traveller.idleMs);
  });
});
