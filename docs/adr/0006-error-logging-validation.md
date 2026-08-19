# ADR-0006: Shared error model, structured logging, boundary validation

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

`SYSTEM_DESIGN.md` §13 requires graceful failure, retries with limits and
centralized logs. `DEVELOPMENT_WORKFLOW.md` requires that background work not
fail silently. Without a shared model, every route and job invents its own.

## Decision

**One error hierarchy** (`src/lib/errors.ts`). Domain code throws `AppError`
subclasses carrying a stable `code`, an `httpStatus`, `isOperational` and
`isRetryable`. The HTTP layer maps them to responses; the worker maps them to
retry decisions. Nothing else decides what an error means.

Non-operational errors return an opaque message to the client, keyed by
correlation ID — the real detail goes to the logs, never to the caller.

**Structured logging** (`src/lib/logger.ts`) via pino: JSON in production, pretty
in development. An `AsyncLocalStorage` context carries a correlation ID through
every log line in a request or job. Secret-bearing keys are redacted by path at
any depth, because `CLAUDE.md` §8 forbids printing secrets and a convention is
not a control.

Correlation IDs are reused from an inbound `x-correlation-id` header only when
well-formed as UUIDs — an unbounded client-supplied string that reaches the logs
is an injection vector.

**Validation at the boundary** with Zod (`src/lib/http.ts`). Request bodies and
query strings are parsed against a schema; failures become `ValidationError` and
therefore a 400. No route inspects a Zod result itself.

Adapters that exist as boundaries only throw `NotImplementedError` rather than
returning empty data, so an accidental call is loud and traceable instead of
silently producing wrong results.

## Consequences

- Adding an error case means adding a subclass, not inventing a response shape.
- Route handlers stay thin: authenticate, validate, call a service, map.
- Job payloads are validated on dequeue — queued data is untrusted input.

## Revisit when

An API consumer requires an RFC 7807 problem+json contract.
