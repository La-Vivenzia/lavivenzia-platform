import "../src/lib/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ALL_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_DEFINITIONS,
} from "../src/modules/auth/permissions";
import { CATEGORY_DEFINITIONS } from "../src/modules/experiences/categories";

/**
 * Seed the RBAC vocabulary.
 *
 * Idempotent and re-runnable: it upserts roles and permissions, then
 * *reconciles* each system role's grants against `ROLE_DEFINITIONS` — adding
 * what is missing and removing what is no longer defined.
 *
 * That reconciliation is deliberate. The role-to-permission mapping is a
 * working assumption pending founder confirmation (docs/ASSUMPTIONS.md → A-001),
 * so revising it must be a matter of editing the definition and re-running the
 * seed, never of writing a migration or hand-editing rows.
 *
 * Only roles marked `isSystem` are reconciled. Any role operations creates later
 * through the admin console is left untouched.
 *
 * Seeds vocabulary only — no users, and no privileged accounts. Bootstrapping
 * the first super admin is an operational step, not a seed, precisely because a
 * seeded admin with a known identity is a standing back door.
 *
 * Uses relative imports rather than the `@/` alias: this script runs under the
 * Prisma CLI, which does not resolve tsconfig path aliases.
 */

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) must be set to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function seedPermissions(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const key of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      create: { key, description: PERMISSION_DESCRIPTIONS[key] },
      update: { description: PERMISSION_DESCRIPTIONS[key] },
    });

    ids.set(key, permission.id);
  }

  return ids;
}

async function seedRoles(permissionIds: Map<string, string>): Promise<void> {
  for (const definition of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      update: {
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
    });

    const desired = new Set(
      definition.permissions.map((key) => {
        const id = permissionIds.get(key);
        if (!id) throw new Error(`Permission '${key}' was not seeded`);
        return id;
      }),
    );

    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const current = new Set(existing.map((row) => row.permissionId));

    const toAdd = [...desired].filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !desired.has(id));

    // One transaction per role so a failure cannot leave a role holding a
    // partially applied permission set.
    await prisma.$transaction(async (tx) => {
      if (toAdd.length > 0) {
        await tx.rolePermission.createMany({
          data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }

      if (toRemove.length > 0) {
        await tx.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: { in: toRemove } },
        });
      }
    });

    const summary = [
      `${definition.permissions.length} permissions`,
      toAdd.length > 0 ? `+${toAdd.length}` : null,
      toRemove.length > 0 ? `-${toRemove.length}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    console.log(`  role ${definition.key.padEnd(14)} ${summary}`);
  }
}

/**
 * Seed experience categories.
 *
 * Upserted by key and reordered on every run, the same reconciliation the roles
 * get. A category is never deleted here: listings reference it, and the schema
 * deactivates rather than removes. Retiring one is a matter of dropping it from
 * CATEGORY_DEFINITIONS, which flips isActive to false below and leaves existing
 * listings pointing at a category that simply stops being offered.
 */
async function seedCategories(): Promise<void> {
  const keys = CATEGORY_DEFINITIONS.map((category) => category.key);

  for (const [index, category] of CATEGORY_DEFINITIONS.entries()) {
    await prisma.category.upsert({
      where: { key: category.key },
      create: {
        key: category.key,
        name: category.name,
        description: category.description,
        position: index,
        isActive: true,
      },
      update: {
        name: category.name,
        description: category.description,
        position: index,
        isActive: true,
      },
    });
  }

  const retired = await prisma.category.updateMany({
    where: { key: { notIn: keys }, isActive: true },
    data: { isActive: false },
  });

  console.log(
    `  ${CATEGORY_DEFINITIONS.length} categories upserted` +
      (retired.count > 0 ? `, ${retired.count} retired` : ""),
  );
}

async function main(): Promise<void> {
  console.log("Seeding RBAC vocabulary...");

  const permissionIds = await seedPermissions();
  console.log(`  ${permissionIds.size} permissions upserted`);

  await seedRoles(permissionIds);

  console.log("Seeding experience categories...");
  await seedCategories();

  console.log("Seed complete. No users were created — bootstrap the first admin operationally.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
