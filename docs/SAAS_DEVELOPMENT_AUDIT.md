# La Vivenzia — SaaS Development Audit

**Audit date:** 2026-10-16
**Auditor:** Senior architecture / technical audit pass
**Scope:** `D:\LA  VIVENZIA\lavivenziaSAAS` — the main customer-facing SaaS
**Type:** Audit only. No code, configuration, infrastructure or Git state was modified.

---

## 1. Executive summary

The project is **substantially further along than its phase number suggests, and
substantially less protected than its quality suggests.**

Engineering through official **Phase 5 is implemented and the full local
verification gate passes**: format, lint, typecheck, 409 unit tests and a
production build all succeed on the working tree as it stands today. The
architecture is disciplined — a framework-free domain layer whose isolation is
enforced by lint rather than convention, with provider boundaries declared ahead
of their providers.

Three findings dominate everything else:

1. **About seven weeks of work exists only in the working tree.** `HEAD` is
   `aeff6d7`, dated 2026-08-25, and is level with `origin/main` — nothing ahead,
   nothing behind. There are **114 uncommitted paths**, including 56 source
   files, 9 test files, a Prisma schema change, a database migration, and two
   ADRs. None of it has ever been through CI, because CI runs on push and
   nothing has been pushed. This is the single largest risk in the project and
   it is not a code-quality issue — it is an existential one for the work.

2. **Phase 6 is blocked on founder decisions, not engineering.** Booking and
   payments are genuinely not started (no `Booking` model, no booking or payment
   routes, order creation throws `NotImplementedError`). It cannot *finish*
   without the platform fee (A-003), the cancellation and refund policy (A-004)
   and the GST/TCS structure (A-005). **A-005 has the longest external lead time
   in the project and, per the project's own record, has still not been
   started.**

3. **Nothing has ever run outside a developer machine.** No deployment
   configuration or infrastructure-as-code exists in the repository. No real
   email has ever been sent. The Google Maps key is unset locally, so the real
   Maps provider path has never been exercised here. "Implemented and tested"
   is accurate; "verified in a deployed environment" is not true of any phase.

A fourth, quieter finding is worth recording because it recurs: the project's
own milestone notes state that **four milestones in a row produced defects that
only appeared by opening the running product** — an invisible hero button, a
soft 404, a missing logout, and a client-boundary HTTP 500. Each component was
correct; the composition was not. The guards added in response assert
composition and reachability rather than rendering. That is the right response,
and it is also a standing argument against treating a green suite as proof that
a phase is done.

---

## 2. Repository identity and scope confirmation

**Confirmed: this is the main SaaS, not the internal CRM.**

| Signal | Value |
| --- | --- |
| `package.json` name | `lavivenzia` |
| `package.json` description | "La Vivenzia — curated experiential tourism marketplace" |
| Application shape | Next.js App Router, traveller + host + operations surfaces |
| Domain modules | `auth`, `discovery`, `experiences`, `hosts`, `media`, `notifications`, `operations`, `shared` |
| CRM markers | None. No Twenty packages, no CRM schema, no CRM routes |

**A trap was present and avoided.** Two Docker containers named `lv-ai-server`
and `lv-ai-worker` are running on this machine. Both use the image
`lavivenziacrm/lavivenzia-crm:latest` — they belong to the **CRM**, not to this
repository. They are explicitly **not** treated as evidence of AI work in the
main SaaS. The SaaS's own database container, `lavivenzia-postgres`, is
**Exited (0) 25 hours ago**.

The CRM gap analysis that lives at `docs/LA-VIVENZIA-TWENTY-GAP-ANALYSIS.md` is
a document *about* a different product and was not used as evidence of progress
in any phase here.

---

## 3. Authoritative documents consulted

Read in full or in relevant part:

| Document | Role in this audit |
| --- | --- |
| `PROJECT_STATE.md` (841 lines) | Primary living record; milestone history, blockers, next task |
| `PROJECT.md` | Product scope |
| `REQUIREMENTS.md` | FR references (FR-01 … FR-16) |
| `CLAUDE.md` | Working agreement and constraints |
| `DESIGN.md` (1,358 lines) | Design system, §A records the approved identity |
| `SYSTEM_DESIGN.md` | Layering and dependency direction |
| `DEVELOPMENT_WORKFLOW.md` | Definition of done, verification gate |
| `WIREFRAME.md` | Screen inventory |
| `docs/ASSUMPTIONS.md` | Assumption register A-001 … A-016 |
| `docs/AUTHENTICATION.md` | Auth scope and known limitations |
| `docs/DATABASE.md` | Schema and migration record |
| `docs/EMAIL.md` | AWS SES checklist |
| `docs/PHASE-5.1-AUDIT.md` | Prior audit, Phases 0–5 |
| `docs/adr/0001` … `0015` | 15 architecture decision records |
| `.github/workflows/ci.yml` | CI definition |

**A documentation inconsistency was found.** `PROJECT_STATE.md` carries
`**Last updated:** 2026-09-01` and a roadmap table reading
*"Phase 1 — Complete for engineering; brand pending"*, yet the same file
contains a milestone record dated **2026-09-08** stating that the moodboard is
approved and implemented and that *"the longest-running blocker in the project
is closed."* The header and the summary table are stale relative to the body.
Treat the 2026-09-08 milestone record as the later and more accurate statement.

---

## 4. Current Git state

All commands were read-only. **Nothing was reset, stashed, cleaned, checked out,
rebased, amended, committed or pushed.**

