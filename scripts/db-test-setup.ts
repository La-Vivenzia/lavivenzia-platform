import "../src/lib/load-env";

import { execFileSync } from "node:child_process";
import { Client } from "pg";

/**
 * Provision the integration-test database.
 *
 * Integration tests truncate tables, so they must never share the development
 * database. This creates a dedicated one, applies migrations, and seeds the RBAC
 * vocabulary the tests assert against.
 *
 * Safe to re-run: the database is created only if absent, and both migrate and
 * seed are idempotent.
 */

function resolveTestUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL;

  if (!raw) {
    console.error(
      "TEST_DATABASE_URL is not set. Add it to .env — see .env.example for the expected value.",
    );
    process.exit(1);
  }

  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");

  if (!database.includes("test")) {
    console.error(
      `Refusing to use '${database}' as the test database — the name must contain 'test'.\n` +
        "Integration tests truncate tables; the guard exists so that cannot hit real data.",
    );
    process.exit(1);
  }

  return url;
}

async function ensureDatabaseExists(url: URL): Promise<string> {
  const database = url.pathname.replace(/^\//, "");

  // Connect to the maintenance database — CREATE DATABASE cannot run from
  // inside the database being created.
  const admin = new URL(url.toString());
  admin.pathname = "/postgres";

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();

  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);

    if (existing.rowCount === 0) {
      // Identifier cannot be parameterised; the name is validated above and
      // quoted here.
      await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
      console.log(`Created database ${database}`);
    } else {
      console.log(`Database ${database} already exists`);
    }
  } finally {
    await client.end();
  }

  return database;
}

async function main(): Promise<void> {
  const url = resolveTestUrl();
  await ensureDatabaseExists(url);

  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    DIRECT_DATABASE_URL: url.toString(),
  };

  const run = (args: string[]): void => {
    execFileSync("npx", args, {
      stdio: "inherit",
      env,
      shell: process.platform === "win32",
    });
  };

  console.log("\nApplying migrations...");
  run(["prisma", "migrate", "deploy"]);

  console.log("\nSeeding RBAC vocabulary...");
  execFileSync("npx", ["tsx", "prisma/seed.ts"], {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });

  console.log("\nTest database ready. Run `npm run test:integration`.");
}

main().catch((error: unknown) => {
  console.error("Test database setup failed:", error);
  process.exit(1);
});
