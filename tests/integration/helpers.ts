import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Shared Prisma client for integration tests.
 *
 * Built directly rather than imported from `@/lib/db` because that module
 * memoises a client against the development URL at import time; the suite needs
 * one bound to TEST_DATABASE_URL, which `setup.ts` has already put in place.
 */
export const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }),
});

/** Domain used by every fixture email, so cleanup can find them all. */
export const TEST_EMAIL_DOMAIN = "@integration.test";

/**
 * Remove test-created rows.
 *
 * Only touches `users` — every fixture in this suite hangs off a user, and the
 * cascades do the rest. Roles and permissions are deliberately left alone: they
 * are seeded reference data, and tests assert against them rather than owning
 * them.
 *
 * `mode: "insensitive"` is required, not cosmetic. Although `users.email` is a
 * citext column, Prisma casts the operand to text for `endsWith`/`contains`,
 * which defeats citext and makes pattern matching case-sensitive. Equality via
 * `findUnique` is unaffected. Without this, a fixture created with an uppercase
 * address survives cleanup.
 */
export async function cleanupUsers(): Promise<void> {
  await testDb.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
  });
}

let counter = 0;

/** Unique address per call, in a domain the cleanup helper recognises. */
export function testEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@integration.test`;
}

export async function createTestUser(email = testEmail()): Promise<{ id: string; email: string }> {
  const user = await testDb.user.create({
    data: { email },
    select: { id: true, email: true },
  });
  return user;
}
