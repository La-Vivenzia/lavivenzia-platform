process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import "../src/lib/load-env";

import { Pool } from "pg";

/**
 * Verify that a database is provisioned as the schema expects.
 *
 * Checks extensions, tables, foreign keys, indexes, constraints and Prisma
 * client connectivity. Written as a script rather than a one-off command
 * because it is equally useful against staging and production after a migration
 * deploy — "did the extensions actually get created, and are the foreign keys
 * really there?" is exactly the question that goes unasked until something
 * fails at runtime.
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
  "otp_challenges",
  "rate_limit_counters",
  "hosts",
  "experiences",
  "experience_media",
  "categories",
] as const;

/**
 * Foreign keys that must exist, with the delete behaviour the domain depends
 * on. Getting `ON DELETE` wrong is silent until the day someone deletes a user
 * and either orphans their sessions or cascades away an audit trail.
 */
const REQUIRED_FOREIGN_KEYS: readonly {
  table: string;
  column: string;
  references: string;
  onDelete: string;
}[] = [
  { table: "sessions", column: "user_id", references: "users", onDelete: "CASCADE" },
  { table: "user_roles", column: "user_id", references: "users", onDelete: "CASCADE" },
  { table: "user_roles", column: "role_id", references: "roles", onDelete: "CASCADE" },
  { table: "role_permissions", column: "role_id", references: "roles", onDelete: "CASCADE" },
  {
    table: "role_permissions",
    column: "permission_id",
    references: "permissions",
    onDelete: "CASCADE",
  },
  // Audit rows outlive their actor deliberately: SET NULL, never CASCADE.
  // An audit log that disappears with the user it indicts is not an audit log.
  { table: "audit_logs", column: "actor_id", references: "users", onDelete: "SET NULL" },

  // Deleting an account removes the business profile and everything hanging off
  // it. Audit rows are the deliberate exception above.
  { table: "hosts", column: "user_id", references: "users", onDelete: "CASCADE" },
  { table: "experiences", column: "host_id", references: "hosts", onDelete: "CASCADE" },
  {
    table: "experience_media",
    column: "experience_id",
    references: "experiences",
    onDelete: "CASCADE",
  },
  // A retired category must not take listings with it: the listing survives
  // with no category rather than vanishing from a host inventory.
  { table: "experiences", column: "category_id", references: "categories", onDelete: "SET NULL" },
];

/** Unique constraints the application relies on for correctness, not just tidiness. */
const REQUIRED_UNIQUE: readonly { table: string; columns: string[] }[] = [
  { table: "users", columns: ["email"] },
  { table: "sessions", columns: ["token_hash"] },
  { table: "roles", columns: ["key"] },
  { table: "permissions", columns: ["key"] },
  // One host profile per account.
  { table: "hosts", columns: ["user_id"] },
  // The public URL of a listing. Two listings cannot share one.
  { table: "experiences", columns: ["slug"] },
  { table: "experience_media", columns: ["storage_key"] },
  { table: "categories", columns: ["key"] },
];

/** Indexes that exist for query performance rather than constraint enforcement. */
const REQUIRED_INDEXES: readonly { table: string; columns: string[] }[] = [
  { table: "sessions", columns: ["user_id"] },
  { table: "sessions", columns: ["expires_at"] },
  { table: "users", columns: ["status"] },
  { table: "user_roles", columns: ["role_id"] },
  { table: "role_permissions", columns: ["permission_id"] },
  { table: "audit_logs", columns: ["occurred_at"] },
  { table: "audit_logs", columns: ["actor_id", "occurred_at"] },
  { table: "audit_logs", columns: ["subject_type", "subject_id"] },

  // The host dashboard listing, and the operations review queue.
  { table: "experiences", columns: ["host_id", "status", "updated_at"] },
  { table: "experiences", columns: ["status", "submitted_at"] },
  { table: "experiences", columns: ["category_id"] },
  { table: "experience_media", columns: ["experience_id", "position"] },
  { table: "hosts", columns: ["verification_status"] },
  { table: "categories", columns: ["is_active", "position"] },
];

