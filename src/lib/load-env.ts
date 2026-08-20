import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load environment files for processes Next.js does not start.
 *
 * Next.js loads `.env.local` and `.env` itself for `dev`, `build` and `start`.
 * Nothing else does: Prisma 7 dropped automatic dotenv loading and `tsx` never
 * had it. So the worker and the CLI scripts need this, or they see an empty
 * environment and fail with a confusing "connection url is empty".
 *
 * Import this **before** `@/lib/env`, which parses on import. ES module imports
 * execute in source order, so placing this first is sufficient.
 *
 * Deliberately skipped in production: deployed environments read configuration
 * from AWS Secrets Manager / SSM, never from a file on disk (ADR-0009). A `.env`
 * file present in production is a mistake, and silently honouring it would hide
 * that.
 */

/**
 * Highest precedence first.
 *
 * The order matters and is counter-intuitive. `process.loadEnvFile` does **not**
 * overwrite a variable that is already set — the first value to land wins. So to
 * reproduce Next.js precedence (`.env.local` overrides `.env`, and a real shell
 * variable overrides both) the files must be loaded most-specific first, not
 * last. Reversing this list would silently make `.env` win.
 */
export const ENV_FILES = [".env.local", ".env"] as const;

function loadEnvFiles(): void {
  if (process.env.NODE_ENV === "production") return;

  for (const file of ENV_FILES) {
    const path = resolve(process.cwd(), file);
    // Built into Node 20.12+/22 — no dotenv dependency required.
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

loadEnvFiles();
