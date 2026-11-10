import { describe, expect, it, vi } from "vitest";
import {
  blankToNull,
  describeUserAgent,
  isAllowedAvatarUrl,
  isPlausiblePhone,
  normalizePreferences,
  normalizeProfileChanges,
  PROFILE_LIMITS,
} from "@/modules/user-profile/profile";
import { UserProfileService } from "@/modules/user-profile/service";
import type {
  AccountSessionRecord,
  AccountSessionRepository,
  ProfileRecord,
  UserProfileRepository,
} from "@/modules/user-profile/ports";
import type { AuditRepository, RateLimiter } from "@/modules/auth/ports";
import type { Principal } from "@/modules/auth/authorization";
import { hashPassword } from "@/modules/auth/password";
import { RateLimitedError, ValidationError } from "@/lib/errors";

describe("normalizePreferences", () => {
  it("defaults to empty arrays when given null or empty object", () => {
    expect(normalizePreferences(null)).toEqual({ dietary: [], vibes: [], clusters: [] });
    expect(normalizePreferences({})).toEqual({ dietary: [], vibes: [], clusters: [] });
  });

  it("filters out unknown keys", () => {
    const raw = {
      dietary: ["vegan", "unknown_diet"],
      vibes: ["sunset_retreats", "party_time"],
      clusters: ["kalyani_nagar", "mars_crater"],
    };
    expect(normalizePreferences(raw)).toEqual({
      dietary: ["vegan"],
      vibes: ["sunset_retreats"],
      clusters: ["kalyani_nagar"],
    });
  });

  it("favors dietary restrictions over 'none' for kitchen safety", () => {
    const raw = { dietary: ["vegan", "none"] };
    expect(normalizePreferences(raw).dietary).toEqual(["vegan"]);
  });

  it("keeps 'none' when no other restrictions exist", () => {
    const raw = { dietary: ["none"] };
    expect(normalizePreferences(raw).dietary).toEqual(["none"]);
  });

  it("preserves canonical declared order", () => {
    const raw = { dietary: ["halal", "vegan", "vegetarian"] };
    expect(normalizePreferences(raw).dietary).toEqual(["vegan", "vegetarian", "halal"]);
  });
});

describe("profile field validation", () => {
  it("trims and blanks to null", () => {
    expect(blankToNull("   ")).toBeNull();
    expect(blankToNull("")).toBeNull();
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull("  Sarah Jenkins  ")).toBe("Sarah Jenkins");
  });

  it("validates plausible phone numbers", () => {
    expect(isPlausiblePhone("+91 98765 43210")).toBe(true);
    expect(isPlausiblePhone("+1 (555) 019-2834")).toBe(true);
    expect(isPlausiblePhone("9876543210")).toBe(true);
    expect(isPlausiblePhone("123")).toBe(false); // too short
    expect(isPlausiblePhone("phone-number")).toBe(false); // letters
  });

  it("restricts avatar URLs to https", () => {
    expect(isAllowedAvatarUrl("https://example.com/avatar.jpg")).toBe(true);
    expect(isAllowedAvatarUrl("http://example.com/avatar.jpg")).toBe(false);
    expect(isAllowedAvatarUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedAvatarUrl("not-a-url")).toBe(false);
  });

  it("enforces length bounds in normalizeProfileChanges", () => {
    expect(() =>
      normalizeProfileChanges({ fullName: "a".repeat(PROFILE_LIMITS.fullName + 1) }),
    ).toThrow(ValidationError);

    expect(() => normalizeProfileChanges({ bio: "a".repeat(PROFILE_LIMITS.bio + 1) })).toThrow(
      ValidationError,
    );
  });

  it("preserves partial update semantics", () => {
    const changes = normalizeProfileChanges({ fullName: "Arya Stark" });
    expect(changes).toEqual({ fullName: "Arya Stark" });
    expect("phone" in changes).toBe(false);
  });
});

describe("describeUserAgent", () => {
  it("formats browser and OS cleanly", () => {
    const uaChrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(describeUserAgent(uaChrome)).toBe("Chrome on Windows");

    const uaSafari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(describeUserAgent(uaSafari)).toBe("Safari on iOS");

    expect(describeUserAgent(null)).toBe("Unknown device");
  });
});

