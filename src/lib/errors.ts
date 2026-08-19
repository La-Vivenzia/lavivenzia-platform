/**
 * Centralized error model.
 *
 * Domain code throws `AppError` subclasses; the HTTP layer maps them to a
 * response shape and the worker maps them to a retry decision. Nothing else in
 * the codebase should decide what an error "means".
 */

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "NOT_IMPLEMENTED"
  | "INTERNAL";

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;

  /**
   * Operational errors are expected conditions (bad input, missing record).
   * Non-operational errors indicate a defect and should page someone.
   */
  readonly isOperational: boolean = true;

  /**
   * Whether retrying the same operation could plausibly succeed. The worker
   * uses this to distinguish a transient provider failure from a poison job.
   */
  readonly isRetryable: boolean = false;

  readonly context: Readonly<Record<string, unknown>>;

  constructor(message: string, context: Record<string, unknown> = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.context = Object.freeze({ ...context });
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_FAILED" as const;
  readonly httpStatus = 400;
}

export class UnauthenticatedError extends AppError {
  readonly code = "UNAUTHENTICATED" as const;
  readonly httpStatus = 401;

  constructor(message = "Authentication required", context?: Record<string, unknown>) {
    super(message, context);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN" as const;
  readonly httpStatus = 403;

  constructor(message = "Insufficient permissions", context?: Record<string, unknown>) {
    super(message, context);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND" as const;
  readonly httpStatus = 404;
}

/** Concurrent modification, duplicate key, or an invalid state transition. */
export class ConflictError extends AppError {
  readonly code = "CONFLICT" as const;
  readonly httpStatus = 409;
}

export class RateLimitedError extends AppError {
  readonly code = "RATE_LIMITED" as const;
  readonly httpStatus = 429;
  override readonly isRetryable = true;
}

/** An external provider failed in a way that may resolve on its own. */
export class ProviderUnavailableError extends AppError {
  readonly code = "PROVIDER_UNAVAILABLE" as const;
  readonly httpStatus = 502;
  override readonly isRetryable = true;
}

export class ProviderTimeoutError extends AppError {
  readonly code = "PROVIDER_TIMEOUT" as const;
  readonly httpStatus = 504;
  override readonly isRetryable = true;
}

/**
 * A boundary that exists structurally but has no implementation yet. Used by
 * adapter stubs so that an accidental call fails loudly and traceably rather
 * than silently returning empty data.
 */
export class NotImplementedError extends AppError {
  readonly code = "NOT_IMPLEMENTED" as const;
  readonly httpStatus = 501;
  override readonly isOperational = false;
}

export class InternalError extends AppError {
  readonly code = "INTERNAL" as const;
  readonly httpStatus = 500;
  override readonly isOperational = false;
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Narrow an unknown thrown value to an `AppError`. Anything that is not already
 * one is a defect, so it becomes a non-operational `InternalError` with the
 * original attached as `cause`.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const message = error instanceof Error ? error.message : String(error);
  return new InternalError(message, {}, { cause: error });
}

/** Serializable error payload returned by the HTTP layer. */
export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    correlationId: string;
  };
}

/**
 * Build the client-facing body. Internal errors are deliberately opaque — the
 * real message goes to the logs, keyed by correlation ID, never to the client.
 */
export function toErrorResponseBody(error: AppError, correlationId: string): ErrorResponseBody {
  return {
    error: {
      code: error.code,
      message: error.isOperational ? error.message : "An unexpected error occurred.",
      correlationId,
    },
  };
}