```
branch:            main
HEAD:              aeff6d7  2026-08-25 23:06:04 +0530  Karan Patil
                   feat(operations): complete admin review console
origin/main:       level — 0 behind, 0 ahead
tags:              none
branches:          main (local), origin/main
```

Commit history — 8 commits, all between 2026-08-19 and 2026-08-25:

```
aeff6d7  2026-08-25  feat(operations): complete admin review console
7ac5f5b  2026-08-25  fix(ui): hero call to action was invisible on the dark ground
96a6cd2  2026-08-25  feat(host): host onboarding and experience inventory
0922b83  2026-08-22  feat(email): implement SES transport behind EmailPort
d49b465  2026-08-21  feat(auth): authentication and identity vertical slice
148e6e0  2026-08-21  feat(config): read local configuration from .env.local
3121985  2026-08-20  feat(db): database integration tests, guarded reset, deeper schema verification
48ee69c  2026-08-19  chore: engineering foundation for the La Vivenzia marketplace
```

No revert commits, no merge commits, no abandoned branches, no failed-attempt
history. The repository is linear and clean — because almost nothing since
August has entered it.

### Working tree: 114 uncommitted paths

| Kind | Count |
| --- | --- |
| Untracked (`??`) | 77 |
| Modified (`M`) | 36 |
| Renamed + modified (`RM`) | 1 |

Untracked work by area:

| Area | Untracked paths |
| --- | --- |
| `src/components/` | 31 |
| `src/app/` | 11 |
| `tests/unit/` | 8 |
| `src/lib/` | 5 |
| `src/adapters/` | 5 |
| `src/modules/` | 3 |
| `docs/` + `docs/adr/` | 5 |
| `public/` (incl. `uirefrence/`, `images/`, `brand/`) | 6 |
| `prisma/migrations/` | 1 |
| `tests/integration/` | 1 |
| `src/data/` | 1 |

Modified tracked files include `PROJECT_STATE.md`, `DESIGN.md`,
`SYSTEM_DESIGN.md`, `WIREFRAME.md`, `README.md`, `docs/ASSUMPTIONS.md`,
`docs/DATABASE.md`, `package.json`, `package-lock.json`,
`prisma/schema.prisma`, and 20+ files under `src/`.

**The schema change and its migration are mutually consistent.** The 13 added
lines in `prisma/schema.prisma` declare four GIN trigram indexes, and the
matching migration `20260901124940_search_trigram_indexes/` exists. The risk is
that both are unversioned, not that they disagree.

**Confirmed fact:** this body of work has never been validated by CI, because
`.github/workflows/ci.yml` triggers on `push` and `pull_request`, and the last
push was 2026-08-25.

---

## 5. Phase 0–12 audit table

| Phase | Name | Status | Completion evidence |
| --- | --- | --- | --- |
| 0 | Architecture & Project Foundation | **COMPLETE AND VERIFIED** | Hexagonal layering present; boundary enforced by `no-restricted-imports` (`eslint.config.mjs:21,49`); 15 ADRs; env/logger/errors/HTTP/db primitives; CI defined; full gate passes locally today |
| 1 | Design System & UI Foundation | **IMPLEMENTED, VERIFICATION INCOMPLETE** | Token layer + 26 ported components (ADR-0012, ADR-0015, `DESIGN.md` §A); A-007 CONFIRMED. Entire identity port is **uncommitted**; no responsive or visual regression tests exist |
| 2 | Public Website & Discovery | **IMPLEMENTED, VERIFICATION INCOMPLETE** | 9 traveller screens; `src/modules/discovery` with no status parameter; `parseFilters`; 3 public API routes; `discovery-filters`, `route-structure`, `client-boundary` unit tests + `discovery` integration test. Curated collections (FR-01) deferred; integration suite not runnable now |
| 3 | Authentication & User Profiles | **PARTIALLY IMPLEMENTED** | 8 `/api/v1/auth` endpoints; argon2id, hashed OTP, TOTP, server-side sessions, `__Host-` cookie, RBAC 6/38/82, rate limits; 8 auth unit suites + `auth-flows` integration. **Missing:** `TravellerProfile`, preferences, wishlist, Google OAuth, password reset, email change, TOTP replay prevention, MFA reset (A-012) |
| 4 | Host & Inventory Management | **PARTIALLY IMPLEMENTED** | Host profile + verification lifecycle; experiences with lifecycle, media, location, pricing; magic-byte upload validation; 9 host screens; `host-profile`, `experience-lifecycle`, `experience-readiness`, `media-image` + `host-inventory` integration. **Missing:** availability and slots (FR-08), KYC documents (A-011) |
| 5 | Search, Maps & Location | **IMPLEMENTED, VERIFICATION INCOMPLETE** | `ST_DWithin` / `ST_Distance` on the GiST-indexed `geo` column; 4 GIN trigram indexes; `word_similarity` ranking; `/places/autocomplete` + `/places/resolve`; Google adapter (243 lines, no stub markers) with catalogue fallback; ADR-0014; `discovery-geo`, `maps-adapters`, `like-escaping`. **Gaps:** no semantic/vector search (A-006), no embedded map, `GOOGLE_MAPS_API_KEY` unset locally so the real provider path is unexercised here |
| 6 | Booking & Payments | **NOT STARTED — BLOCKED** | 0 `Booking` models, 0 booking/payment routes; `RazorpayAdapter` order creation and fetch throw `NotImplementedError` by design (ADR-0010). Webhook signature verification **is** implemented and tested (`razorpay-webhook`). Blocked on A-003, A-004, A-005 |
| 7 | Admin & Operations | **IMPLEMENTED, VERIFICATION INCOMPLETE** | Operations console: 5 pages, 8 `/api/v1/ops` routes, review workflow; `operations-review` unit + integration tests. Built ahead of official order |
| 8 | AI Discovery MVP | **NOT STARTED** | `LlmPort` + `AnthropicLlmAdapter` (22 lines) throws `NotImplementedError`; embeddings adapter is a 26-line stub; `ANTHROPIC_API_KEY` and `EMBEDDINGS_PROVIDER` unset; A-006 unresolved. `AIGenieSection`/`AIGenieFeature` exist on disk, unmounted |
| 9 | Itinerary Engine | **NOT STARTED** | No itinerary module, model, route or test |
| 10 | CRM & Notifications | **PARTIALLY IMPLEMENTED** | SES adapter (257 lines, no stub markers), console transport, `notifications` module, one template `auth.login-code`; 4 email unit suites + `email-delivery` integration. **Blocked externally:** no AWS account, no verified identity, no sandbox exit — no real email has ever been sent |
| 11 | Analytics, Security & Hardening | **PARTIALLY IMPLEMENTED** | Security substantially present: RBAC, audit log, rate limiting, argon2id, hashed session tokens, secret redaction, magic-byte validation, webhook signature verification. **Analytics and observability absent:** PostHog adapter is an 11-line stub; `POSTHOG_KEY` and `SENTRY_DSN` unset |
| 12 | Integration, QA & Production | **NOT STARTED** | No IaC, no deployment config, no Dockerfile for the app (only `docker/postgres/Dockerfile` for local dev). AWS work frozen pending founder approval |

