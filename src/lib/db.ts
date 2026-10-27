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
 * The singleton guard matters in development, where hot reload would otherwise
 * create a new pool on every edit and exhaust Postgres connections.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    // Bounded pool: the web service and the worker both draw from the same
    // database, so an unbounded pool per process is how connection limits get
    // exhausted under load.
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  return new PrismaClient({
    adapter,
    log: isProduction ? ["warn", "error"] : ["warn", "error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
