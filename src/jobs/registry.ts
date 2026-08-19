import type { Logger } from "pino";

/**
 * Job registry.
 *
 * Background work runs on a PostgreSQL-backed queue (pg-boss), not Redis —
 * ADR-0001. The decisive property is that a job can be enqueued in the *same
 * transaction* as the business write that causes it, which removes the
 * dual-write failure mode: a rolled-back booking cannot leave a queued voucher
 * email, and a committed booking cannot lose one.
 *
 * No business jobs exist yet. This file defines the contract they must satisfy.
 */

/**
 * Every job name in the system. Declaring them centrally keeps queue names from
 * being string literals scattered across modules, and makes the worker's
 * subscription list exhaustive at compile time.
 */
export const JOB_NAMES = {} as const satisfies Record<string, string>;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface JobContext {
  readonly logger: Logger;
  /** Propagated from the request that enqueued the job, for end-to-end tracing. */
  readonly correlationId: string;
  /** Delivery attempt, 1-based. Handlers may use it to vary behaviour on retry. */
  readonly attempt: number;
}

/**
 * A job handler.
 *
 * Handlers MUST be idempotent: the queue guarantees at-least-once delivery, so
 * every handler will eventually run twice for the same payload. Idempotency is
 * the handler's responsibility, keyed on a business identifier — never on the
 * delivery count.
 */
export type JobHandler<TPayload> = (payload: TPayload, context: JobContext) => Promise<void>;

export interface JobDefinition<TPayload> {
  readonly name: string;
  /** Runtime validation of the payload; queued data is untrusted input. */
  readonly parse: (raw: unknown) => TPayload;
  readonly handler: JobHandler<TPayload>;
  readonly options?: JobOptions;
}

export interface JobOptions {
  /** Attempts before the job is dead-lettered. */
  readonly retryLimit?: number;
  /** Base backoff in seconds; pg-boss applies exponential growth. */
  readonly retryDelaySeconds?: number;
  /** Handler wall-clock budget. Exceeding it fails the attempt. */
  readonly expireInSeconds?: number;
}

/**
 * Defaults applied to every job unless it overrides them. Bounded retries plus
 * a dead-letter destination is the requirement from DEVELOPMENT_WORKFLOW.md:
 * background work must not fail silently.
 */
export const DEFAULT_JOB_OPTIONS: Required<JobOptions> = {
  retryLimit: 5,
  retryDelaySeconds: 30,
  expireInSeconds: 120,
};

/**
 * Registered job definitions, in the order the worker subscribes to them.
 *
 * Intentionally empty: business jobs (voucher email, invoice generation,
 * webhook processing, embedding generation, reconciliation sweeps) arrive with
 * the phases that own them.
 */
export const JOB_DEFINITIONS: readonly JobDefinition<unknown>[] = [];
