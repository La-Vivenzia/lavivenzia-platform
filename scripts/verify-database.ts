import "../src/lib/load-env";

import { Pool } from "pg";

/**
 * Verify that a database is provisioned as the schema expects.
 *
 * Checks the required extensions are installed and the expected tables exist.
 * Written as a script rather than a one-off command because it is equally
 * useful against staging and production after a migration deploy — "did the
 * extensions actually get created?" is exactly the question that goes unasked
 * until something fails at runtime.
 *
 * Exits non-zero on any missing item, so it can gate a deploy.
 */

const REQUIRED_EXTENSIONS = ["pgcrypto", "citext", "pg_trgm", "postgis", "vector"] as const;

const REQUIRED_TABLES = [
  "users",
  "sessions",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "audit_logs",
] as const;

interface ExtensionRow {
  extname: string;
  extversion: string;
}

interface TableRow {
  tablename: string;
}

interface CountRow {
  count: string;
}

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL (or DIRECT_DATABASE_URL) must be set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 1 });
  let failed = false;

  try {
    const version = await pool.query<{ version: string }>("SELECT version()");
    console.log(version.rows[0]?.version ?? "unknown server version");
    console.log("");

    // ── Extensions ──
    const extensions = await pool.query<ExtensionRow>(
      "SELECT extname, extversion FROM pg_extension ORDER BY extname",
    );
    const installed = new Map(extensions.rows.map((row) => [row.extname, row.extversion]));

    console.log("Extensions:");
    for (const name of REQUIRED_EXTENSIONS) {
      const version = installed.get(name);
      if (version) {
        console.log(`  ok       ${name.padEnd(10)} ${version}`);
      } else {
        console.log(`  MISSING  ${name}`);
        failed = true;
      }
    }

    // ── Tables ──
    const tables = await pool.query<TableRow>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const present = new Set(tables.rows.map((row) => row.tablename));

    console.log("\nTables:");
    for (const name of REQUIRED_TABLES) {
      if (present.has(name)) {
        console.log(`  ok       ${name}`);
      } else {
        console.log(`  MISSING  ${name}`);
        failed = true;
      }
    }

    // ── Seeded vocabulary ──
    // Reported, not asserted: a freshly migrated database legitimately has none
    // until `npm run db:seed` runs.
    const roles = await pool.query<CountRow>("SELECT count(*)::text AS count FROM roles");
    const permissions = await pool.query<CountRow>(
      "SELECT count(*)::text AS count FROM permissions",
    );
    const grants = await pool.query<CountRow>(
      "SELECT count(*)::text AS count FROM role_permissions",
    );

    console.log("\nSeeded data:");
    console.log(`  roles            ${roles.rows[0]?.count ?? "0"}`);
    console.log(`  permissions      ${permissions.rows[0]?.count ?? "0"}`);
    console.log(`  role grants      ${grants.rows[0]?.count ?? "0"}`);

    // ── PostGIS sanity check ──
    // Confirms the extension is not merely registered but functional. A distance
    // between two known points is a cheap end-to-end proof.
    if (installed.has("postgis")) {
      const distance = await pool.query<{ metres: number }>(
        `SELECT ST_Distance(
           ST_MakePoint(73.8567, 18.5204)::geography,
           ST_MakePoint(72.8777, 19.0760)::geography
         ) AS metres`,
      );
      const km = Math.round((distance.rows[0]?.metres ?? 0) / 1000);
      console.log(`\nPostGIS check:  Pune to Mumbai = ${km} km (expected ~120)`);
    }
  } finally {
    await pool.end();
  }

  if (failed) {
    console.error("\nDatabase verification FAILED — see MISSING entries above.");
    process.exit(1);
  }

  console.log("\nDatabase verification passed.");
}

main().catch((error: unknown) => {
  console.error("Verification error:", error);
  process.exit(1);
});
