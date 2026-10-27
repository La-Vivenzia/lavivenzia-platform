import { z } from "zod";
import { withoutEmptyValues } from "@/lib/env-utils";
import { EMAIL_TRANSPORTS } from "@/adapters/email/transport";
import { MEDIA_STORAGE_TRANSPORTS } from "@/adapters/storage/transport";

/**
 * Environment validation (ADR-0009).
 *
 * Parsed once, at module load, so that a misconfigured deployment fails
 * immediately and loudly instead of throwing at the first request. There are no
 * silent fallbacks: a missing production secret must never resolve to a
 * placeholder that lets the process boot in a broken state.
 */

const nodeEnv = z.enum(["development", "test", "production"]);

const baseSchema = z.object({
  NODE_ENV: nodeEnv.default("development"),

  /** Postgres connection string. Pooled connection used by the app and worker. */
  DATABASE_URL: z.url().startsWith("postgres", {
    message: "DATABASE_URL must be a postgres:// or postgresql:// URL",
  }),
  /** Direct (unpooled) connection, required by Prisma Migrate. */
  DIRECT_DATABASE_URL: z
    .url()
    .startsWith("postgres", {
      message: "DIRECT_DATABASE_URL must be a postgres:// or postgresql:// URL",
    })
    .optional(),

  /** Canonical public origin, used for absolute URLs, cookies and callbacks. */
  APP_URL: z.url().default("http://localhost:3000"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  /**
   * Signing key for server-side session cookies. Sessions are opaque IDs stored
   * in Postgres; this key signs the cookie so a tampered value is rejected
   * before it reaches the database (ADR-0005).
   */
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  /** Worker tuning. Kept here so the worker fails fast on bad config too. */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(100).default(5),
  WORKER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  /**
   * Serve the Pune pilot catalogue from memory when PostgreSQL is unreachable,
   * so the homepage and copilot render without a database.
   *
   * Unset means "on outside production, off in production". Set `true` only on
   * a preview that runs with NODE_ENV=production and has no database; never on
   * the real production deployment, where an outage must look like one.
   */
  DISCOVERY_OFFLINE_FALLBACK: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

/**
 * Provider credentials.
 *
 * Every one of these is optional at this stage: the adapters are boundaries
 * only, with no business logic behind them yet, and several providers are still
 * awaiting founder approval (see PROJECT_STATE.md → Pending decisions). An
 * adapter is responsible for asserting its own credentials when it is first
 * wired up — that keeps local development and CI runnable without production
 * secrets, while still failing fast at the point of real use.
 */
const providerSchema = z.object({
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),

  /**
   * Embeddings provider is NOT yet approved. The variables exist so the adapter
   * boundary can be wired, but no provider is selected and no vector dimension
   * is committed to the schema. See docs/adr/0007-llm-and-embeddings.md.
   */
  EMBEDDINGS_PROVIDER: z.string().optional(),
  EMBEDDINGS_API_KEY: z.string().optional(),

  GOOGLE_MAPS_API_KEY: z.string().optional(),

  AWS_REGION: z.string().default("ap-south-1"),

  /**
   * Where experience media is stored.
   *
   * `local` writes under `public/uploads`, which Next.js serves statically, so
   * the media flow works on a laptop with no AWS account. Production refuses it
   * below: a container filesystem is ephemeral, so uploads would appear to save
   * and then vanish on the next deploy.
   */
  MEDIA_STORAGE: z.enum(MEDIA_STORAGE_TRANSPORTS).default("local"),
  S3_MEDIA_BUCKET: z.string().optional(),

  /**
   * S3-compatible object storage (Cloudflare R2).
   *
   * `S3_ENDPOINT` is where objects are written; `S3_PUBLIC_BASE_URL` is where
   * browsers read them. On R2 these are different hosts and must not be
   * conflated. The credentials are secret: supplied by the environment, never
   * committed, never logged.
   */
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.url().optional(),

  /**
   * Transactional email (ADR-0011).
   *
   * `console` renders the message and writes it to the log instead of sending;
   * `ses` delivers through Amazon SES. The default is deliberately the harmless
   * one, and production refuses it below — a deployment that forgets to set
   * this fails at startup rather than silently sending nothing.
   */
  EMAIL_TRANSPORT: z.enum(EMAIL_TRANSPORTS).default("console"),
  /** Sender address. Must be an identity verified in SES before it will send. */
  EMAIL_FROM: z.email().optional(),
  /**
   * SES configuration set. Optional, but it is what publishes bounce and
   * complaint events; without one those signals never reach us and the sending
   * reputation degrades unobserved.
   */
  SES_CONFIGURATION_SET: z.string().optional(),

  /**
   * Resend API key. Secret: supplied by the environment, never committed, and
   * never logged — the adapter records the provider error name and status only.
   */
  RESEND_API_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
});

const envSchema = baseSchema.merge(providerSchema);

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(withoutEmptyValues(process.env));

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    // Never echo values — only the names of the offending variables.
    throw new Error(
      `Invalid environment configuration:\n${details}\n\n` +
        `See .env.example for the required variables.`,
    );
  }

  return result.data;
}

export const env: Env = parseEnv();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/**
 * Deployment invariants — checked at server startup, not at module load.
 *
 * The distinction matters. "Is this variable present and well formed?" is a
 * build-safe question, and the schema above answers it at import. "Is this a
 * real production configuration?" is not: a CI build machine has no production
 * database and no https origin, so asserting these during `next build` would
 * force fake production secrets into CI and defeat the check entirely.
 *
 * Called from src/instrumentation.ts and from the worker entrypoint.
 */
export function assertDeploymentInvariants(): void {
  if (env.NODE_ENV !== "production") return;

  const problems: string[] = [];

  if (env.APP_URL.startsWith("http://")) {
    problems.push("APP_URL must use https in production");
  }
  if (!env.DIRECT_DATABASE_URL) {
    problems.push("DIRECT_DATABASE_URL is required in production for migrations");
  }
  if (env.SESSION_SECRET.startsWith("replace-me")) {
    problems.push("SESSION_SECRET is still the placeholder value from .env.example");
  }
  if (env.EMAIL_TRANSPORT === "console") {
    // The console transport reports success while sending nothing, and writes
    // login codes into a retained log. In production that is both an outage
    // travellers cannot see and a credential disclosure.
    problems.push(
      "EMAIL_TRANSPORT must be 'resend' or 'ses' in production; 'console' sends no mail",
    );
  }
  if (env.EMAIL_TRANSPORT === "resend" && !env.RESEND_API_KEY) {
    problems.push("RESEND_API_KEY is required in production when EMAIL_TRANSPORT=resend");
  }
  if (!env.EMAIL_FROM) {
    problems.push(
      "EMAIL_FROM is required in production (an address on a domain verified with the configured provider)",
    );
  }
  if (env.MEDIA_STORAGE === "s3" && !env.S3_MEDIA_BUCKET) {
    problems.push("S3_MEDIA_BUCKET is required when MEDIA_STORAGE is 's3'");
  }

  if (problems.length > 0) {
    const details = problems.map((problem) => `  - ${problem}`).join("\n");
    throw new Error(`Invalid production configuration:\n${details}`);
  }
}