### Counts

- Total documented phases: **13** (0–12)
- Complete and verified: **1** (Phase 0)
- Implemented, verification incomplete: **4** (1, 2, 5, 7)
- Partially implemented: **4** (3, 4, 10, 11)
- Not started: **4** (6, 8, 9, 12) — of which Phase 6 is also blocked
- Unknown / insufficient evidence: **0**

### On percentages

A phase-count percentage would be misleading here and is deliberately not
headlined. Phase 0 is one of thirteen phases but a small share of remaining
effort; Phase 6 is one phase but contains the entire money path. If a figure is
required for reporting:

> **Rough estimate, phase-count basis: 1/13 verified (8%), 9/13 with meaningful
> implementation present (69%).** This is a count of phases, not of weighted
> deliverables, and it does not account for the fact that four phases carrying
> implementation have outstanding verification work. It should not be quoted as
> "69% done."

---

## 6. Detailed phase-by-phase findings

### Phase 0 — Architecture & Project Foundation — COMPLETE AND VERIFIED

The strongest phase in the project, and the only one this audit is willing to
call verified.

- **Layering is real and enforced.** `src/modules` and `src/ports` cannot import
  `next`, `react`, `server-only`, `@/app`, `@/components` or `@/adapters`;
  adapters cannot import the HTTP or UI layer. Verified directly in
  `eslint.config.mjs` lines 21–27 and 49–55.
- **The boundary is demonstrated, not just declared.** The unit suite runs with
  no environment variables set at all — 409 tests, 29 files, 2.59s.
- Foundations present: Zod env validation split build-safe/runtime (ADR-0009),
  pino logging with `AsyncLocalStorage` correlation IDs and secret redaction,
  one `AppError` hierarchy (ADR-0006), a `withRoute` wrapper, Prisma 7 on the
  `pg` driver adapter with a bounded pool and singleton guard.
- 15 ADRs covering queue, topology, extensions, auth, errors, LLM, PostGIS,
  secrets, payments boundary, email, console surfaces, media, search, identity.
- CI defines two jobs: the verify gate, and migrations + seed idempotency +
  integration tests against a clean database.

**Caveat:** "verified" here means the gate passes on this machine today. CI has
not run against the current tree.

### Phase 1 — Design System & UI Foundation — IMPLEMENTED, VERIFICATION INCOMPLETE

- The approved identity is implemented and, per ADR-0015, **ported rather than
  reinterpreted** — components and CSS were brought across from the reference
  app, which is why the product matches the references exactly.
- Two-axis token system (light/dark × green/blue) set before paint; `SiteShell`
  gives every public page one header, footer and tab bar; 26 approved components
  adopted and 5 interim ones deleted.
- A-007 (design tokens) is CONFIRMED and closed.
- `tests/unit/button-variants.test.ts` fails if a button is recoloured through
  `className` rather than a variant — a real structural guard.

**Why not verified:**

1. The whole port is **uncommitted** — 31 untracked component files plus a
   modified `globals.css`.
2. **No responsive or visual regression testing exists.** The milestone notes
   record an earlier pass that replaced the working homepage with static
   fixtures, destroying real listings, sign-in, sign-out and host access before
   being reverted. Nothing in the suite would catch that class of regression.
3. Two token vocabularies (`--lv-*` for the public site, console names for the
   consoles) remain deliberately unmerged — recorded in `DESIGN.md` §A.6, not a
   defect, but a standing condition.

### Phase 2 — Public Website & Discovery — IMPLEMENTED, VERIFICATION INCOMPLETE

- `src/modules/discovery` exposes a public read surface whose port has **no
  status parameter at all**, so nothing unpublished is reachable through it —
  a structural guarantee rather than a filter that could be forgotten.
- `parseFilters` is the input boundary: malformed values are dropped rather than
  rejected, and none can widen visibility.
- Nine traveller screens; three public API routes; one reusable `ExperienceCard`.
- Three defects found and fixed in this milestone are documented with their
  root causes (a segment-level `loading.tsx` causing a soft 404; a literal NUL
  byte reaching PostgreSQL; a minor/major unit mismatch on `minPrice`). Each has
  a test.

