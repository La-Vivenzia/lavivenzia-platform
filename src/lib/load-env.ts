import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `.env` for processes Next.js does not start.
 *
 * Next.js loads `.env` itself for `dev`, `build` and `start`. Nothing else does:
 * Prisma 7 dropped automatic dotenv loading, and `tsx` never had it. So the
 * worker and the CLI scripts need this, or they see an empty environment and
 * fail with a confusing "connection url is empty".
 *
 * Import this **before** `@/lib/env`, which parses on import. ES module imports
 * execute in source order, so placing this first is sufficient.
 *
 * Deliberately skipped in production: deployed environments read configuration
 * from AWS Secrets Manager / SSM, never from a file on disk (ADR-0009). A `.env`
 * present in production is a mistake, and silently honouring it would hide that.
 */
function loadDotEnvIfPresent(): void {
  if (process.env.NODE_ENV === "production") return;

  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;

  // Built into Node 20.12+/22 — no dotenv dependency required. Values already
  // present in the real environment win, which keeps CI and shell overrides
  // authoritative over the file.
  process.loadEnvFile(path);
}

loadDotEnvIfPresent();
