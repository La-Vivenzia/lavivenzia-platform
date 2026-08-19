import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";
import { env, isProduction, isTest } from "@/lib/env";

/**
 * Structured logging.
 *
 * Production emits newline-delimited JSON for CloudWatch ingestion; development
 * uses pino-pretty. Every log line carries a correlation ID so a request or job
 * can be reconstructed end to end (SYSTEM_DESIGN §13).
 */

interface RequestContext {
  correlationId: string;
  /** Populated once authentication runs; absent for anonymous traffic. */
  userId?: string;
  /** Job name, when logging from the worker rather than an HTTP request. */
  jobName?: string;
}

const contextStore = new AsyncLocalStorage<RequestContext>();

/**
 * Keys that must never reach the logs, at any nesting depth. Redaction is a
 * control, not a convention — CLAUDE.md §8 forbids printing secrets.
 */
const REDACTED_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "req.headers.authorization",
  "req.headers.cookie",
];

const baseLogger: Logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
  base: { service: "lavivenzia", env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
        },
      }),
});

/**
 * The logger for the current request or job. Falls back to the base logger
 * outside any context (module init, scripts).
 */
export function getLogger(): Logger {
  const context = contextStore.getStore();
  return context ? baseLogger.child(context) : baseLogger;
}

/** Run `fn` with a logging context bound to the current async execution. */
export function withLogContext<T>(context: RequestContext, fn: () => T): T {
  return contextStore.run(context, fn);
}

export function getCorrelationId(): string | undefined {
  return contextStore.getStore()?.correlationId;
}

/**
 * Attach the authenticated user to the active context. Called once, after
 * authentication resolves, so every subsequent line in the request is
 * attributable.
 */
export function setLogUser(userId: string): void {
  const context = contextStore.getStore();
  if (context) context.userId = userId;
}

export const logger = baseLogger;
