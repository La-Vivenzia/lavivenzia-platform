# ADR-0002: Single Next.js deployable plus a worker, not a separate API service

- **Status:** Accepted
- **Date:** 2026-08-19
- **Decides:** D2 from the Phase 0.1 architecture report

## Context

`System Design.png` showed a separate Node/TypeScript API service on ECS behind
an ALB, with Next.js clients calling it. The markdown never resolved whether the
"Node.js API" was that, or Next.js route handlers in one application.

Arguments for a separate service: three first-class clients in launch scope,
API-first as a stated principle (`PROJECT.md` §3.4), stable webhook endpoints,
and eventual independent scaling of AI/search.

Three of those dissolve on inspection. The host portal and admin console are
logical clients that live naturally as route groups in one application. Next.js
route handlers on the Node runtime handle raw-body webhook verification fine.
Independent scaling is a later-phase concern with no launch evidence, which
`DEVELOPMENT_WORKFLOW.md` explicitly forbids building for.

The surviving argument is mobile — and mobile is deferred by `PROJECT.md` §9. So
the requirement is not "build a standalone API now" but "do not build something
that requires a rewrite when mobile arrives".

The cost of splitting lands where the project can least afford it: two deploy
targets, cross-origin auth, a duplicated validation boundary, two CI pipelines —
realistically 15-25% of an eight-week budget, spent on a deferred capability.

Reversibility is asymmetric. If the domain layer never imports Next.js,
extracting a service later is mechanical. Merging two services back together
means the tax was paid for nothing.

## Decision

One Next.js application on the Node runtime exposing a versioned,
client-agnostic `/api/v1/*` REST surface, plus a **separate worker entrypoint
from the same codebase** (`src/worker.ts`), shipped as one artifact with two
start commands.

Three properties make this equivalent to a split without the cost:

1. The API is client-agnostic from day one — the frontend consumes `/api/v1`
   exactly as a mobile client will. No privileged internal path.
2. `src/modules` and `src/ports` import nothing from Next.js or React, enforced
   by the `no-restricted-imports` boundary rule in `eslint.config.mjs`.
3. The worker already exercises the separation: it runs the same services with
   no HTTP involved.

## Consequences

- `System Design.png` is demoted to a Phase 2+ target reference (ADR-0003).
- The lint boundary is load-bearing. Weakening it forfeits the reversibility
  that justified this decision.
- Both processes share a database connection budget; pools are bounded in
  `src/lib/db.ts` and `src/jobs/queue.ts`.

## Revisit when

A second first-class client ships (mobile), or AI/search load demonstrably needs
scaling independent of page rendering.
