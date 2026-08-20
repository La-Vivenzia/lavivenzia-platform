import { describe, expect, it } from "vitest";
import { lifetimeForRoles, requiresMfaForRoles } from "@/modules/auth/service";
import { SESSION_LIFETIMES } from "@/modules/auth/session";
import { RATE_LIMITS, rateLimitKey } from "@/modules/auth/rate-limits";

describe("session lifetime selection", () => {
  it("gives travellers the long sliding window", () => {
    expect(lifetimeForRoles(["traveller"])).toBe(SESSION_LIFETIMES.traveller);
  });

  it("gives hosts the shorter window", () => {
    expect(lifetimeForRoles(["host"])).toBe(SESSION_LIFETIMES.host);
  });

  it("gives privileged roles the admin window", () => {
    expect(lifetimeForRoles(["finance"])).toBe(SESSION_LIFETIMES.admin);
    expect(lifetimeForRoles(["super_admin"])).toBe(SESSION_LIFETIMES.admin);
  });

  it("picks the STRICTEST lifetime when roles are combined", () => {
    // A user who is both a traveller and an admin must get the admin window.
    // Taking the most permissive would hand an 8-hour admin session a 30-day life.
    expect(lifetimeForRoles(["traveller", "finance"])).toBe(SESSION_LIFETIMES.admin);
    expect(lifetimeForRoles(["host", "operations"])).toBe(SESSION_LIFETIMES.admin);
    expect(lifetimeForRoles(["traveller", "host"])).toBe(SESSION_LIFETIMES.host);
  });

  it("defaults to the traveller window for an empty role set", () => {
    expect(lifetimeForRoles([])).toBe(SESSION_LIFETIMES.traveller);
  });
});

describe("MFA requirement", () => {
  it("is false for self-service roles and true for privileged ones", () => {
    expect(requiresMfaForRoles(["traveller"])).toBe(false);
    expect(requiresMfaForRoles(["host"])).toBe(false);
    expect(requiresMfaForRoles(["operations"])).toBe(true);
    expect(requiresMfaForRoles(["content_admin"])).toBe(true);
    expect(requiresMfaForRoles(["finance"])).toBe(true);
    expect(requiresMfaForRoles(["super_admin"])).toBe(true);
  });

  it("is true when any held role requires it", () => {
    expect(requiresMfaForRoles(["traveller", "finance"])).toBe(true);
  });
});

describe("rate limit policy", () => {
  it("limits both the identifier and the client for login and OTP issuance", () => {
    // Either dimension alone is bypassable: email-only lets one host spray many
    // accounts; IP-only lets a distributed attacker target one account.
    expect(RATE_LIMITS.loginPerEmail).toBeDefined();
    expect(RATE_LIMITS.loginPerIp).toBeDefined();
    expect(RATE_LIMITS.otpRequestPerEmail).toBeDefined();
    expect(RATE_LIMITS.otpRequestPerIp).toBeDefined();
  });

  it("keeps OTP issuance tighter per address than per client", () => {
    // A shared office IP legitimately produces more traffic than one mailbox.
    expect(RATE_LIMITS.otpRequestPerEmail.limit).toBeLessThan(RATE_LIMITS.otpRequestPerIp.limit);
    expect(RATE_LIMITS.loginPerEmail.limit).toBeLessThan(RATE_LIMITS.loginPerIp.limit);
  });

  it("sets every limit to a positive count over a positive window", () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.limit, name).toBeGreaterThan(0);
      expect(rule.windowMs, name).toBeGreaterThan(0);
    }
  });

  it("buckets case variations of an address together", () => {
    // Otherwise User@x.com and user@x.com each get a full allowance.
    expect(rateLimitKey("loginPerEmail", "User@Example.com")).toBe(
      rateLimitKey("loginPerEmail", "user@example.com"),
    );
  });

  it("namespaces keys by limit name", () => {
    expect(rateLimitKey("loginPerEmail", "a@b.com")).not.toBe(
      rateLimitKey("otpVerifyPerEmail", "a@b.com"),
    );
  });
});
