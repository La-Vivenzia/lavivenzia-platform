# Project State

Living record of what exists, what is pending, and what is blocked. Updated at
the end of every task, per `DEVELOPMENT_WORKFLOW.md`.

**Last updated:** 2026-08-19
**Current phase:** 0 — Engineering Foundation
**Status:** Phase 0.11 complete and verified against a real database.

---

## What exists

### Repository and toolchain

Git initialised on `main`. Node 22, Next.js 16.3.1, React 19.2.8, TypeScript
5.9.3, Tailwind CSS 4.

TypeScript is pinned to 5.9.3 rather than the newly released 7.x because
`typescript-eslint` supports `<6.1.0`; adopting TS 7 would silently disable
linting.

### Architecture

One Next.js deployable plus a separate worker entrypoint from the same codebase
(ADR-0002), with the layering:

```
src/app/          UI and /api/v1 HTTP adapters (thin)
src/modules/      domain logic — framework-free
src/ports/        provider interfaces the domain owns
src/adapters/     provider implementations
src/jobs/         queue lifecycle and job registry
src/lib/          env, logger, errors, http, db
src/worker.ts     worker entrypoint
```

The domain boundary is **enforced by lint**, not convention: `src/modules` and
`src/ports` cannot import `next`, `react`, `server-only`, `@/app`,
`@/components` or `@/adapters`. Adapters cannot import the HTTP or UI layer.

Evidence the boundary holds: the domain test suite runs with **no environment
variables set at all**.

### Foundations built

| Area        | State                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Environment | Zod validation, split into build-safe shape checks and runtime deployment invariants (ADR-0009)                             |
| Logging     | pino, JSON in production, correlation IDs via `AsyncLocalStorage`, secret redaction by path                                 |
| Errors      | One `AppError` hierarchy with `code`, `httpStatus`, `isOperational`, `isRetryable` (ADR-0006)                               |
| HTTP        | `withRoute` wrapper: correlation ID, request logging, centralized error mapping; Zod body/query parsing                     |
| Database    | Prisma 7 with the `pg` driver adapter, bounded pool, singleton guard                                                        |
| Schema      | Identity, RBAC and audit only — `users`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_roles`, `audit_logs` |
| Migrations  | Initial migration creates all five extensions plus the identity schema                                                      |
| Local DB    | `docker-compose.yml` + custom image. **Running** — PostgreSQL 16.15, PostGIS 3.4.3, pgvector 0.8.6                          |
| Seed        | Idempotent reconciling RBAC seed. **Applied** — 6 roles, 38 permissions, 82 grants                                          |
| Queue       | pg-boss verified against a live database (12-table `pgboss` schema created). **No business jobs registered**                |
| Auth domain | Session token issue/hash/validate, RBAC authorization with MFA and step-up gates                                            |
| RBAC        | 6 roles, 38 permissions, full role-to-permission mapping (assumption A-001)                                                 |
| Adapters    | Ports defined for payments, LLM, embeddings, email, storage, maps, analytics                                                |
| CI          | Two jobs: format/lint/typecheck/test/build, and migrations-apply-to-clean-database                                          |
| Tests       | 60 unit tests across authorization, sessions, webhook verification, env parsing and the RBAC catalogue                      |

### Deliberately not built

Marketplace features, booking flows, payment business logic, AI features, and
polished UI.

---

## Working assumptions

Tejas confirmed on 2026-08-19 that pending business decisions must not block
development. Every assumption made in their place is recorded in
**`docs/ASSUMPTIONS.md`**, which is now the register of record.

Summary:

| ID    | Subject               | Status                                  | Reversal cost    |
| ----- | --------------------- | --------------------------------------- | ---------------- |
| A-001 | RBAC mapping          | ASSUMED — working default in place      | Trivial (reseed) |
| A-002 | Session lifetimes     | ASSUMED — one constant                  | Trivial          |
| A-003 | Platform fee          | DEFERRED — nothing built                | High if guessed  |
| A-004 | Cancellation / refund | DEFERRED — nothing built                | High if guessed  |
| A-005 | GST / TCS             | DEFERRED — needs a chartered accountant | Very high        |
| A-006 | Embeddings provider   | DEFERRED — boundary built, no provider  | High if guessed  |
| A-007 | Design tokens         | DEFERRED — nothing built                | Medium           |
| A-008 | Local DB image        | ASSUMED — PG16 + PostGIS + pgvector     | Trivial locally  |

The three financially-consequential decisions (A-003, A-004, A-005) remain
unbuilt rather than assumed. Each one determines column structure for records
that hold money, so a wrong guess means migrating financial data rather than
editing a constant — which is exactly the line this register draws.

**A-005 (GST/TCS) has external lead time.** Engaging a chartered accountant is
the most time-sensitive item in the project.

---

## Blockers

**None.** The WSL2 kernel fault that blocked Phase 0.11 is resolved — `wsl --update`
(to 2.7.12) restored the missing kernel image, and Docker Desktop now runs.

---

## Known gaps and follow-ups

- **Prettier normalized whitespace in the specification documents** on its first
  run, before they were added to `.prettierignore`. Content unchanged — all 21
  FRs and every section verified intact. Cannot recur.
- **The "Antigravity" references** in `README.md`, `PROJECT.md` §7 and
  `WIREFRAME.md` §14 address a different agent than `CLAUDE.md` and
  `DEVELOPMENT_WORKFLOW.md` do. Left unchanged — renaming was never in scope.
- **`REQUIREMENTS.md` §5** still lacks `Session`, `Role`, `Permission`,
  `UserRole`, `ConsentRecord`, `Cart`, `CartItem` and `Dispute`. The first four
  now exist in the schema.
- **No bootstrap path for the first super admin.** The seed deliberately creates
  no users — a seeded admin with a known identity is a standing back door. An
  operational bootstrap procedure is needed before the admin console is usable.
- **The repository directory name contains a space** (`D:\LA VIVENZIA`). It
  causes friction with Docker build contexts; worth settling before the first
  container build.
- **Nothing is committed yet.** 80+ files are staged-clean and ready.

---

## Verification

`npm run verify` — format check, lint, typecheck, tests, build.

Last full run: **all green, exit 0.** 60/60 tests passing, build succeeds,
`/api/v1/health` compiled as a dynamic route.

`npm run db:verify` — run against the live local database, **passed**:

```
PostgreSQL 16.15
  pgcrypto 1.3 · citext 1.6 · pg_trgm 1.6 · postgis 3.4.3 · vector 0.8.6
  all 7 tables present
  6 roles · 38 permissions · 82 grants
  PostGIS check: Pune to Mumbai = 120 km (expected ~120)
```

`prisma migrate diff --from-migrations` reports **no difference** — the schema
and the migrations directory agree.

Seed idempotency confirmed by a second run producing zero changes.

The worker connected to the live queue and pg-boss provisioned its 12-table
`pgboss` schema.

---

## Next task

**0.12 — first commit and CI green.** CI now runs the same `docker compose`
definition developers use, so it independently proves migrations, extensions,
the seed and seed idempotency against a clean database on every push.

Not before then: marketplace feature development.
