import { PgBoss, fromPrisma } from "pg-boss";
import type { Db } from "pg-boss";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { PrismaClient } from "@/lib/db";

/**
 * pg-boss lifecycle.
 *
 * The queue lives in the same PostgreSQL database as the domain data — that is
 * the whole point of ADR-0001. pg-boss owns its own schema (`pgboss`), kept
 * separate from the application schema so Prisma migrations and queue
 * migrations never collide.
 */

const QUEUE_SCHEMA = "pgboss";

let instance: PgBoss | null = null;

export function createQueue(): PgBoss {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: QUEUE_SCHEMA,
    // Keep the queue's pool small and separate from Prisma's: the worker should
    // never be the reason the web tier cannot get a connection.
    max: 4,
  });

  boss.on("error", (error: Error) => {
    // pg-boss surfaces background failures here rather than by rejecting a
    // promise, so this is the only place they can be observed.
    logger.error({ err: error }, "queue error");
  });

  return boss;
}

/**
 * Shared queue handle for the web process, used to enqueue jobs from request
 * handlers. The worker builds its own instance rather than sharing this one.
 */
export function getQueue(): PgBoss {
  instance ??= createQueue();
  return instance;
}

export async function stopQueue(): Promise<void> {
  if (!instance) return;
  await instance.stop({ graceful: true });
  instance = null;
}

/**
 * Transactional enqueue — the mechanism ADR-0001 exists for.
 *
 * Passing a Prisma transaction client makes the queue insert part of the *same*
 * transaction as the business write. A rolled-back booking therefore cannot
 * leave a queued voucher email behind, and a committed one cannot lose it.
 * Enqueue becomes exactly-once; delivery remains at-least-once, which is why
 * every handler must be idempotent.
 *
 * Usage, once business jobs exist:
 *
 *     await prisma.$transaction(async (tx) => {
 *       const booking = await tx.booking.create({ ... });
 *       await queue.send(
 *         { name: JOB_NAMES.sendVoucher, data: { bookingId: booking.id } },
 *         { db: transactionalDb(tx) },
 *       );
 *     });
 */
export function transactionalDb(tx: Pick<PrismaClient, "$queryRawUnsafe">): Db {
  return fromPrisma(tx);
}

export { PgBoss };
