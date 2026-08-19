import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getLogger, withLogContext } from "@/lib/logger";
import { ValidationError, toAppError, toErrorResponseBody } from "@/lib/errors";

/**
 * HTTP adapter layer.
 *
 * Route handlers stay thin: authenticate, validate, call a domain service, map
 * the result. Everything cross-cutting — correlation IDs, structured logging,
 * error translation — lives here so it cannot be forgotten per-route.
 */

const CORRELATION_HEADER = "x-correlation-id";

/**
 * Reuse an inbound correlation ID when the edge supplied one, so a request can
 * be traced across CloudFront, the app and the worker. Only accept a
 * well-formed UUID: this value reaches the logs, and an unbounded client-
 * supplied string is a log-injection vector.
 */
function resolveCorrelationId(request: Request): string {
  const inbound = request.headers.get(CORRELATION_HEADER);
  if (inbound && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inbound)) {
    return inbound;
  }
  return randomUUID();
}

export type RouteHandler = (request: Request) => Promise<Response>;

/**
 * Wrap a route handler with logging context and centralized error handling.
 *
 * Operational errors are logged at `warn` and returned with their own status.
 * Anything else is a defect: logged at `error` with the stack, and returned to
 * the client as an opaque 500 keyed by correlation ID.
 */
export function withRoute(handler: RouteHandler): RouteHandler {
  return async (request: Request): Promise<Response> => {
    const correlationId = resolveCorrelationId(request);

    return withLogContext({ correlationId }, async () => {
      const log = getLogger();
      const startedAt = Date.now();

      try {
        const response = await handler(request);
        response.headers.set(CORRELATION_HEADER, correlationId);

        log.info(
          {
            method: request.method,
            path: new URL(request.url).pathname,
            status: response.status,
            durationMs: Date.now() - startedAt,
          },
          "request completed",
        );

        return response;
      } catch (caught) {
        const error = toAppError(caught);

        const logPayload = {
          method: request.method,
          path: new URL(request.url).pathname,
          status: error.httpStatus,
          durationMs: Date.now() - startedAt,
          code: error.code,
          context: error.context,
        };

        if (error.isOperational) {
          log.warn(logPayload, error.message);
        } else {
          log.error({ ...logPayload, err: error }, "unhandled error");
        }

        return NextResponse.json(toErrorResponseBody(error, correlationId), {
          status: error.httpStatus,
          headers: { [CORRELATION_HEADER]: correlationId },
        });
      }
    });
  };
}

/**
 * Parse and validate a JSON request body.
 *
 * Validation failures become `ValidationError`, which the wrapper turns into a
 * 400 — no route should be inspecting Zod results itself.
 */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch (cause) {
    throw new ValidationError("Request body is not valid JSON", {}, { cause });
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("Request body failed validation", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  return result.data;
}

/** Validate query string parameters with the same failure semantics. */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());

  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ValidationError("Query parameters failed validation", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  return result.data;
}

export function jsonResponse<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}