**Outstanding:** curated collections (FR-01) deferred pending editorial content;
the `discovery` integration test could not be executed in this audit.

### Phase 3 — Authentication & User Profiles — PARTIALLY IMPLEMENTED

Implemented to launch scope and well tested. Credentials use argon2id (RFC 9106),
OTP codes are SHA-256 hashed at rest, sessions are server-side with hashed tokens
and a `__Host-` prefixed httpOnly cookie, revocation is immediate, and RBAC
covers 6 roles / 38 permissions / 82 grants.

**The phase is not complete** because its *profile* half does not exist:

- No `TravellerProfile` model in the schema — confirmed against
  `prisma/schema.prisma` (13 models, none of them a traveller profile).
- No preferences, no wishlist.
- Google OAuth, password reset and email change each still need their own flow.
- **TOTP replay prevention is outstanding** — a code remains valid for its whole
  window, so an intercepted code can be reused within it. The project's own note
  says this must land *before the first money-moving endpoint ships*, which puts
  it on the critical path into Phase 6.
- **No supported MFA reset path for a locked-out operator (A-012)** — the only
  recovery is a direct database update.

### Phase 4 — Host & Inventory Management — PARTIALLY IMPLEMENTED

Host profile, completeness assessment and verification lifecycle (FR-05);
experiences with lifecycle, media, location and pricing fields (FR-06, FR-07);
uploads validated by magic bytes behind a `StoragePort`; nine host screens.

**Missing for completeness:** availability and slots (FR-08) — which is also the
first buildable piece of Phase 6 — and KYC document handling (A-011 deferred:
status is tracked, documents are not).

### Phase 5 — Search, Maps & Location — IMPLEMENTED, VERIFICATION INCOMPLETE

The Phase 5.1 milestone closed the two gaps a prior audit found. Notably, **the
`geo` column had existed since the first migration and no query had ever read
it**; `pg_trgm` was likewise installed and unused. Much of this phase was using
what had already been provisioned.

Implemented: `ST_DWithin` proximity against the GiST index, `ST_Distance`
ordering shown in metres on the card, weighted `word_similarity` with four GIN
trigram indexes, misspelling tolerance at threshold 0.4 (A-016), places
autocomplete and resolve, a real Google Places adapter behind `MapsPort` with a
catalogue fallback when Google is absent, throttled or down.

**Why not verified:**

- `GOOGLE_MAPS_API_KEY` is **unset** in local configuration, so the Google
  provider path has not been exercised against the real API on this machine.
  What has been exercised is the fallback.
- No embedded interactive map — that needs a browser-published Maps JavaScript
  key and no Google account has been arranged.
- **Semantic and vector search are not built and no vector column exists.** The
  embeddings provider fixes the column dimension and remains unresolved (A-006).
  ADR-0014 records exactly where the semantic arm attaches.

### Phase 6 — Booking & Payments — NOT STARTED, BLOCKED

Verified absent, not merely unfinished:

```
Booking models in prisma/schema.prisma : 0
booking or payment API routes          : 0
```

`RazorpayAdapter` is explicitly an integration boundary: order creation and
payment fetch throw `NotImplementedError` with a comment stating they belong with
the booking state machine, which is blocked on founder decisions.

**One part is built, deliberately:** webhook signature verification, because it
is a security boundary rather than business logic and is expensive to get wrong
later. It must run against the raw request body before parsing, and it has its
own test (`tests/unit/razorpay-webhook.test.ts`).

**No financial arithmetic exists anywhere in the codebase.**
`experiences.base_price_minor` holds the host's list price and nothing else — no
fee, commission, tax or payout is stored, derived or displayed. This is the
correct posture given A-003/A-004/A-005 are unresolved: each determines column
structure for records that hold money, so a wrong guess means migrating
financial data rather than editing a constant.

**Booking is inert and says so.** The experience detail page carries a real
booking panel whose call to action states that booking is not open rather than
pretending otherwise.

### Phase 7 — Admin & Operations — IMPLEMENTED, VERIFICATION INCOMPLETE

Built ahead of its official position. Five operations pages and eight
`/api/v1/ops` routes implement the host and experience review workflow, with
`operations-review` covered by both a unit and an integration suite. The
`scripts/grant-role.ts` super-admin bootstrap exists, requires interactive
confirmation and writes an audit row.

Outstanding verification is the same as elsewhere: integration tests not run in
this audit, and no deployed environment.

### Phase 8 — AI Discovery MVP — NOT STARTED

Boundaries only. `AnthropicLlmAdapter` throws `NotImplementedError`; the
embeddings adapter is a 26-line stub; `ANTHROPIC_API_KEY`, `EMBEDDINGS_PROVIDER`
and `EMBEDDINGS_API_KEY` are unset. A-006 (embeddings provider) is unresolved and
blocks the vector column dimension.

`AIGenieSection` and `AIGenieFeature` exist on disk matching the approved design
but are **unmounted** — present as design assets, not as functionality.

**Explicitly excluded from evidence:** the `lv-ai-server` and `lv-ai-worker`
containers running on this machine belong to the CRM image.

### Phase 9 — Itinerary Engine — NOT STARTED

No module, model, route or test. Nothing to assess.

### Phase 10 — CRM & Notifications — PARTIALLY IMPLEMENTED

The transactional email half is built and tested: a 257-line SES adapter with no
stub markers (ADR-0011), a console transport for local development, a
framework-free template renderer producing subject, text and HTML, and one
template (`auth.login-code`). Four unit suites plus an `email-delivery`
integration suite.