describe("UserProfileService", () => {
  const fixedNow = new Date("2026-11-10T12:00:00Z");

  const mockPrincipal: Principal = {
    userId: "usr_traveller_1",
    email: "traveller@example.com",
    sessionId: "sess_1",
    roles: ["traveller"],
    permissions: new Set(["profile:manage:own"]),
    mfaSatisfied: true,
    lastAuthenticatedAt: fixedNow,
  };

  const sampleRecord: ProfileRecord = {
    id: "usr_traveller_1",
    email: "traveller@example.com",
    fullName: "Aarav Sharma",
    phone: "+91 98765 43210",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
    bio: "Passionate about heritage architecture and local culinary traditions.",
    preferences: {
      dietary: ["vegetarian"],
      vibes: ["sunset_retreats"],
      clusters: ["kalyani_nagar"],
    },
    roles: ["traveller"],
    emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    mfaEnrolledAt: null,
    hasPassword: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  function createService(overrides?: {
    profiles?: Partial<UserProfileRepository>;
    sessions?: Partial<AccountSessionRepository>;
    rateLimiterAllowed?: boolean;
    passwordHash?: string | null;
  }) {
    const profiles: UserProfileRepository = {
      findById: vi.fn(async (id) => (id === sampleRecord.id ? sampleRecord : null)),
      update: vi.fn(async (_id, changes) => ({ ...sampleRecord, ...changes })),
      findPasswordHash: vi.fn(async () => overrides?.passwordHash ?? "$argon2id$mockhash"),
      replacePassword: vi.fn(async () => ({ revokedSessions: 2 })),
      ...overrides?.profiles,
    };

    const activeSessions: AccountSessionRecord[] = [
      {
        id: "sess_1",
        createdAt: new Date("2026-11-10T10:00:00Z"),
        lastSeenAt: new Date("2026-11-10T11:55:00Z"),
        expiresAt: new Date("2026-11-11T12:00:00Z"),
        revokedAt: null,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        ipAddress: "127.0.0.1",
      },
      {
        id: "sess_2",
        createdAt: new Date("2026-11-09T10:00:00Z"),
        lastSeenAt: new Date("2026-11-10T09:00:00Z"),
        expiresAt: new Date("2026-11-11T12:00:00Z"),
        revokedAt: null,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1",
        ipAddress: "192.168.1.1",
      },
    ];

    const sessions: AccountSessionRepository = {
      listUnexpired: vi.fn(async () => activeSessions),
      revokeAllExcept: vi.fn(async () => 1),
      ...overrides?.sessions,
    };

    const audit: AuditRepository = {
      record: vi.fn(async () => {}),
    };

    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: overrides?.rateLimiterAllowed ?? true,
        remaining: 4,
        resetAt: fixedNow,
        retryAfterSeconds: 60,
      })),
    };

    return {
      service: new UserProfileService({
        profiles,
        sessions,
        audit,
        rateLimiter,
        now: () => fixedNow,
      }),
      profiles,
      sessions,
      audit,
      rateLimiter,
    };
  }

  it("retrieves the profile for the authenticated principal", async () => {
    const { service } = createService();
    const profile = await service.getProfile(mockPrincipal);

    expect(profile.id).toBe("usr_traveller_1");
    expect(profile.email).toBe("traveller@example.com");
    expect(profile.fullName).toBe("Aarav Sharma");
    expect(profile.preferences.dietary).toEqual(["vegetarian"]);
    expect(profile.hasPassword).toBe(true);
    expect(profile.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("updates fields and records audit with modified field names", async () => {
    const { service, audit, profiles } = createService();
    const result = await service.updateProfile(
      mockPrincipal,
      { fullName: "Aarav S.", bio: "Architectural explorer." },
      { ipAddress: "127.0.0.1", correlationId: "req_123" },
    );

    expect(result.fullName).toBe("Aarav S.");
    expect(profiles.update).toHaveBeenCalledWith("usr_traveller_1", {
      fullName: "Aarav S.",
      bio: "Architectural explorer.",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.profile.updated",
        after: { fields: ["fullName", "bio"] },
      }),
    );
  });

  it("lists sessions with current session marked first", async () => {
    const { service } = createService();
    const sessionList = await service.listSessions(mockPrincipal);

    expect(sessionList.length).toBe(2);
    expect(sessionList[0]?.id).toBe("sess_1");
    expect(sessionList[0]?.isCurrent).toBe(true);
    expect(sessionList[0]?.device).toBe("Chrome on Windows");
    expect(sessionList[1]?.id).toBe("sess_2");
    expect(sessionList[1]?.isCurrent).toBe(false);
    expect(sessionList[1]?.device).toBe("Safari on iOS");
  });

  it("revokes other sessions and logs audit event", async () => {
    const { service, sessions, audit } = createService();
    const res = await service.revokeOtherSessions(mockPrincipal, {
      ipAddress: "127.0.0.1",
      correlationId: "req_rev",
    });

    expect(res.revokedSessions).toBe(1);
    expect(sessions.revokeAllExcept).toHaveBeenCalledWith("usr_traveller_1", "sess_1", fixedNow);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.sessions.revoked_others",
        after: { revokedSessions: 1 },
      }),
    );
  });

  it("changes password successfully when current password matches", async () => {
    const oldPassword = "oldSecurePassword123!";
    const newPassword = "newEvenMoreSecure456!";
    const currentHash = await hashPassword(oldPassword);

    const { service, profiles, audit } = createService({ passwordHash: currentHash });

    const res = await service.changePassword(
      mockPrincipal,
      { currentPassword: oldPassword, newPassword },
      { ipAddress: "127.0.0.1", correlationId: "req_pwd" },
    );

    expect(res.revokedSessions).toBe(2);
    expect(profiles.replacePassword).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.password.changed",
      }),
    );
  });

  it("rejects password change if rate limit is exceeded", async () => {
    const { service } = createService({ rateLimiterAllowed: false });

    await expect(
      service.changePassword(
        mockPrincipal,
        { currentPassword: "pwd", newPassword: "new" },
        { ipAddress: "127.0.0.1", correlationId: "req_pwd" },
      ),
    ).rejects.toThrow(RateLimitedError);
  });

  it("rejects password change if user has no password", async () => {
    const { service } = createService({ passwordHash: null });

    await expect(
      service.changePassword(
        mockPrincipal,
        { currentPassword: "pwd", newPassword: "new" },
        { ipAddress: "127.0.0.1", correlationId: "req_pwd" },
      ),
    ).rejects.toThrow(ValidationError);
  });
});
