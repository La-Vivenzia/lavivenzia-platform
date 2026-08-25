import "../src/lib/load-env";

import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { MFA_REQUIRED_ROLES, ROLE_KEYS, isRoleKey } from "../src/modules/auth/permissions";

/**
 * Grant a role to an existing account.
 *
 * This is the **admin bootstrap procedure**. The seed deliberately creates no
 * users, and self-service registration refuses any role beyond traveller and
 * host — a seeded administrator with a known identity is a standing back door,
 * and a registration endpoint that can mint one is privilege escalation. So the
 * first privileged account is made here, deliberately, by someone with database
 * credentials, and it leaves an audit record.
 *
 *   npx tsx scripts/grant-role.ts ops@lavivenzia.com operations
 *
 * The account must already exist: the person registers normally first, then is
 * granted the role. That way there is no path that creates an account and
 * privileges it in one step.
 *
 * Uses relative imports rather than the `@/` alias — it runs under tsx, which
 * resolves tsconfig paths, but the seed convention here is relative and this
 * script sits beside it.
 */

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) must be set.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function usage(): never {
  console.error("Usage: npx tsx scripts/grant-role.ts <email> <role>");
  console.error(`Roles: ${ROLE_KEYS.join(", ")}`);
  process.exit(1);
}

async function confirm(question: string): Promise<string> {
  // Interactive confirmation rather than a flag. A flag ends up in shell
  // history and then in a runbook that gets copied without being read; typing
  // the role name is a deliberate act each time.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main(): Promise<void> {
  const [email, role] = process.argv.slice(2);

  if (!email || !role) usage();
  if (!isRoleKey(role)) {
    console.error(`Unknown role '${role}'.`);
    usage();
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true, mfaEnrolledAt: true },
  });

  if (!user) {
    console.error(`No account for '${email}'.`);
    console.error("The person must register first; this grants a role to an existing account.");
    process.exit(1);
  }

  if (user.status !== "ACTIVE") {
    console.error(`Account '${email}' is ${user.status}. Reinstate it before granting a role.`);
    process.exit(1);
  }

  const roleRow = await prisma.role.findUnique({ where: { key: role }, select: { id: true } });
  if (!roleRow) {
    console.error(`Role '${role}' is not seeded. Run: npm run db:seed`);
    process.exit(1);
  }

  const existing = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: user.id, roleId: roleRow.id } },
  });

  if (existing) {
    console.log(`'${email}' already holds '${role}'. Nothing to do.`);
    return;
  }

  if (MFA_REQUIRED_ROLES.has(role)) {
    console.log("");
    console.log(`  '${role}' is a privileged role.`);
    console.log(`  Granting it to: ${user.email}`);
    console.log("");
    console.log("  This account will be able to act on other people's data.");
    console.log("");

    const answer = await confirm(`  Type the role name to confirm: `);
    if (answer !== role) {
      console.error("  Cancelled.");
      process.exit(1);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRole.create({ data: { userId: user.id, roleId: roleRow.id } });

    // The same audit trail every other privileged action writes to. `actorId`
    // is null because the actor is an operator at a terminal, not a session —
    // which the schema allows precisely for system-initiated actions.
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "role.granted",
        subjectType: "user",
        subjectId: user.id,
        after: { role, grantedBy: "scripts/grant-role.ts" },
      },
    });
  });

  console.log(`Granted '${role}' to ${user.email}.`);

  if (MFA_REQUIRED_ROLES.has(role) && user.mfaEnrolledAt === null) {
    console.log("");
    console.log("  This role requires two-factor authentication.");
    console.log("  Every privileged permission is refused until the session satisfies it.");
    console.log("  Sign in and enrol an authenticator at /mfa.");
  }
}

main()
  .catch((error: unknown) => {
    console.error("Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
