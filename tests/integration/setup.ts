import "../../src/lib/load-env";

/**
 * Integration test setup.
 *
 * Points the suite at a dedicated test database and fails loudly if it is not
 * configured, rather than silently falling back to the development database —
 * these tests truncate tables, and a silent fallback would delete a developer's
 * local work.
 */

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set.\n\n" +
      "Integration tests need their own database so they can truncate tables safely.\n" +
      "Run `npm run db:test:setup` to create and migrate it.",
  );
}

// Guard against pointing the suite at anything that is not clearly disposable.
const database = new URL(testUrl).pathname.replace(/^\//, "");
if (!database.includes("test")) {
  throw new Error(
    `Refusing to run integration tests against database '${database}'.\n` +
      "The name must contain 'test' — these tests truncate tables.",
  );
}

// Everything downstream (Prisma client, pg pools) reads DATABASE_URL, so redirect
// it for the duration of the suite.
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_DATABASE_URL = testUrl;

// Vitest already sets NODE_ENV=test, but assert it rather than assume: the
// deployment invariants in src/lib/env.ts behave differently under production,
// and a stray NODE_ENV in the shell would otherwise change what is under test.
// The cast is needed because Next.js types NODE_ENV as read-only.
(process.env as Record<string, string>).NODE_ENV = "test";
