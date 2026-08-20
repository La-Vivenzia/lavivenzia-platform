import "../src/lib/load-env";

import { execFileSync } from "node:child_process";

/**
 * Guarded development database reset.
 *
 * `prisma migrate reset --force` drops every table and recreates it. That is
 * exactly right for local development and catastrophic anywhere else, and the
 * only thing standing between the two is which URL happens to be in the
 * environment. This wrapper refuses to run unless the target is demonstrably a
 * local development database.
 *
 * Three gates, all of which must pass:
 *   1. NODE_ENV must not be production.
 *   2. The host must be loopback.
 *   3. The database name must carry a development or test marker.
 *
 * Set ALLOW_REMOTE_DB_RESET=i-understand-this-destroys-data to override — the
 * value is deliberately awkward to type by accident.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SAFE_NAME_PATTERN = /(^|[_-])(dev|development|local|test|shadow)$|^lavivenzia$/;

const OVERRIDE = "i-understand-this-destroys-data";

function refuse(reason: string): never {
  console.error(`\nRefusing to reset the database.\n\n  ${reason}\n`);
  console.error(
    `If this really is a disposable database, re-run with:\n` +
      `  ALLOW_REMOTE_DB_RESET=${OVERRIDE}\n`,
  );
  process.exit(1);
}

function assertSafeTarget(rawUrl: string): { host: string; database: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    refuse("DATABASE_URL is not a valid URL.");
  }

  const host = url.hostname;
  const database = url.pathname.replace(/^\//, "");

  if (process.env.ALLOW_REMOTE_DB_RESET === OVERRIDE) {
    console.warn(`Override set — resetting ${database} on ${host} anyway.`);
    return { host, database };
  }

  if (process.env.NODE_ENV === "production") {
    refuse("NODE_ENV is production.");
  }

  if (!LOOPBACK_HOSTS.has(host)) {
    refuse(`Target host '${host}' is not loopback. This looks like a shared database.`);
  }

  if (!SAFE_NAME_PATTERN.test(database)) {
    refuse(
      `Database name '${database}' does not look like a development database.\n` +
        `  Expected a name ending in _dev, _local, _test, _shadow, or exactly 'lavivenzia'.`,
    );
  }

  return { host, database };
}

function main(): void {
  const rawUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!rawUrl) {
    refuse("Neither DATABASE_URL nor DIRECT_DATABASE_URL is set.");
  }

  const { host, database } = assertSafeTarget(rawUrl);

  console.log(`Resetting ${database} on ${host} — dropping all tables, re-migrating, re-seeding.`);

  const run = (args: string[]): void => {
    execFileSync("npx", args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  };

  // Drop everything and re-apply migrations.
  //
  // Prisma 7 does NOT run the configured seed as part of `migrate reset`, even
  // though `migrations.seed` is set in prisma.config.ts. Seeding is therefore
  // invoked explicitly below — without it a reset leaves an empty RBAC
  // vocabulary, and every authorization check silently denies.
  run(["prisma", "migrate", "reset", "--force"]);

  console.log("\nSeeding...");
  run(["tsx", "prisma/seed.ts"]);

  console.log("\nReset complete.");
}

main();
