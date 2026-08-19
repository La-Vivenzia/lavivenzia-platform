// Must precede any import that reads the environment.
import "@/lib/load-env";

import { randomUUID } from "node:crypto";
import type { JobWithMetadata } from "pg-boss";
import { assertDeploymentInvariants, env } from "@/lib/env";
import { logger, withLogContext } from "@/lib/logger";
import { toAppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { createQueue } from "@/jobs/queue";
import { DEFAULT_JOB_OPTIONS, JOB_DEFINITIONS, type JobDefinition } from "@/jobs/registry";

/**
 * Worker entrypoint.
 *
 * Runs as a separate process from the same codebase and image (ADR-0002): the
 * web service starts `next start`, the worker starts this file. They share the
 * domain layer, so a job and a request execute identical business logic.
 *
 * No business jobs are registered yet — `JOB_DEFINITIONS` is empty. This process
 * currently starts the queue, subscribes to nothing, and shuts down cleanly.
 * That is deliberate: the lifecycle, logging and shutdown semantics are the part
 * that is hard to retrofit once jobs exist.
 */

const boss = createQueue();

/** Wrap a handler so every job runs inside a logging context with retry-aware error handling. */
async function subscribe(definition: JobDefinition<unknown>): Promise<string> {
  const options = { ...DEFAULT_JOB_OPTIONS, ...definition.options };

  const workerId = await boss.work(
    definition.name,
    { batchSize: 1, includeMetadata: true },
    async (jobs: JobWithMetadata<unknown>[]) => {
      const job = jobs[0];
      if (!job) return;

      // Correlation IDs are propagated from the enqueuing request when present,
      // so a job can be traced back to the user action that caused it.
      const data = job.data as { correlationId?: string } | null;
      const correlationId = data?.correlationId ?? randomUUID();

      await withLogContext({ correlationId, jobName: definition.name }, async () => {
        const log = logger.child({ correlationId, jobName: definition.name, jobId: job.id });
        const startedAt = Date.now();

        try {
          const payload = definition.parse(job.data);
          await definition.handler(payload, {
            logger: log,
            correlationId,
            attempt: job.retryCount + 1,
          });

          log.info({ durationMs: Date.now() - startedAt }, "job completed");
        } catch (caught) {
          const error = toAppError(caught);

          log.error(
            {
              durationMs: Date.now() - startedAt,
              attempt: job.retryCount + 1,
              retryLimit: options.retryLimit,
              code: error.code,
              retryable: error.isRetryable,
              context: error.context,
              err: error,
            },
            "job failed",
          );

          // Rethrow so pg-boss records the failure and applies its retry policy.
          // Exhausted retries land in the dead-letter queue, which is alarmed on.
          throw error;
        }
      });
    },
  );

  logger.info({ jobName: definition.name, retryLimit: options.retryLimit }, "job registered");
  return workerId;
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker shutting down");

  try {
    // Graceful stop lets in-flight handlers finish before the process exits, so
    // a deploy does not turn running jobs into retries.
    await boss.stop({ graceful: true });
    await prisma.$disconnect();
    logger.info("worker stopped cleanly");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "error during shutdown");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // Same startup gate the web process applies via src/instrumentation.ts.
  assertDeploymentInvariants();

  if (!env.WORKER_ENABLED) {
    logger.warn("WORKER_ENABLED is false; exiting without starting the queue");
    return;
  }

  await boss.start();
  logger.info({ concurrency: env.WORKER_CONCURRENCY }, "queue started");

  await Promise.all(JOB_DEFINITIONS.map(subscribe));

  if (JOB_DEFINITIONS.length === 0) {
    logger.info("no jobs registered yet — worker is idle by design (see src/jobs/registry.ts)");
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "worker failed to start");
  process.exit(1);
});
