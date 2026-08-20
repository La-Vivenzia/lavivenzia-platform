import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgBoss } from "pg-boss";
import { testDb } from "./helpers";
import { transactionalDb } from "@/jobs/queue";

/**
 * pg-boss against a real database.
 *
 * The property worth proving here is the one ADR-0001 rests on: a job can be
 * enqueued inside the same transaction as a business write, so a rollback takes
 * the job with it. That is the entire reason the queue lives in PostgreSQL
 * rather than Redis, and it is not something a unit test can demonstrate.
 */

const QUEUE_SCHEMA = "pgboss_test";
const QUEUE_NAME = "integration-probe";

let boss: PgBoss;

beforeAll(async () => {
  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: QUEUE_SCHEMA,
    max: 2,
  });

  // pg-boss surfaces background failures on an event rather than a rejection.
  boss.on("error", () => {
    /* asserted through behaviour below, not through this channel */
  });

  await boss.start();
  await boss.createQueue(QUEUE_NAME);
}, 60_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await testDb.$disconnect();
});

/** Count jobs carrying a marker, reading pg-boss's own table. */
async function countJobsWithMarker(marker: string): Promise<number> {
  const rows = await testDb.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) AS count FROM ${QUEUE_SCHEMA}.job WHERE data->>'marker' = $1`,
    marker,
  );
  return Number(rows[0]?.count ?? 0);
}

describe("pg-boss connectivity", () => {
  it("provisions its own schema, separate from the application schema", async () => {
    const rows = await testDb.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = $1`,
      QUEUE_SCHEMA,
    );

    expect(Number(rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });

  it("accepts a job and returns an id", async () => {
    const id = await boss.send(QUEUE_NAME, { probe: true });
    expect(id).toBeTruthy();
  });

  it("round-trips a job payload through fetch", async () => {
    await boss.send(QUEUE_NAME, { marker: "round-trip" });

    const jobs = await boss.fetch(QUEUE_NAME, { batchSize: 10 });
    const found = jobs.find(
      (job) => (job.data as { marker?: string } | null)?.marker === "round-trip",
    );

    expect(found).toBeDefined();
    if (found) await boss.complete(QUEUE_NAME, found.id);
  });
});

describe("transactional enqueue", () => {
  it("discards the job when the surrounding transaction rolls back", async () => {
    // The dual-write failure mode ADR-0001 exists to prevent: without this
    // property, a rolled-back booking could still send its voucher email.
    //
    // Exercises the real production helper (`transactionalDb`), not a
    // hand-written INSERT, so the test breaks if that helper ever stops
    // enlisting in the caller's transaction.
    const marker = `rollback-${Date.now()}`;

    await expect(
      testDb.$transaction(async (tx) => {
        await boss.send(QUEUE_NAME, { marker }, { db: transactionalDb(tx) });
        throw new Error("deliberate rollback");
      }),
    ).rejects.toThrow("deliberate rollback");

    expect(await countJobsWithMarker(marker)).toBe(0);
  });

  it("keeps the job when the transaction commits", async () => {
    const marker = `commit-${Date.now()}`;

    await testDb.$transaction(async (tx) => {
      await boss.send(QUEUE_NAME, { marker }, { db: transactionalDb(tx) });
    });

    expect(await countJobsWithMarker(marker)).toBe(1);
  });
});
