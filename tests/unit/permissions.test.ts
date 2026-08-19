import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  MFA_REQUIRED_ROLES,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_DEFINITIONS,
  ROLE_KEYS,
  STEP_UP_PERMISSIONS,
  getRoleDefinition,
  isRoleKey,
} from "@/modules/auth/permissions";

/**
 * These assert the *internal consistency* of the RBAC vocabulary, not that the
 * mapping is the right one — the mapping is a working assumption pending
 * founder confirmation (docs/ASSUMPTIONS.md → A-001). What they guarantee is
 * that when the mapping changes, it cannot become incoherent silently.
 */

describe("role catalogue", () => {
  it("defines every declared role exactly once", () => {
    const defined = ROLE_DEFINITIONS.map((role) => role.key);

    expect(new Set(defined).size).toBe(defined.length);
    expect(defined.toSorted()).toEqual([...ROLE_KEYS].toSorted());
  });

  it("resolves every role key to a definition", () => {
    for (const key of ROLE_KEYS) {
      expect(getRoleDefinition(key).key).toBe(key);
    }
  });

  it("gives every role a non-empty name and description", () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(role.name.length).toBeGreaterThan(0);
      expect(role.description.length).toBeGreaterThan(0);
    }
  });

  it("recognises only real role keys", () => {
    expect(isRoleKey("finance")).toBe(true);
    expect(isRoleKey("root")).toBe(false);
    expect(isRoleKey("")).toBe(false);
  });
});

describe("permission catalogue", () => {
  it("has no duplicate permission keys", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it("describes every permission", () => {
    for (const key of ALL_PERMISSIONS) {
      expect(PERMISSION_DESCRIPTIONS[key]).toBeTruthy();
    }
  });

  it("does not describe permissions that do not exist", () => {
    const described = Object.keys(PERMISSION_DESCRIPTIONS);
    expect(described.toSorted()).toEqual([...ALL_PERMISSIONS].toSorted());
  });

  it("uses the resource:action naming convention throughout", () => {
    for (const key of ALL_PERMISSIONS) {
      expect(key).toMatch(/^[a-z_]+:[a-z_]+(:[a-z_]+)?$/);
    }
  });

  it("grants only permissions that exist in the catalogue", () => {
    const catalogue = new Set<string>(ALL_PERMISSIONS);

    for (const role of ROLE_DEFINITIONS) {
      for (const permission of role.permissions) {
        expect(catalogue.has(permission)).toBe(true);
      }
    }
  });

  it("grants no permission twice within a role", () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });
});

describe("role composition", () => {
  it("gives super_admin every permission", () => {
    // Computed rather than listed precisely so a new permission cannot be
    // accidentally omitted. This asserts that property holds.
    const superAdmin = getRoleDefinition("super_admin");
    expect([...superAdmin.permissions].toSorted()).toEqual([...ALL_PERMISSIONS].toSorted());
  });

  it("makes host a strict superset of traveller", () => {
    const traveller = new Set<string>(getRoleDefinition("traveller").permissions);
    const host = new Set<string>(getRoleDefinition("host").permissions);

    for (const permission of traveller) {
      expect(host.has(permission)).toBe(true);
    }
    expect(host.size).toBeGreaterThan(traveller.size);
  });

  it("does not give self-service roles any platform-wide read", () => {
    for (const key of ["traveller", "host"] as const) {
      const permissions = new Set<string>(getRoleDefinition(key).permissions);

      expect(permissions.has(PERMISSIONS.BOOKING_READ_ALL)).toBe(false);
      expect(permissions.has(PERMISSIONS.PAYMENT_READ_ALL)).toBe(false);
      expect(permissions.has(PERMISSIONS.USER_READ)).toBe(false);
      expect(permissions.has(PERMISSIONS.AUDIT_READ)).toBe(false);
    }
  });

  it("keeps money-moving permissions out of every role except finance and super_admin", () => {
    const financial = [
      PERMISSIONS.REFUND_ISSUE,
      PERMISSIONS.PAYOUT_APPROVE,
      PERMISSIONS.COMMISSION_CONFIGURE,
    ];

    for (const role of ROLE_DEFINITIONS) {
      if (role.key === "finance" || role.key === "super_admin") continue;

      for (const permission of financial) {
        expect(new Set<string>(role.permissions).has(permission)).toBe(false);
      }
    }
  });

  it("restricts role granting to super_admin", () => {
    for (const role of ROLE_DEFINITIONS) {
      if (role.key === "super_admin") continue;
      expect(new Set<string>(role.permissions).has(PERMISSIONS.ROLE_GRANT)).toBe(false);
    }
  });
});

describe("MFA and step-up policy", () => {
  it("requires MFA for exactly the privileged roles", () => {
    expect([...MFA_REQUIRED_ROLES].toSorted()).toEqual(
      ["content_admin", "finance", "operations", "super_admin"].toSorted(),
    );
  });

  it("does not require MFA for self-service roles", () => {
    expect(MFA_REQUIRED_ROLES.has("traveller")).toBe(false);
    expect(MFA_REQUIRED_ROLES.has("host")).toBe(false);
  });

  it("step-up covers every money-moving and privilege-granting permission", () => {
    // ADR-0005 states the rule; this pins it so the two cannot drift apart.
    const mustRequireStepUp = [
      PERMISSIONS.ROLE_GRANT,
      PERMISSIONS.ROLE_REVOKE,
      PERMISSIONS.USER_EXPORT_PII,
      PERMISSIONS.REFUND_ISSUE,
      PERMISSIONS.COMMISSION_CONFIGURE,
      PERMISSIONS.PAYOUT_APPROVE,
      PERMISSIONS.CONFIG_MANAGE,
    ];

    for (const permission of mustRequireStepUp) {
      expect(STEP_UP_PERMISSIONS.has(permission)).toBe(true);
    }
  });

  it("only steps up on permissions that exist", () => {
    const catalogue = new Set<string>(ALL_PERMISSIONS);
    for (const permission of STEP_UP_PERMISSIONS) {
      expect(catalogue.has(permission)).toBe(true);
    }
  });

  it("does not step up on ordinary read permissions", () => {
    expect(STEP_UP_PERMISSIONS.has(PERMISSIONS.BOOKING_READ_OWN)).toBe(false);
    expect(STEP_UP_PERMISSIONS.has(PERMISSIONS.LEDGER_READ)).toBe(false);
  });
});
