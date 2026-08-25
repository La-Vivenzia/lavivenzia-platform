# Project State

Living record of what exists, what is pending, and what is blocked. Updated at
the end of every task, per `DEVELOPMENT_WORKFLOW.md`.

**Last updated:** 2026-08-25
**Current phase:** 4 — Host + Inventory
**Status:** The first marketplace workflow is live end to end. A host can join,
build a profile, submit it for verification, create experiences, upload
photographs, preview a listing as a traveller would see it, and submit it for
review. Verified through real HTTP against the running application.

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
| Email       | SES adapter implemented (ADR-0011); console transport for local development; login codes delivered           |
| Design      | Token layer, typography and component set (ADR-0012). Resolves A-007                                         |
| Hosts       | Profile, completeness assessment, verification lifecycle (FR-05)                                             |
| Inventory   | Experiences with lifecycle, media, location, pricing fields (FR-06, FR-07)                                   |
| Media       | Magic-byte validated uploads behind `StoragePort`; local transport (ADR-0013)                                |
| Host UI     | Nine screens: landing, sign-in, join, overview, profile, inventory, editor, preview                          |
| Templates   | One: `auth.login-code`. Framework-free renderer producing subject, text and HTML                             |
| Adapters    | Payments, LLM, embeddings, maps, analytics remain boundaries only; S3 storage still a stub                   |
| CI          | Two jobs: verify gate, and migrations + seed idempotency + integration tests on a clean database             |
| Tests       | 256 unit tests (no database needed) + 118 database integration tests                                         |
| Test DB     | Dedicated `lavivenzia_test`, provisioned by `npm run db:test:setup`                                          |
| Reset       | `npm run db:reset` behind a three-gate safety guard; drops, re-migrates, re-seeds                            |

### Deliberately not built

Booking, payments, refunds, GST/TCS, commission, traveller search and discovery,
AI features, the operations console.

**No listing can reach PUBLISHED yet.** FR-07 puts approval between draft and
published and `experience:approve` is an Operations permission, so a host can
submit but never publish. Nothing approves submissions until the operations
console exists — that is the next milestone, not a gap in this one.

**No financial arithmetic exists anywhere.** `experiences.base_price_minor`
holds the host's own list price and nothing else. No fee, commission, tax or
payout is stored, derived or displayed.

Authentication now has a working transport, but **no real email has been sent**:
the AWS account is being arranged separately, so the SES adapter has never
spoken to SES. Google OAuth, password reset and email change each still need
their own flow. Full list in `docs/AUTHENTICATION.md` under Known limitations,
and `docs/EMAIL.md` for what AWS must supply.

---

## Milestone record — host onboarding and experience inventory (2026-08-25)

**Already present, and reused rather than rebuilt.** The whole authentication
and authorization stack — `Principal`, `authorize()`, `requirePermission`,
sessions. The HTTP layer (`withRoute`, `parseJsonBody`, `parseQuery`,
`jsonResponse`), the error model, the structured logger, the Prisma client and
the audit repository. The `host` role already carried `experience:create`,
`experience:update:own`, `experience:submit` and `availability:manage:own`. The
`StoragePort` boundary. Nothing in `src/modules/auth` was modified.

**Implemented.**

- Four tables (`hosts`, `experiences`, `experience_media`, `categories`), a
  generated PostGIS point with a GiST index, and seven check constraints.
- Two permissions: `host:manage:own` and `experience:read:own`, granted to the
  host role only — which is what makes "a traveller cannot reach host
  functionality" a permission check rather than a UI condition.
- `src/modules/hosts` and `src/modules/experiences`: profile completeness, the
  listing lifecycle table, submission readiness, slug allocation — all pure.
- `src/modules/media`: magic-byte image validation and server-generated
  storage keys.
- Ten `/api/v1` endpoints plus a public category list.
- The **design token layer**, resolving A-007, and a component set: buttons,
  form fields, status badges, progress, alerts, empty and loading states.
- Nine screens: landing, sign-in, apply-to-host, host overview, profile
  onboarding and editor, inventory list, experience editor, traveller preview.

**Files.** 41 added, 12 modified. One migration,
`20260825102020_host_and_experience_inventory` — additive only, no destructive
statement.

**Dependencies.** None added.

**Configuration.** `MEDIA_STORAGE` (new, defaults to `local`) and
`S3_MEDIA_BUCKET`. No AWS credential is configured anywhere; the SDK resolves
them from the provider chain when S3 lands.

