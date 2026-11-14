import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "@/lib/env";

/**
 * Prisma client singleton.
 *
 * Prisma 7 connects through a driver adapter rather than a schema-level URL, so
 * the pool is configured here — one place, shared by the Next.js server and the
 * worker process.
 *
 * The singleton is pinned on `globalThis` in every environment. In development
 * hot reload would otherwise create a new pool on every edit; in production a
 * module evaluated more than once (separate route bundles) would do the same,
 * and Supabase's session pooler (pool_size 15) rejects the overflow with
 * EMAXCONNSESSION.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    // Bounded pool: the web service and the worker both draw from the same
    // Supabase session pooler (pool_size 15), so each process keeps a small
    // pool and releases idle connections quickly.
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log: isProduction ? ["warn", "error"] : ["warn", "error"],
  });
}

export const prisma: PrismaClient = (globalForPrisma.prisma ??= createPrismaClient());

export type { PrismaClient };