**Blocked externally, not in code.** No AWS account with a verified sending
identity and no production access out of the SES sandbox — so **no real email has
ever been sent**. A deployed environment could be configured correctly and still
reach nobody outside the verified list. `docs/EMAIL.md` holds the checklist
(domain identity, DKIM, SPF alignment, DMARC, IAM policy, configuration set).

The CRM half of this phase is a separate Twenty-based repository and is out of
scope for this audit.

### Phase 11 — Analytics, Security & Hardening — PARTIALLY IMPLEMENTED

**Security is the strong half** and much of it shipped early: RBAC with a full
role-to-permission mapping, an audit log, rate limiting with a dedicated
`rate_limit_counters` table, argon2id password hashing, hashed session tokens,
`__Host-` cookies, path-based secret redaction in logs, magic-byte validation on
uploads, and webhook signature verification.

**Analytics and observability are the weak half and are effectively absent:**
the PostHog adapter is an 11-line stub and `POSTHOG_KEY` is unset; `SENTRY_DSN`
is unset. There is structured logging with correlation IDs, but nothing collects
it outside a terminal.

Two security items remain outstanding and are named above: TOTP replay
prevention and an MFA reset path (A-012).

### Phase 12 — Integration, QA & Production — NOT STARTED

No infrastructure-as-code (no Terraform, CDK, SST, serverless or `infra/`
directory), no application Dockerfile, no platform deployment configuration. The
only Dockerfile is `docker/postgres/Dockerfile` for the local development
database. Consistent with the documented AWS freeze.

---

## 7. Last known stopping point

**A. Last confirmed completed milestone**
Approved visual identity, recorded 2026-09-08 (official Phase 1). This closed
A-007 and what the project called "the longest-running blocker in the project."

**B. Last partially completed milestone**
The same one. Its deliverables are implemented but entirely uncommitted and
never CI-validated. The Stays, AI Genie and Trips surfaces were deliberately not
shipped.

**C. Current or most likely active phase**
*Inference, clearly labelled.* The documented next phase is **6 — Booking &
Payments**, and `PROJECT_STATE.md` states this "does not need re-deciding."
However **no Phase 6 artefact exists in the repository** — no model, route,
module or test. The evidence therefore supports: *Phase 5.1 and the Phase 1
visual pass are finished; Phase 6 has been declared but not begun.*

**D. Last documented blocker**
Three founder decisions gating Phase 6 completion — A-003 (platform fee),
A-004 (cancellation/refund), A-005 (GST/TCS) — plus the external AWS SES account.