**One defect found in this milestone's own work and fixed before it shipped.**
The unarchived-listing cap does not bound row creation, because archiving frees
a slot — create-and-archive in a loop was unbounded. Draft creation and media
upload now carry per-host rate limits alongside the caps, both covered by tests.

---

## Milestone record — transactional email (2026-08-22)

**Already present, and reused rather than rebuilt.** The `EmailPort` interface,
the adapter directory, `EMAIL_FROM` and `AWS_REGION` in the environment schema,
the error model, the structured logger, and the `deliverOtp` seam in
`AuthService` — the auth service was not touched.

**Implemented.** A framework-free template renderer (subject, plain text, HTML),
the SES adapter with error classification and a bounded network budget, a
console transport for local development, transport selection that refuses
configurations which would silently send nothing, and the wiring in the
composition root.

**Files.** 10 added — `src/modules/notifications/email-templates.ts`,
`src/lib/mask.ts`, `src/adapters/email/{index,transport}.ts`,
`src/adapters/email/console/index.ts`, `docs/EMAIL.md`,
`docs/adr/0011-transactional-email-delivery.md`, and four test files. 6 modified
— `src/ports/email.ts`, `src/adapters/email/ses/index.ts`, `src/lib/env.ts`,
`src/lib/container.ts`, `.env.example`, `docs/AUTHENTICATION.md`.

**Dependency added.** `@aws-sdk/client-sesv2` (23 transitive packages). No
migration; the schema is unchanged.

**Configuration.** `EMAIL_TRANSPORT` (new, defaults to `console`),
`SES_CONFIGURATION_SET` (new, optional), plus the existing `EMAIL_FROM` and
`AWS_REGION`. No AWS credentials are configured anywhere: the SDK resolves them
through the provider chain, which in a deployed environment means the task's IAM
role. There is no access key to store or rotate.

---

## Working assumptions

Tejas confirmed on 2026-08-19 that pending business decisions must not block
development. Every assumption made in their place is recorded in
**`docs/ASSUMPTIONS.md`**, which is now the register of record.

Summary:

| ID    | Subject                     | Status                                  | Reversal cost    |
| ----- | --------------------------- | --------------------------------------- | ---------------- |
| A-001 | RBAC mapping                | ASSUMED — working default in place      | Trivial (reseed) |
| A-002 | Session lifetimes           | ASSUMED — one constant                  | Trivial          |
| A-003 | Platform fee                | DEFERRED — nothing built                | High if guessed  |
| A-004 | Cancellation / refund       | DEFERRED — nothing built                | High if guessed  |
| A-005 | GST / TCS                   | DEFERRED — needs a chartered accountant | Very high        |
| A-006 | Embeddings provider         | DEFERRED — boundary built, no provider  | High if guessed  |
| A-007 | Design tokens               | CONFIRMED — resolved by ADR-0012        | —                |
| A-008 | Local DB image              | ASSUMED — PG16 + PostGIS + pgvector     | Trivial locally  |
| A-009 | Editing a published listing | ASSUMED — conservative default          | Trivial          |
| A-010 | Category taxonomy           | ASSUMED — eight working categories      | Trivial (reseed) |
| A-011 | Host KYC documents          | DEFERRED — status only, no documents    | Low now          |

The three financially-consequential decisions (A-003, A-004, A-005) remain
unbuilt rather than assumed. Each one determines column structure for records
that hold money, so a wrong guess means migrating financial data rather than
editing a constant — which is exactly the line this register draws.

**A-005 (GST/TCS) has external lead time.** Engaging a chartered accountant is
the most time-sensitive item in the project.

---

## Blockers

**External, not engineering: the AWS SES account.** The application side is
complete and tested; nothing in the codebase is waiting on anything. What is
missing is an AWS account with a verified sending identity and production access
out of the SES sandbox. Until then a deployed environment can be configured
correctly and still reach nobody outside the verified list.

Leaving the SES sandbox is a support request with lead time, so it is the item
to start first. The full checklist — domain identity, DKIM, SPF alignment,
DMARC, IAM policy, configuration set — is in `docs/EMAIL.md`.

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

- **256/256 unit tests**, passing with **no environment variables set at all**.
- **118/118 database integration tests**, including the complete authentication,
  onboarding and inventory flows against real PostgreSQL.
