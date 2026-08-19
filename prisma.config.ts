import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 dropped automatic dotenv loading, so the CLI would otherwise see an
// empty environment and fail with "connection url is empty". Inlined rather
// than imported because a Prisma config file must stand alone.
if (process.env.NODE_ENV !== "production") {
  const envFile = resolve(process.cwd(), ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Only the CLI reads this file — migrations, introspection, studio. Application
 * and worker connections are made through the pg driver adapter in
 * src/lib/db.ts.
 *
 * Migrations use the direct, unpooled connection: Prisma Migrate takes advisory
 * locks and issues DDL, neither of which survive a transaction pooler. We read
 * `process.env` directly rather than Prisma's `env()` helper so that a missing
 * variable degrades to "migrations unavailable" instead of breaking `generate`
 * and `validate`, which need no connection at all.
 */
const migrationUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url: migrationUrl,
    /**
     * Required by `prisma migrate diff --from-migrations`, which CI uses to
     * assert that schema.prisma and the migrations directory agree. Prisma
     * replays every migration into this throwaway database to compute the diff,
     * so it must be a separate database the migration role can fully control.
     */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? "",
  },

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
