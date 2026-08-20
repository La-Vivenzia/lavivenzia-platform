import { afterAll, describe, expect, it } from "vitest";
import { TEST_EMAIL_DOMAIN, testDb } from "./helpers";
import { ALL_PERMISSIONS, ROLE_DEFINITIONS, getRoleDefinition } from "@/modules/auth/permissions";

/**
 * The seeded RBAC vocabulary must match the source of truth exactly.
 *
 * Unit tests already assert the definition is internally coherent. These assert
 * the *database agrees with it* — that the seed actually applied, and that no
 * drift has crept in between the code and the rows an authorization check will
 * read at runtime.
 */

afterAll(async () => {
  await testDb.$disconnect();
});

describe("seeded permissions", () => {
  it("contains exactly the permissions declared in code", async () => {
    const rows = await testDb.permission.findMany({ select: { key: true } });
    const seeded = rows.map((row) => row.key).toSorted();

    expect(seeded).toEqual([...ALL_PERMISSIONS].toSorted());
  });

  it("gives every permission a description", async () => {
    const undescribed = await testDb.permission.count({
      where: { OR: [{ description: null }, { description: "" }] },
    });

    expect(undescribed).toBe(0);
  });
});

describe("seeded roles", () => {
  it("contains exactly the roles declared in code", async () => {
    const rows = await testDb.role.findMany({ select: { key: true } });
    const seeded = rows.map((row) => row.key).toSorted();

    expect(seeded).toEqual(ROLE_DEFINITIONS.map((role) => role.key).toSorted());
  });

  it("marks every seeded role as a system role", async () => {
    const nonSystem = await testDb.role.count({ where: { isSystem: false } });
    expect(nonSystem).toBe(0);
  });

  it.each(ROLE_DEFINITIONS.map((role) => role.key))(
    "grants %s exactly its declared permissions",
    async (roleKey) => {
      const definition = getRoleDefinition(roleKey);

      const role = await testDb.role.findUniqueOrThrow({
        where: { key: roleKey },
        include: { permissions: { include: { permission: true } } },
      });

      const granted = role.permissions.map((row) => row.permission.key).toSorted();
      expect(granted).toEqual([...definition.permissions].toSorted());
    },
  );

  it("gives super_admin every permission that exists", async () => {
    const role = await testDb.role.findUniqueOrThrow({
      where: { key: "super_admin" },
      include: { permissions: true },
    });

    const total = await testDb.permission.count();
    expect(role.permissions.length).toBe(total);
  });
});

describe("seed integrity", () => {
  it("leaves no orphaned grants", async () => {
    // Cascades should make this impossible; asserting it catches a broken
    // migration that dropped a foreign key.
    const orphans = await testDb.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
      FROM role_permissions rp
      LEFT JOIN roles r ON r.id = rp.role_id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.id IS NULL OR p.id IS NULL
    `;

    expect(Number(orphans[0]?.count ?? 0)).toBe(0);
  });

  it("creates no users — the first admin is an operational bootstrap", async () => {
    // A seeded admin with a known identity would be a standing back door.
    const seededUsers = await testDb.user.count({
      where: { email: { not: { endsWith: TEST_EMAIL_DOMAIN }, mode: "insensitive" } },
    });

    expect(seededUsers).toBe(0);
  });
});