**E. Missing external credentials, approvals or service configuration**
Unset by name (values never inspected): `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
`EMBEDDINGS_PROVIDER`, `EMBEDDINGS_API_KEY`, `GOOGLE_MAPS_API_KEY`,
`EMAIL_TRANSPORT`, `EMAIL_FROM`, `SES_CONFIGURATION_SET`, `MEDIA_STORAGE`,
`SENTRY_DSN`, `POSTHOG_KEY`. No AWS account with a verified SES identity.

**F. Outstanding product decisions**
A-003, A-004, A-005 (financial); A-006 (embeddings provider); A-009 (editing a
published listing — now urgent because listings are traveller-visible);
A-011 (host KYC documents); A-012 (MFA reset policy); curated collections
editorial content (FR-01).

**G. Uncommitted work that must be preserved**
All 114 paths. Highest value: the entire approved-identity port
(31 component files + `globals.css`), `prisma/schema.prisma` + the
`20260901124940_search_trigram_indexes` migration, 9 test files,
ADR-0014 and ADR-0015, and `docs/PHASE-5.1-AUDIT.md`.

**H. Work that exists in code but lacks verification**
The Google Maps provider path (key unset locally); every integration test
(190 documented, database down); all UI behaviour under responsive breakpoints;
everything in a deployed environment.

**I. Work documented as complete but not independently verified here**
The 190 database integration tests — documented and present as source, but not
executed during this audit. Queue verification against a live database
(`pgboss` 12-table schema). Seed idempotency (6 roles, 38 permissions,
82 grants).

**J. Dependencies preventing the next phase from proceeding**
Phase 6 can *start* — availability and slots (FR-08) depend on none of the
blocked decisions. It cannot *finish* without A-003, A-004 and A-005.

---

## 8. Blocker register

Actual blockers and dependencies only; ordinary improvements are excluded.

| ID | Description | Phase | Severity | Category | Evidence | Impact | Dependency | Recommended resolution | Founder approval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **B-01** | ~7 weeks of work exists only in the working tree; never committed, pushed or CI-validated | All | **Critical** | Code | `git status` 114 paths; `HEAD aeff6d7` 2026-08-25; level with `origin/main` | Total loss of the visual identity port, Phase 5.1 work, 9 test files, a migration and 2 ADRs on any disk failure or stray `git clean` | None — purely an action | Branch, review, commit in logical units, push; let CI validate | No |
| **B-02** | GST/TCS structure undecided (A-005) | 6 | **Critical** | Product | `docs/ASSUMPTIONS.md` A-005; `PROJECT_STATE.md` "still not been started" | Determines column structure for money-holding records; a wrong guess means migrating financial data | Chartered accountant engagement | Engage a CA now — longest external lead time in the project | **Yes** |
| **B-03** | Platform fee undecided (A-003) | 6 | **High** | Product | A-003 DEFERRED, nothing built | Booking cannot compute amounts | Founder decision | Decide before the booking state machine is written | **Yes** |
| **B-04** | Cancellation and refund policy undecided (A-004) | 6 | **High** | Product | A-004 DEFERRED, nothing built | Determines refund records and payment state transitions | Founder decision | Decide before payment capture ships | **Yes** |
| **B-05** | No AWS account with a verified SES identity; no sandbox exit | 10, 12 | **High** | Credentials / Infrastructure | `docs/EMAIL.md`; no real email ever sent; `EMAIL_TRANSPORT` unset | Auth login codes cannot reach real users; product is unusable in production without it | AWS account + support request lead time | Start the sandbox-exit request first — it has lead time | **Yes** |
| **B-06** | TOTP replay prevention absent | 3, 11 | **High** | Security | `PROJECT_STATE.md` open items | An intercepted TOTP code is reusable within its window | None — engineering only | Implement before the first money-moving endpoint | No |
| **B-07** | Embeddings provider undecided (A-006) | 8 | **High** | Product / Architecture | A-006 DEFERRED; no vector column exists | Fixes the vector column dimension; blocks semantic search and AI discovery | Founder/technical decision | Decide before Phase 8; ADR-0014 names the attachment point | **Yes** |
| **B-08** | No deployment configuration or IaC; nothing has run outside a dev machine | 12 | **High** | Infrastructure | No Terraform/CDK/SST/app Dockerfile found | No phase has runtime verification; production readiness is entirely unproven | AWS approval (frozen) | Unfreeze and plan infrastructure; keep audit-only until approved | **Yes** |
| **B-09** | No MFA reset path for a locked-out operator (A-012) | 3, 7 | **Medium** | Security / Operations | `PROJECT_STATE.md` open items | Only recovery is a direct database update; acceptable with one operator, not a team | Policy decision | Define and build a supported reset path | **Yes** (policy) |
| **B-10** | No analytics or error observability wired | 11 | **Medium** | Observability | PostHog adapter 11 lines; `POSTHOG_KEY`, `SENTRY_DSN` unset | Production failures would be invisible | Provider accounts | Wire Sentry before any deployment | **Yes** (spend) |
| **B-11** | Integration suite not runnable; SaaS database container exited | 2,3,4,5,7,10 | **Medium** | Testing | `lavivenzia-postgres` Exited (0) 25 hours ago | 190 documented integration tests are unverified today | Start the local database | `npm run db:up` then `npm run test:integration` | No |
| **B-12** | Google Maps provider path unexercised; no embedded map | 5 | **Medium** | Integration / Credentials | `GOOGLE_MAPS_API_KEY` unset; no Google account arranged | Fallback is what has actually been tested; no in-page map | Google account + billing | Arrange a Google Cloud account and key | **Yes** (spend) |
| **B-13** | A-009 (editing a published listing) now has traveller-visible consequences | 2, 4 | **Medium** | Product | A-009 ASSUMED, conservative default in place | Affects what travellers see when a host edits a live listing | Founder decision | Settle before hosts accumulate live listings | **Yes** |
| **B-14** | Availability and slots (FR-08) not built | 4, 6 | **Medium** | Code | No availability model or route | Required before booking; blocks nothing else | None — engineering only | Build first in Phase 6; it depends on no blocked decision | No |
| **B-15** | `PROJECT_STATE.md` header and roadmap table are stale relative to its own body | — | **Low** | Documentation | Header says 2026-09-01 and "brand pending"; body has a 2026-09-08 approval record | Readers may conclude the design blocker is still open | None | Update header and the Phase 1 row | No |

**Explicitly not blockers:** the two deliberate token vocabularies, the unmounted
AI Genie components, the deferred curated collections, and the boundary-only
adapters. Each is a recorded decision with a rationale, not debt.

---

## 9. Testing and verification evidence

### Commands executed and results

| Command | Result |
| --- | --- |
| `git rev-parse --abbrev-ref HEAD`, `git log`, `git status --porcelain`, `git rev-list --left-right --count` | Read-only. Branch `main`, HEAD `aeff6d7`, 114 uncommitted paths, level with origin |
| `npx tsc --noEmit` | **PASS** — exit 0, no diagnostics |
| `npm run lint` (`eslint .`) | **PASS** — no errors, no warnings |
| `npm run format:check` (`prettier --check .`) | **PASS** — "All matched files use Prettier code style!" |
| `npm run test` (`vitest run`) | **PASS** — 29 files, **409 tests**, 2.59s |
| `npm run build` (`next build`) | **PASS** — compiled; route manifest emitted |
| `docker ps -a` | Read-only. `lavivenzia-postgres` **Exited (0) 25 hours ago** |

The documented count in `PROJECT_STATE.md` is 394 unit tests; the tree now has
**409**, consistent with the uncommitted work having added 15.

### Commands deliberately NOT executed, and why

| Command | Why not |
| --- | --- |
| `npm run test:integration` | Requires the database; `lavivenzia-postgres` is stopped. Starting it is a state change outside an audit-only brief |
| `npm run db:up` | Would start infrastructure — excluded by the audit scope |
| `npm run db:migrate` / `db:reset` / `db:seed` | Mutate database state; `db:reset` is destructive by design |
| `npm run db:verify` | Requires a running database |
| `npm run worker` | Starts a process and would attach to the queue |
| Any deploy, AWS or DNS command | Explicitly prohibited by the brief and by the AWS freeze |

### Outstanding verification

1. 190 database integration tests across `auth-flows`, `discovery`,
   `email-delivery`, `host-inventory`, `operations-review`, `queue`,
   `rbac-seed`, `schema`.
2. Migrations applying cleanly to an empty database (CI job exists, has not run
   against the current tree).
3. Seed idempotency — 6 roles, 38 permissions, 82 grants.
4. Google Maps adapter against the live API.
5. SES adapter against real SES — has never spoken to the service.
6. Any responsive or cross-viewport UI behaviour.
7. Anything at all in a deployed environment.

**A green unit suite is not evidence that a historical phase was complete.** The
project's own record shows four consecutive milestones whose defects were found
only by opening the running product, never by the suite.

---

## 10. Infrastructure constraints

AWS work is **frozen pending founder approval on cost**. This audit treated that
as binding and current.

**Nothing was created, modified or deployed.** No AWS resource, no IAM change,
no DNS change, no billing change, no database provisioning, no service enabled.

Infrastructure that remains, all dependent on that approval:

- AWS account with a verified SES sending identity and production access out of
  the sandbox (`docs/EMAIL.md` holds the full checklist).
- Application hosting for the single Next.js deployable plus the separate worker
  entrypoint (ADR-0002).
- A managed PostgreSQL instance with PostGIS and pgvector.
- Object storage to make the S3 `StoragePort` adapter real (currently a 44-line
  stub; local transport is what works).
- Error and product observability (Sentry, PostHog).
- A Google Cloud account for Maps.

**Infrastructure defined in code is not assumed deployed** — and in this
repository almost none is defined at all. The only Dockerfile builds the local
development database image.

---

## 11. Remaining work summary

Separated as the brief requires, because these are different kinds of work with
different dependencies.

**1 — Remaining feature development**
Phase 6 booking and payments in full; Phase 8 AI discovery; Phase 9 itinerary
engine; availability and slots (FR-08); traveller profile, preferences and
wishlist; Google OAuth, password reset, email change; curated collections
(FR-01); host KYC documents; an embedded interactive map.

**2 — Verification and testing work**
Execute the integration suite; verify migrations against a clean database; prove
seed idempotency; exercise the Google Maps provider against the live API; send a
real email through SES; establish responsive and cross-viewport verification,
which does not exist in any form today.

**3 — Infrastructure and integration work**
Everything in §10, all gated on the AWS cost approval.

**4 — Production-readiness work**
Wire observability; implement TOTP replay prevention; build an MFA reset path;
establish a deployment pipeline; run a security review against the money path
once it exists; load and failure-path testing.

**A phase that is implemented but not verified still carries outstanding work.**
Four phases — 1, 2, 5 and 7 — sit in exactly that state.

---

## 12. Recovery and execution plan

### P0 — Critical blockers and data/security risk

| Task | Reason | Dependency | Expected outcome | Verification | Founder approval |
| --- | --- | --- | --- | --- | --- |
| Commit and push the 114 uncommitted paths | Seven weeks of work is one disk failure from gone, and CI has never seen it | None | Work is durable and CI-validated | CI green on the pushed branch | No |
| Engage a chartered accountant on GST/TCS (A-005) | Longest external lead time in the project; every week of delay is added to the end of Phase 6 | Founder action | Tax structure settled before money columns are designed | Written structure recorded in `ASSUMPTIONS.md` | **Yes** |
| Start the AWS SES sandbox-exit request | Support request with lead time; blocks all real email | AWS account | Verified identity, production sending | A real email delivered to an unverified address | **Yes** |

These three are independent and should run **in parallel**. Only the first is
engineering work.

### P1 — Work needed to resume the current phase

| Task | Reason | Dependency | Expected outcome | Verification | Founder approval |
| --- | --- | --- | --- | --- | --- |
| Start the database and run the full integration suite | 190 tests are documented but unverified; restores confidence in the tree before new work | `npm run db:up` | Known-good baseline | Suite green | No |
| Decide A-003 (platform fee) and A-004 (cancellation/refund) | Booking cannot be completed without them | Founder decision | Booking state machine can be designed | Recorded in `ASSUMPTIONS.md` | **Yes** |
| Implement TOTP replay prevention | Must land before the first money-moving endpoint | None | Replay window closed | Test proving a used code is rejected | No |

### P2 — Remaining functionality for the current phase

| Task | Reason | Dependency | Expected outcome | Verification | Founder approval |
| --- | --- | --- | --- | --- | --- |
| Build availability and slots (FR-08) | The first buildable piece of Phase 6; depends on none of the blocked decisions | None | Hosts can express when an experience runs | Unit + integration tests | No |
| Build the booking state machine | Core of Phase 6 | A-003, A-004 | Reservations with correct state transitions | Integration tests including concurrency | No (after decisions) |
| Implement payment capture and the money path | Revenue | A-003, A-004, A-005, Razorpay credentials | End-to-end booking and payment | Integration tests + webhook verification + a security review | **Yes** |

Availability and slots can start **immediately and in parallel** with the
founder decisions. The state machine and payment work are **sequential** behind
them.

### P3 — Subsequent phases

| Task | Dependency | Founder approval |
| --- | --- | --- |
| Decide the embeddings provider (A-006), then build Phase 8 AI discovery | A-006 fixes the vector column dimension | **Yes** |
| Phase 9 itinerary engine | Phase 6 and 8 | No |
| Complete Phase 3's profile half — traveller profile, preferences, wishlist | None | No |
| Curated collections (FR-01) | Editorial content | **Yes** |
| Settle A-009 before hosts accumulate live listings | Founder decision | **Yes** |

### P4 — Final integration and production readiness

| Task | Dependency | Founder approval |
| --- | --- | --- |
| Wire Sentry and PostHog | Provider accounts | **Yes** (spend) |
| Build the deployment pipeline and infrastructure | AWS cost approval | **Yes** |
| Build an MFA reset path (A-012) | Policy decision | **Yes** |
| Establish responsive and cross-viewport verification | None | No |
| Full security review of the money path | Phase 6 complete | No |

**Parallel vs sequential.** P0 items are parallel and should start now. Within
P2, availability is parallel to the founder decisions; everything downstream of
the money path is strictly sequential behind A-003, A-004 and A-005. The AWS
track (P0 SES → P4 infrastructure) runs in parallel with all feature work and
should be started earliest because it is the only track whose delay is external.

**No effort estimates or dates are given.** The repository contains no velocity
history from which to derive them — eight commits over six days in August, then
seven weeks of uncommitted work.

---

## 13. Open questions requiring founder decisions

1. **GST/TCS structure (A-005)** — has a chartered accountant been engaged? This
   is the longest-lead item in the project and the record says it has not been
   started.
2. **Platform fee (A-003)** — what is it, and how does it apply?
3. **Cancellation and refund policy (A-004)** — what are the windows and
   proportions?
4. **AWS cost approval** — is the infrastructure freeze still in force? Nothing
   reaches production until it lifts.
5. **Embeddings provider (A-006)** — which provider? It fixes the vector column
   dimension and blocks Phase 8.
6. **Editing a published listing (A-009)** — keep the conservative default
   (not editable), or allow the edit and return the listing to review?
7. **MFA reset policy (A-012)** — what is the supported recovery path for a
   locked-out operator?
8. **Google Cloud account for Maps** — approved? Required for an embedded map.
9. **Observability spend** — Sentry and PostHog approved?
10. **Curated collections (FR-01)** — who produces the editorial content?

---

## 14. Files and evidence referenced

**Configuration and build**
`package.json`, `eslint.config.mjs` (lines 21–27, 49–55), `tsconfig.json`,
`next.config.ts`, `vitest.config.mts`, `vitest.integration.config.mts`,
`docker-compose.yml`, `docker/postgres/Dockerfile`, `.github/workflows/ci.yml`,
`.env.example`

**Schema and data**
`prisma/schema.prisma` (13 models, 6 enums), `prisma/migrations/` (5 migrations),
`scripts/db-reset.ts`, `scripts/db-test-setup.ts`, `scripts/grant-role.ts`,
`scripts/verify-database.ts`

**Architecture**
`src/modules/` (8 domains), `src/ports/` (7 ports), `src/adapters/` (10 adapter
families), `src/jobs/`, `src/lib/`, `src/app/api/v1/` (29 routes),
`src/app/` (22 pages), `src/components/` (49 files)

**Adapters inspected for stub status**
`src/adapters/payments/razorpay/` (84 lines, NotImplementedError for orders;
webhook verification implemented), `src/adapters/llm/anthropic/` (22 lines,
NotImplementedError), `src/adapters/embeddings/` (26 lines, stub),
`src/adapters/analytics/posthog/` (11 lines, stub),
`src/adapters/storage/s3/` (44 lines, stub),
`src/adapters/email/ses/` (257 lines, implemented),
`src/adapters/maps/google/` (243 lines, implemented)

**Tests**
`tests/unit/` — 29 suites, 409 tests. `tests/integration/` — 8 suites plus
`helpers.ts` and `setup.ts`

**Documentation**
`PROJECT_STATE.md`, `PROJECT.md`, `REQUIREMENTS.md`, `CLAUDE.md`, `DESIGN.md`,
`SYSTEM_DESIGN.md`, `DEVELOPMENT_WORKFLOW.md`, `WIREFRAME.md`, `README.md`,
`docs/ASSUMPTIONS.md`, `docs/AUTHENTICATION.md`, `docs/DATABASE.md`,
`docs/EMAIL.md`, `docs/PHASE-5.1-AUDIT.md`, `docs/UI-REFERENCE-INVENTORY.md`,
`docs/adr/0001`–`0015`

---

## 15. Audit limitations and unknowns

**Limitations of this audit — stated so its conclusions are not over-read.**

1. **No integration tests were executed.** The SaaS database container is
   stopped and starting it falls outside an audit-only brief. All statements
   about database behaviour rest on source inspection and the project's own
   records, not on observed test results.
2. **The application was never run.** No page was loaded, no flow exercised. The
   project's own history shows this is precisely where its defects have been
   found — so "the build passes" should not be read as "the product works."
3. **No deployed environment exists to audit.** Every runtime claim is about a
   developer machine.
4. **Secret values were never read.** Environment variables were checked for
   presence by name only.
5. **Git history is thin.** Eight commits over six days, then seven weeks of
   uncommitted work. History cannot explain *why* work stopped being committed.
6. **The reason committing stopped is UNKNOWN.** There is no evidence in the
   repository, logs or documents. It is not inferred here.
7. **The master roadmap document itself was not in the repository.** "LA
   VIVENZIA — Phased Development Strategy" is referenced by `PROJECT_STATE.md`
   as authoritative but is not present as a file; phase scope was taken from
   `PROJECT_STATE.md`'s reproduction of it and from `REQUIREMENTS.md`.
8. **No external CI results were consulted** — GitHub Actions history was not
   queried. The statement that CI has not validated the current tree is derived
   from the trigger configuration plus the fact that nothing has been pushed.

**Explicit unknowns:**

- Why development stopped being committed after 2026-08-25.
- Whether any work exists on another machine or branch not present here.
- Whether the AWS freeze is still current as of today.
- Whether a chartered accountant has been engaged since the record was written.
- Whether the 190 integration tests currently pass.
