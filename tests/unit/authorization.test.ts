import { describe, expect, it } from "vitest";
import {
  STEP_UP_MAX_AGE_MS,
  authorize,
  hasPermission,
  requiresMfa,
  requiresStepUp,
  type Principal,
} from "@/modules/auth/authorization";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";

const NOW = new Date("2026-08-19T12:00:00.000Z");

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: "user-1",
    email: "user-1@example.com",
    sessionId: "session-1",
    roles: ["traveller"],
    permissions: new Set(["booking:read"]),
    mfaSatisfied: false,
    lastAuthenticatedAt: NOW,
    ...overrides,
  };
}

describe("requiresMfa", () => {
  it("is false for traveller and host roles", () => {
    expect(requiresMfa(["traveller"])).toBe(false);
    expect(requiresMfa(["host"])).toBe(false);
  });

  it("is true for every privileged role", () => {
    expect(requiresMfa(["operations"])).toBe(true);
    expect(requiresMfa(["content_admin"])).toBe(true);
    expect(requiresMfa(["finance"])).toBe(true);
    expect(requiresMfa(["super_admin"])).toBe(true);
  });

  it("is true when any held role requires it", () => {
    expect(requiresMfa(["traveller", "finance"])).toBe(true);
  });
});

describe("authorize", () => {
  it("allows a permitted action", () => {
    expect(() => authorize(principal(), "booking:read", NOW)).not.toThrow();
  });

  it("rejects a permission the principal does not hold", () => {
    expect(() => authorize(principal(), "booking:refund", NOW)).toThrow(ForbiddenError);
  });

  it("rejects a privileged role on a session that has not satisfied MFA", () => {
    const finance = principal({
      roles: ["finance"],
      permissions: new Set(["booking:refund"]),
      mfaSatisfied: false,
    });

    expect(() => authorize(finance, "booking:refund", NOW)).toThrow(UnauthenticatedError);
  });

  it("allows a privileged role once MFA is satisfied", () => {
    const finance = principal({
      roles: ["finance"],
      permissions: new Set(["booking:refund"]),
      mfaSatisfied: true,
    });

    expect(() => authorize(finance, "booking:refund", NOW)).not.toThrow();
  });

  it("checks MFA before disclosing whether the permission exists", () => {
    // A privileged role without MFA must get the MFA error, not a permissions
    // error — otherwise the response leaks which permissions are defined.
    const admin = principal({
      roles: ["super_admin"],
      permissions: new Set(),
      mfaSatisfied: false,
    });

    expect(() => authorize(admin, "role:grant", NOW)).toThrow(UnauthenticatedError);
  });
});

describe("step-up authentication", () => {
  it("identifies step-up permissions", () => {
    expect(requiresStepUp("role:grant")).toBe(true);
    expect(requiresStepUp("booking:read")).toBe(false);
  });

  it("allows a step-up action within the re-authentication window", () => {
    const admin = principal({
      roles: ["super_admin"],
      permissions: new Set(["role:grant"]),
      mfaSatisfied: true,
      lastAuthenticatedAt: new Date(NOW.getTime() - STEP_UP_MAX_AGE_MS + 1_000),
    });

    expect(() => authorize(admin, "role:grant", NOW)).not.toThrow();
  });

  it("rejects a step-up action once the window has elapsed", () => {
    const admin = principal({
      roles: ["super_admin"],
      permissions: new Set(["role:grant"]),
      mfaSatisfied: true,
      lastAuthenticatedAt: new Date(NOW.getTime() - STEP_UP_MAX_AGE_MS - 1_000),
    });

    expect(() => authorize(admin, "role:grant", NOW)).toThrow(UnauthenticatedError);
  });

  it("does not apply the window to ordinary permissions", () => {
    const stale = principal({
      lastAuthenticatedAt: new Date(NOW.getTime() - STEP_UP_MAX_AGE_MS * 10),
    });

    expect(() => authorize(stale, "booking:read", NOW)).not.toThrow();
  });
});

describe("hasPermission", () => {
  it("does not grant permissions by prefix", () => {
    const p = principal({ permissions: new Set(["booking:read"]) });
    expect(hasPermission(p, "booking:read")).toBe(true);
    expect(hasPermission(p, "booking")).toBe(false);
    expect(hasPermission(p, "booking:read:all")).toBe(false);
  });
});
