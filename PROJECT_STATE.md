# Project State

Living record of what exists, what is pending, and what is blocked. Updated at
the end of every task, per `DEVELOPMENT_WORKFLOW.md`.

**Last updated:** 2026-08-21
**Current phase:** 0 — Engineering Foundation
**Status:** Authentication & identity vertical slice complete and verified
end to end through real HTTP. No marketplace features.

---

## What exists

### Repository and toolchain

Git on `main`, pushed to `La-Vivenzia/lavivenzia-platform` (private). Node 22,
Next.js 16.3.1, React 19.2.8, TypeScript 5.9.3, Tailwind CSS 4.

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

| Area        | State                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Environment | Zod validation, split into build-safe shape checks and runtime deployment invariants (ADR-0009)              |
| Logging     | pino, JSON in production, correlation IDs via `AsyncLocalStorage`, secret redaction by path                  |
| Errors      | One `AppError` hierarchy with `code`, `httpStatus`, `isOperational`, `isRetryable` (ADR-0006)                |
| HTTP        | `withRoute` wrapper: correlation ID, request logging, centralized error mapping; Zod body/query parsing      |
| Database    | Prisma 7 with the `pg` driver adapter, bounded pool, singleton guard                                         |
| Schema      | Identity, RBAC, audit, plus `otp_challenges` and `rate_limit_counters`                                       |
| Migrations  | Two: extensions + identity schema, then auth OTP and rate limiting                                           |
| Local DB    | `docker-compose.yml` + custom image. **Running** — PostgreSQL 16.15, PostGIS 3.4.3, pgvector 0.8.6           |
| Seed        | Idempotent reconciling RBAC seed. **Applied** — 6 roles, 38 permissions, 82 grants                           |
| Queue       | pg-boss verified against a live database (12-table `pgboss` schema created). **No business jobs registered** |
| Auth domain | Full service: registration, email OTP, password login, sessions, MFA, rate limits                            |
| Credentials | argon2id passwords (RFC 9106), SHA-256 hashed OTP codes, TOTP via otpauth                                    |
| Auth API    | 8 endpoints under `/api/v1/auth`, Zod-validated, correlation IDs, rate limited                               |
| Sessions    | Server-side, hashed tokens, httpOnly + `__Host-` cookie, revocation effective immediately                    |
| RBAC        | 6 roles, 38 permissions, full role-to-permission mapping (assumption A-001)                                  |
| Adapters    | Ports defined for payments, LLM, embeddings, email, storage, maps, analytics                                 |
| CI          | Two jobs: verify gate, and migrations + seed idempotency + integration tests on a clean database             |
| Tests       | 108 unit tests (no database needed) + 70 database integration tests                                          |
| Test DB     | Dedicated `lavivenzia_test`, provisioned by `npm run db:test:setup`                                          |
| Reset       | `npm run db:reset` behind a three-gate safety guard; drops, re-migrates, re-seeds                            |

### Deliberately not built

Marketplace features, booking flows, payment business logic, AI features, and
polished UI.

Authentication is complete as a vertical slice but **cannot serve traveller
login in a deployed environment**: there is no email transport, so `deliverOtp`
throws in production rather than silently failing. Google OAuth, password reset
and email change all depend on the same missing piece. Full list in
`docs/AUTHENTICATION.md` under Known limitations.

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
- **Prisma pattern matching defeats citext.** `users.email` is `citext`, so
  equality is case-insensitive, but Prisma casts the operand to `text` for
  `contains`/`startsWith`/`endsWith`, making those case-sensitive. Pass
  `mode: "insensitive"` when pattern-matching an email. Found by an integration
  test; documented in `docs/DATABASE.md` under Known traps.
- **Prisma 7 does not seed on `migrate reset`** despite `migrations.seed` being
  configured. `scripts/db-reset.ts` invokes the seed explicitly.
- **Prisma blocks `migrate reset` for AI agents**, requiring
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Humans are unaffected.

---

## Local setup — from a clean clone

Requires Docker Desktop running and Node 22.

```bash
cp .env.example .env.local   # local config; gitignored, already points at the container
npm ci                       # postinstall generates the Prisma client
npm run db:up                # PostgreSQL 16 + PostGIS + pgvector, waits for healthy
npm run db:migrate           # apply migrations
npm run db:seed              # 6 roles, 38 permissions (idempotent)
npm run db:verify            # extensions, tables, FKs, indexes, constraints
```

Then, for the test suites:

```bash
npm run db:test:setup        # creates + migrates + seeds lavivenzia_test
npm run verify:full          # unit gate + db:verify + integration tests
```

Day to day:

| Command                    | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `npm run dev`              | Next.js dev server                                           |
| `npm run worker`           | pg-boss worker (idle until jobs are registered)              |
| `npm run db:down`          | Stop the container; `docker compose down -v` also drops data |
| `npm run db:reset`         | Drop, re-migrate, re-seed — behind a three-gate safety guard |
| `npm test`                 | Unit tests; needs no database                                |
| `npm run test:integration` | Database integration tests                                   |

Configuration is read from `.env.local`, then `.env`, with real shell variables
winning over both. `.env*` is gitignored except `.env.example`; no credential is
ever committed, and the container binds to `127.0.0.1` only.

---

## Verification

`npm run verify` — format, lint, typecheck, unit tests, build.
`npm run verify:full` — the above plus `db:verify` and the integration suite.

Last full run: **all green, exit 0.**

- **108/108 unit tests**, passing with **no environment variables set at all**.
- **70/70 database integration tests**, including the complete authentication
  flows against real PostgreSQL.
- `prisma validate` passes; no drift between schema and migrations.
- Production build succeeds; all 8 auth routes compile as dynamic.

Verified live over HTTP against a running server, not only through the service
layer: registration, OTP issue/verify, code replay rejection, wrong-code
rejection, password login (correct and incorrect), `me` with and without a
session, cross-origin POST rejection, logout, and rejection of a captured token
after revocation.

Three real defects were found and fixed during this milestone:

- A template literal silently mangled `\d`, so the OTP schema compiled to
  `/^d{6}$/` and would have rejected every valid code. Caught by lint.
- Session `expiresAt` came from the app clock while `createdAt`/`lastSeenAt`
  came from the database default, so clock skew between the app and PostgreSQL
  corrupted idle-timeout calculations. Time now has one source.
- `logout` returned 500 while still revoking the session — `NextResponse.json`
  cannot produce a 204. Fixed in `jsonResponse` so no future endpoint can hit it.

---

## Next task

**Email delivery, then host onboarding and inventory.**

The email transport is now the binding constraint rather than a nicety: without
it traveller login cannot work in any deployed environment, and password reset,
email change and email verification are all blocked behind the same adapter.
Building the SES adapter behind the existing `EmailPort` is small, well-bounded,
and unblocks four flows at once.

After that, **host onboarding and experience inventory** is the natural next
vertical: authentication can now identify a host, and inventory is the first
thing that has to exist before search, availability or bookings mean anything.

Still worth scheduling in parallel, independent of feature work:

- Engage a chartered accountant on GST/TCS (A-005) — longest lead time in the project.
- Operational bootstrap procedure for the first super admin; the seed deliberately
  creates no users, so no account can currently reach a privileged role.
- TOTP replay prevention, before the first money-moving endpoint ships.