- `prisma validate` passes; no drift between schema and migrations.
- Production build succeeds; all 8 auth routes compile as dynamic.

Verified live over HTTP against a running server, not only through the service
layer: registration, OTP issue/verify, code replay rejection, wrong-code
rejection, password login (correct and incorrect), `me` with and without a
session, cross-origin POST rejection, logout, and rejection of a captured token
after revocation.

Host onboarding and inventory were verified over HTTP against a running server,
not only through the service layer. A host registered, signed in, was refused
inventory access before creating a profile (403), created one, was refused
submission while it was incomplete (400), completed and submitted it (PENDING),
and was then locked out of editing it (409). They created a draft, were refused
submission while it was unready (400), filled it in, uploaded a photograph
(201, served back at 200), had a script disguised as a PNG rejected (400), were
told alt text was still missing, added it, and submitted the listing (IN_REVIEW).

The security boundaries were exercised the same way. A second host reading,
editing or acting on the first host's listing received **404, not 403** — a 403
would confirm the id exists. Their inventory listing returned zero rows. A
signed-in traveller was refused the host profile surface and the inventory
surface with 403. An anonymous visitor to `/host` was redirected to `/sign-in`.

Email delivery was verified over HTTP against a running server, not only through
the service layer: a traveller registered (201), requested a code (202), and the
**six-digit code lifted out of the rendered message body** completed the login
(200) and returned a working session from `me`. That is the assertion that
matters — the code in the email is the code the verify path accepts.

Both production refusals were exercised directly. With `NODE_ENV=production` and
the default transport, startup reports:

```
Invalid production configuration:
  - EMAIL_TRANSPORT must be 'ses' in production; 'console' sends no mail
  - EMAIL_FROM is required in production (a sender identity verified in SES)
```

and the adapter factory independently refuses to build. With a correct
production configuration, the same code wires `SesEmailAdapter`.

**No real email has been sent.** There are no AWS credentials, so the SES
adapter has never spoken to SES. Everything short of that call is tested; the
`SendEmail` call itself is not.

One real defect was found and fixed during this milestone:

- `ConsoleEmailAdapter.send` threw synchronously on a bad template instead of
  returning a rejected promise, so a caller doing `send(...).catch(...)` would
  have taken an uncaught exception rather than catching it. The SES adapter,
  being `async`, did not share the bug — which is exactly how an interface with
  two implementations drifts. Caught by a test.

Three real defects were found and fixed during the preceding authentication
milestone:

- A template literal silently mangled `\d`, so the OTP schema compiled to
  `/^d{6}$/` and would have rejected every valid code. Caught by lint.
- Session `expiresAt` came from the app clock while `createdAt`/`lastSeenAt`
  came from the database default, so clock skew between the app and PostgreSQL
  corrupted idle-timeout calculations. Time now has one source.
- `logout` returned 500 while still revoking the session — `NextResponse.json`
  cannot produce a 204. Fixed in `jsonResponse` so no future endpoint can hit it.

---

## Next task

**The operations console: host verification and experience approval.**

It is now the binding constraint rather than a nicety. Hosts can submit profiles
and listings, and nothing can approve either — submissions accumulate in a queue
with no reader. Every permission the console needs already exists (`host:verify`,
`experience:approve`, `experience:suspend`, `experience:read:all`), the states
and the audit trail are in place, and the design system it would be built on now
exists. It is the smallest piece of work that turns the host workflow from a
demonstration into something that completes.

It also unblocks the decision recorded as A-009 — what should happen when a host
edits a published listing — which cannot be answered until something can publish
one.

After that, **traveller discovery**: the experience detail page, destination and
category pages, then search. The spatial column and the slug are already in
place for it.

Still worth scheduling in parallel, independent of feature work:

- Engage a chartered accountant on GST/TCS (A-005) — longest lead time in the
  project, and still not started.
- Operational bootstrap procedure for the first super admin. The operations
  console is unusable without one, so this is now on the critical path.
- TOTP replay prevention, before the first money-moving endpoint ships.

Still worth scheduling in parallel, independent of feature work:

- Engage a chartered accountant on GST/TCS (A-005) — longest lead time in the project.
- Operational bootstrap procedure for the first super admin; the seed deliberately
  creates no users, so no account can currently reach a privileged role.
- TOTP replay prevention, before the first money-moving endpoint ships.