/**
 * Check constraints that make an invariant true regardless of which code path
 * wrote the row. The service validates the same rules for the sake of a decent
 * error message; these are what make them guarantees.
 */
const REQUIRED_CHECKS: readonly string[] = [
  "experiences_min_guests_check",
  "experiences_guest_range_check",
  "experiences_duration_check",
  "experiences_base_price_check",
  "experiences_coordinates_check",
  "experience_media_byte_size_check",
  "experience_media_position_check",
];

let failed = false;

function report(ok: boolean, label: string, detail = ""): void {
  if (ok) {
    console.log(`  ok       ${label}${detail ? `  ${detail}` : ""}`);
  } else {
    console.log(`  MISSING  ${label}${detail ? `  ${detail}` : ""}`);
    failed = true;
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL (or DIRECT_DATABASE_URL) must be set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 1 });

  try {
    const version = await pool.query<{ version: string }>("SELECT version()");
    console.log(version.rows[0]?.version ?? "unknown server version");

    // ── Extensions ──
    section("Extensions:");
    const extensions = await pool.query<{ extname: string; extversion: string }>(
      "SELECT extname, extversion FROM pg_extension",
    );
    const installed = new Map(extensions.rows.map((row) => [row.extname, row.extversion]));

    for (const name of REQUIRED_EXTENSIONS) {
      report(installed.has(name), name.padEnd(10), installed.get(name) ?? "");
    }

    // ── Tables ──
    section("Tables:");
    const tables = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const present = new Set(tables.rows.map((row) => row.tablename));

    for (const name of REQUIRED_TABLES) {
      report(present.has(name), name);
    }

    // ── Foreign keys ──
    section("Foreign keys:");
    const fks = await pool.query<{
      table_name: string;
      column_name: string;
      foreign_table: string;
      delete_rule: string;
    }>(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `);

    for (const expected of REQUIRED_FOREIGN_KEYS) {
      const match = fks.rows.find(
        (row) =>
          row.table_name === expected.table &&
          row.column_name === expected.column &&
          row.foreign_table === expected.references,
      );

      const label = `${expected.table}.${expected.column} -> ${expected.references}`;

      if (!match) {
        report(false, label);
      } else if (match.delete_rule !== expected.onDelete) {
        report(false, label, `expected ON DELETE ${expected.onDelete}, found ${match.delete_rule}`);
      } else {
        report(true, label, `ON DELETE ${match.delete_rule}`);
      }
    }

    // ── Indexes and unique constraints ──
    // pg_index is the authority: it covers both explicit indexes and the ones
    // PostgreSQL creates to back a unique or primary key constraint.
    const indexes = await pool.query<{
      table_name: string;
      columns: string[];
      is_unique: boolean;
      is_primary: boolean;
    }>(`
      SELECT
        t.relname AS table_name,
        -- Cast to text: array_agg over the name type yields name[], which node-pg
        -- does not parse into a JS array, so the comparison below would see a
        -- raw string instead.
        array_agg(a.attname::text ORDER BY k.ord) AS columns,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public'
      GROUP BY t.relname, ix.indisunique, ix.indisprimary, i.relname
    `);

    const hasIndex = (table: string, columns: string[], unique: boolean): boolean =>
      indexes.rows.some(
        (row) =>
          row.table_name === table &&
          (!unique || row.is_unique) &&
          row.columns.length === columns.length &&
          row.columns.every((column, i) => column === columns[i]),
      );

    section("Unique constraints:");
    for (const expected of REQUIRED_UNIQUE) {
      report(
        hasIndex(expected.table, expected.columns, true),
        `${expected.table}(${expected.columns.join(", ")})`,
      );
    }

    section("Indexes:");
    for (const expected of REQUIRED_INDEXES) {
      report(
        hasIndex(expected.table, expected.columns, false),
        `${expected.table}(${expected.columns.join(", ")})`,
      );
    }

    // ── Primary keys ──
    section("Primary keys:");
    for (const table of REQUIRED_TABLES) {
      report(
        indexes.rows.some((row) => row.table_name === table && row.is_primary),
        table,
      );
    }

    // ── Check constraints ──
    const checks = await pool.query<{ conname: string }>(`
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'c'
    `);
    const checkNames = new Set(checks.rows.map((row) => row.conname));

    section("Check constraints:");
    for (const name of REQUIRED_CHECKS) {
      report(checkNames.has(name), name);
    }

    // ── Generated spatial column ──
    // ADR-0008. GENERATED rather than written by the application, so it cannot
    // drift from the latitude and longitude a host actually entered.
    const geo = await pool.query<{ is_generated: string; index_type: string | null }>(`
      SELECT
        a.attgenerated::text AS is_generated,
        (
          SELECT am.amname
          FROM pg_index ix
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_am am ON am.oid = i.relam
          WHERE ix.indrelid = a.attrelid AND a.attnum = ANY (ix.indkey)
          LIMIT 1
        ) AS index_type
      FROM pg_attribute a
      JOIN pg_class t ON t.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'experiences' AND a.attname = 'geo'
    `);

    section("Spatial column:");
    const geoRow = geo.rows[0];
    report(geoRow !== undefined, "experiences.geo exists");
    report(geoRow?.is_generated === "s", "experiences.geo is GENERATED ... STORED");
    // A B-tree on a geography column is inert; only GiST answers a distance or
    // viewport query.
    report(geoRow?.index_type === "gist", "experiences.geo has a GiST index");

    // ── Seeded vocabulary ──
    // Reported, not asserted: a freshly migrated database legitimately has none
    // until `npm run db:seed` runs.
    const counts = await pool.query<{
      roles: string;
      permissions: string;
      grants: string;
      categories: string;
    }>(`
      SELECT
        (SELECT count(*) FROM roles)::text                        AS roles,
        (SELECT count(*) FROM permissions)::text                  AS permissions,
        (SELECT count(*) FROM role_permissions)::text             AS grants,
        (SELECT count(*) FROM categories WHERE is_active)::text   AS categories
    `);
    const row = counts.rows[0];

    section("Seeded data:");
    console.log(`  roles            ${row?.roles ?? "0"}`);
    console.log(`  permissions      ${row?.permissions ?? "0"}`);
    console.log(`  role grants      ${row?.grants ?? "0"}`);
    console.log(`  categories       ${row?.categories ?? "0"}`);

    // ── Extension functionality ──
    // Confirms the extensions are not merely registered but working. Cheap
    // end-to-end proofs beat a row in pg_extension.
    section("Extension behaviour:");

    if (installed.has("postgis")) {
      const distance = await pool.query<{ metres: number }>(
        `SELECT ST_Distance(
           ST_MakePoint(73.8567, 18.5204)::geography,
           ST_MakePoint(72.8777, 19.0760)::geography
         ) AS metres`,
      );
      const km = Math.round((distance.rows[0]?.metres ?? 0) / 1000);
      report(km > 100 && km < 140, "postgis  ", `Pune to Mumbai = ${km} km (expected ~120)`);
    }

    if (installed.has("vector")) {
      const similarity = await pool.query<{ distance: number }>(
        `SELECT '[1,0,0]'::vector <-> '[0,1,0]'::vector AS distance`,
      );
      const d = Number(similarity.rows[0]?.distance ?? 0);
      report(Math.abs(d - Math.SQRT2) < 0.001, "vector   ", `L2 distance = ${d.toFixed(4)}`);
    }

    if (installed.has("citext")) {
      const ci = await pool.query<{ equal: boolean }>(
        `SELECT 'Test@Example.com'::citext = 'test@example.com'::citext AS equal`,
      );
      report(ci.rows[0]?.equal === true, "citext   ", "case-insensitive comparison");
    }

    if (installed.has("pg_trgm")) {
      const trgm = await pool.query<{ similarity: number }>(
        `SELECT similarity('Lonavala', 'Lonavla') AS similarity`,
      );
      const s = Number(trgm.rows[0]?.similarity ?? 0);
      report(s > 0.4, "pg_trgm  ", `fuzzy similarity = ${s.toFixed(3)}`);
    }

    if (installed.has("pgcrypto")) {
      const uuid = await pool.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`);
      report(typeof uuid.rows[0]?.id === "string", "pgcrypto ", "gen_random_uuid()");
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
