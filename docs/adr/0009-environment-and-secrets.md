# ADR-0009: Environment validation split between build time and run time

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

`CLAUDE.md` §8 and `DEVELOPMENT_WORKFLOW.md` forbid committed secrets and require
company-managed secret storage. `SYSTEM_DESIGN.md` §11 requires separate
configuration per environment.

The first implementation validated everything at module load, including
production-only invariants. `next build` sets `NODE_ENV=production`, so the build
failed on a CI machine that legitimately has no production database URL and no
https origin. Working around that would have meant putting fake production
secrets in CI — defeating the check it was supposed to perform.

## Decision

Two distinct questions, validated at two distinct times.

**Shape validation, at module load** (`parseEnv` in `src/lib/env.ts`): is each
variable present and well formed? This is build-safe. CI supplies obviously-fake
values and the check still catches typos and omissions.

**Deployment invariants, at server startup** (`assertDeploymentInvariants`):
is this a real production configuration? Enforces https on `APP_URL`, requires
`DIRECT_DATABASE_URL`, and rejects the placeholder `SESSION_SECRET` from
`.env.example`. Called from `src/instrumentation.ts` for the web process and from
`main()` in `src/worker.ts`.

Both processes therefore fail at startup rather than at first request. On ECS the
container fails its health check and is replaced, and the alarm fires.

Further rules:

- **No silent fallbacks.** A missing secret must never resolve to a placeholder
  that lets the process boot in a broken state.
- Validation errors report **variable names only**, never values.
- Provider credentials are optional at this stage; each adapter asserts its own
  when wired, so local development and CI run without production secrets.
- Deployed environments read configuration from AWS Secrets Manager / SSM, never
  from files. `.env` is gitignored; only `.env.example` is committed.

## Consequences

- `next.config.ts` imports nothing from the environment.
- CI needs the base variables set to dummy values, which the workflow does
  inline with an explicit comment that they grant access to nothing.

## Revisit when

A deployment target cannot run the instrumentation hook, at which point the
startup assertion needs another call site.
