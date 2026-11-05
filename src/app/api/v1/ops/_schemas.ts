import { z } from "zod";
import { EXPERIENCE_STATUSES } from "@/modules/experiences/lifecycle";
import { HOST_VERIFICATION_STATUSES } from "@/modules/hosts/profile";
import {
  EXPERIENCE_DECISIONS,
  HOST_DECISIONS,
  REVIEW_NOTE_LIMITS,
} from "@/modules/operations/review";
import { MAX_PAGE_SIZE } from "@/modules/operations/ports";
import { DEFAULT_METERING_CAPACITY } from "@/modules/metering/service";
import {
  API_OPERATIONS,
  API_PROVIDERS,
  OPERATION_PROVIDER,
  SUMMARY_PERIODS,
  USAGE_STATUSES,
} from "@/modules/metering/types";

/**
 * Request schemas for the operations surface.
 *
 * Note what is absent: there is no actor, reviewer or admin field anywhere.
 * The decision endpoints take an id, a decision and a note, and nothing else —
 * who performed the action is read from the session, so a client has nowhere to
 * claim to be someone.
 */

/** Query strings arrive as text; coerce and bound before anything sees them. */
const pageSchema = z.coerce.number().int().min(1).max(100_000).optional();
const pageSizeSchema = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional();

/**
 * Free-text search.
 *
 * Bounded because it becomes an `ILIKE` pattern. An unbounded term is a cheap
 * way to make the database do expensive work on every keystroke.
 */
const searchSchema = z
  .string()
  .max(120)
  .transform((value) => value.trim())
  .optional();

/** An ISO date from a filter control, rejected rather than silently ignored. */
const dateSchema = z.coerce.date().optional();

export const experienceQuerySchema = z
  .object({
    status: z.enum(EXPERIENCE_STATUSES).optional(),
    categoryId: z.uuid().optional(),
    hostId: z.uuid().optional(),
    city: z.string().max(80).optional(),
    search: searchSchema,
    submittedFrom: dateSchema,
    submittedTo: dateSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

export const hostQuerySchema = z
  .object({
    status: z.enum(HOST_VERIFICATION_STATUSES).optional(),
    search: searchSchema,
    createdFrom: dateSchema,
    createdTo: dateSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/**
 * A review decision.
 *
 * The note is optional here and *conditionally* required in the domain, which
 * is where the rule belongs: whether a reason is mandatory depends on which
 * decision it is, and that table lives in `review.ts`. Enforcing it here as
 * well would be the same rule in two places, free to drift.
 */
const noteSchema = z
  .string()
  .max(REVIEW_NOTE_LIMITS.max, `Keep it under ${REVIEW_NOTE_LIMITS.max} characters.`)
  .transform((value) => value.trim())
  .nullable()
  .optional();

export const experienceDecisionSchema = z
  .object({ decision: z.enum(EXPERIENCE_DECISIONS), note: noteSchema })
  .strict();

export const hostDecisionSchema = z
  .object({ decision: z.enum(HOST_DECISIONS), note: noteSchema })
  .strict();

/**
 * A usage event reported by an internal service (FinOps metering).
 *
 * Cost, id and timestamp are absent on purpose: the reporter states what it
 * used, and the price list decides what that cost. A caller has no field in
 * which to claim a price.
 */
const METADATA_MAX_KEYS = 20;
const METADATA_MAX_BYTES = 2_048;

export const meteringEventSchema = z
  .object({
    provider: z.enum(API_PROVIDERS),
    operation: z.enum(API_OPERATIONS),
    units: z.number().int().min(0).max(1_000_000_000_000),
    latencyMs: z.number().min(0).max(3_600_000).default(0),
    status: z.enum(USAGE_STATUSES).default("SUCCESS"),
    metadata: z
      .record(z.string().max(64), z.unknown())
      .refine((value) => Object.keys(value).length <= METADATA_MAX_KEYS, {
        message: `At most ${METADATA_MAX_KEYS} metadata keys.`,
      })
      .refine((value) => JSON.stringify(value).length <= METADATA_MAX_BYTES, {
        message: `Metadata must serialise to at most ${METADATA_MAX_BYTES} bytes.`,
      })
      .optional(),
  })
  .strict()
  .refine((event) => OPERATION_PROVIDER[event.operation] === event.provider, {
    message: "Operation does not belong to that provider.",
    path: ["operation"],
  });

export const meteringQuerySchema = z
  .object({
    period: z.enum(SUMMARY_PERIODS).optional(),
    limit: z.coerce.number().int().min(0).max(DEFAULT_METERING_CAPACITY).optional(),
  })
  .strict();
