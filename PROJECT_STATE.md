# Project State

Living record of what exists, what is pending, and what is blocked. Updated at
the end of every task, per `DEVELOPMENT_WORKFLOW.md`.

**Last updated:** 2026-09-01
**Current phase:** 5.1 — Alignment, completion and roadmap reconciliation
**Next phase:** 6 — Booking & Payments

## Read this before anything else: the roadmap

The authoritative plan is the master document **"LA VIVENZIA — Phased
Development Strategy"**, whose phases are:

| Phase | Name                              | Status                                   |
| ----- | --------------------------------- | ---------------------------------------- |
| 0     | Architecture & Project Foundation | Complete                                 |
| 1     | Design System & UI Foundation     | Complete for engineering; brand pending  |
| 2     | Public Website & Discovery        | Complete, less curated collections       |
| 3     | Authentication & User Profiles    | Complete for launch scope; rest deferred |
| 4     | Host & Inventory Management       | Complete, less availability and KYC docs |
| 5     | Search, Maps & Location           | Complete, less semantic retrieval        |
| 6     | Booking & Payments                | **Next**                                 |
| 7     | Admin & Operations                | Built early — the console already exists |
| 8     | AI Discovery MVP                  | Not started                              |
| 9     | Itinerary Engine                  | Not started                              |
| 10    | CRM & Notifications               | Partly built early — transactional email |
| 11    | Analytics, Security & Hardening   | Partly built early — RBAC, audit, limits |
| 12    | Integration, QA & Production      | Not started                              |

**Work was implemented out of the official order.** Authentication, host and
inventory management, the operations console and traveller discovery all shipped
before their official phase. That is recorded here rather than corrected: the
phase numbers are how progress is reported to the founders, so renumbering them
to match what was built would make the reports meaningless.

Earlier milestone records in this file use phase names invented in the sessions
that produced them ("Phase 4a", "Phase 5 — Traveller Discovery"). **Those names
are not authoritative.** They are left in place because they date the work
accurately; read them as milestone titles, not as roadmap positions. Where they
sit officially:

| Milestone record in this file         | Official phase |
| ------------------------------------- | -------------- |
| Transactional email (2026-08-22)      | 10             |
| Host onboarding and inventory (08-25) | 4              |
| Operations console (2026-08-25)       | 7              |
| Traveller discovery (2026-08-26)      | 2              |
| Search, maps and location (09-01)     | 5              |

**Status:** Phase 5.1 was a one-time alignment milestone: audit the repository
against the master strategy, finish everything required through official Phase 5,
and reconcile the documentation with reality. It closed the two real gaps that
audit found — location and geospatial search, which had a PostGIS column that no
query read; and traveller sign-in, which had a complete tested backend and no way
in through the product.

**The visual system was unchanged during Phase 5.1**, which was correct at the
time. It changed on 2026-09-08: the moodboard is approved and implemented. See
the milestone record below and `DESIGN.md` §A.

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

| Area         | State                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Environment  | Zod validation, split into build-safe shape checks and runtime deployment invariants (ADR-0009)                                   |
| Logging      | pino, JSON in production, correlation IDs via `AsyncLocalStorage`, secret redaction by path                                       |
| Errors       | One `AppError` hierarchy with `code`, `httpStatus`, `isOperational`, `isRetryable` (ADR-0006)                                     |
| HTTP         | `withRoute` wrapper: correlation ID, request logging, centralized error mapping; Zod body/query parsing                           |
| Database     | Prisma 7 with the `pg` driver adapter, bounded pool, singleton guard                                                              |
| Schema       | Identity, RBAC, audit, plus `otp_challenges` and `rate_limit_counters`                                                            |
| Migrations   | Two: extensions + identity schema, then auth OTP and rate limiting                                                                |
| Local DB     | `docker-compose.yml` + custom image. **Running** — PostgreSQL 16.15, PostGIS 3.4.3, pgvector 0.8.6                                |
| Seed         | Idempotent reconciling RBAC seed. **Applied** — 6 roles, 38 permissions, 82 grants                                                |
| Queue        | pg-boss verified against a live database (12-table `pgboss` schema created). **No business jobs registered**                      |
| Auth domain  | Full service: registration, email OTP, password login, sessions, MFA, rate limits                                                 |
| Credentials  | argon2id passwords (RFC 9106), SHA-256 hashed OTP codes, TOTP via otpauth                                                         |
| Auth API     | 8 endpoints under `/api/v1/auth`, Zod-validated, correlation IDs, rate limited                                                    |
| Sessions     | Server-side, hashed tokens, httpOnly + `__Host-` cookie, revocation effective immediately                                         |
| RBAC         | 6 roles, 38 permissions, full role-to-permission mapping (assumption A-001)                                                       |
| Email        | SES adapter implemented (ADR-0011); console transport for local development; login codes delivered                                |
| Design       | Token layer, typography and component set (ADR-0012). Resolves A-007                                                              |
| Hosts        | Profile, completeness assessment, verification lifecycle (FR-05)                                                                  |
| Inventory    | Experiences with lifecycle, media, location, pricing fields (FR-06, FR-07)                                                        |
| Media        | Magic-byte validated uploads behind `StoragePort`; local transport (ADR-0013)                                                     |
| Host UI      | Nine screens: landing, sign-in, join, overview, profile, inventory, editor, preview                                               |
| Traveller UI | Home, browse, experience, destinations, destination, categories, category, sign-in, join                                          |
| Templates    | One: `auth.login-code`. Framework-free renderer producing subject, text and HTML                                                  |
| Adapters     | Maps is implemented (Google + catalogue). Payments, LLM, embeddings and analytics remain boundaries only; S3 storage still a stub |
| CI           | Two jobs: verify gate, and migrations + seed idempotency + integration tests on a clean database                                  |
| Search       | Trigram keyword ranking, misspelling tolerance, four GIN indexes (ADR-0014)                                                       |
| Location     | PostGIS proximity and distance; Places autocomplete with a catalogue fallback (FR-03)                                             |
| Traveller    | Passwordless sign-in and account creation reachable from the site (FR-04)                                                         |
| Tests        | 394 unit tests (no database needed) + 190 database integration tests                                                              |
| Test DB      | Dedicated `lavivenzia_test`, provisioned by `npm run db:test:setup`                                                               |
| Reset        | `npm run db:reset` behind a three-gate safety guard; drops, re-migrates, re-seeds                                                 |

### Deliberately not built

Booking, payments, refunds, GST/TCS, commission, AI features, reviews, wishlists
and itineraries.

**Maps and location are now built** (official Phase 5, ADR-0014) — proximity
search, distance ordering, autocomplete and geocoding. What is _not_ built is an
embedded interactive map, which needs a Google Maps JavaScript key published to
the browser; no Google account has been arranged. The experience page shows the
address and a keyless link that opens the traveller's own map application.

**Semantic and vector search are not built and no vector column exists.** The
embeddings provider fixes the column dimension and remains unresolved (A-006).

**Booking is inert, and says so.** The experience detail page has a real booking
panel — price, duration, capacity, host — with a call to action that states
booking is not open rather than pretending. The information architecture is
built so booking fills that panel without the page being redesigned.

**No financial arithmetic exists anywhere.** `experiences.base_price_minor`
holds the host's own list price and nothing else. No fee, commission, tax or
payout is stored, derived or displayed.

Authentication now has a working transport, but **no real email has been sent**:
the AWS account is being arranged separately, so the SES adapter has never
spoken to SES. Google OAuth, password reset and email change each still need
their own flow. Full list in `docs/AUTHENTICATION.md` under Known limitations,
and `docs/EMAIL.md` for what AWS must supply.

---

## Milestone record — approved visual identity (2026-09-08, official Phase 1)

**The longest-running blocker in the project is closed.** Every milestone since
August recorded "the moodboard has not been approved". The founders supplied
references (`public/uirefrence/`), and the identity is now implemented.

**It was ported, not reinterpreted.** The references were rendered from a demo
app that also exists on this machine, so its components and CSS were brought
across rather than rebuilt from screenshots. That is why the product matches the
images exactly rather than approximately.

| Area       | Change                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Tokens     | Full two-axis system: light/dark **and** green/blue, set before paint   |
| Palette    | Neutral axis moved from brown-black to deep pine; new `#1f4d3a` primary |
| Type       | Cinzel retained; body Montserrat → **Sora**                             |
| Shape      | `--radius-card` 18px and `--radius-pill`; buttons are pills everywhere  |
| Chrome     | One header, footer and tab bar across every public page (`SiteShell`)   |
| Components | 26 approved components adopted; 5 interim ones deleted                  |

**Every public page shares one navigation.** Before this, `/` used the approved
header while `/experiences`, `/destinations` and `/categories` used an older
one — two navigations one tap apart.

**The screens are dynamic, not a mock.** An early pass replaced the working
homepage with the demo's fixtures, which removed real listings, sign-in, sign-out
and host access. That was wrong and was reverted: `src/lib/home-content.ts`
adapts domain types onto the approved components' prop shapes, so the pixels are
as approved while the content is the live catalogue.

**Deliberately not shipped:** the Stays, AI Genie and Trips surfaces. No
accommodation entity exists, AI discovery is Phase 8 with its embeddings
provider unresolved, and itineraries are Phase 9. `AIGenieSection` and
`AIGenieFeature` are on disk, matching the approved design, unmounted.

**Two token vocabularies remain**, deliberately: `--lv-*` for the public site,
the console names for the consoles, which have no approved reference of their
own. `DESIGN.md` §A.6 records why they must not be merged on aesthetic grounds.

### Design state, separated by evidence (added 2026-10-20)

The identity being implemented is not the same claim as the identity being
verified. Four distinct states, so neither is read as the other:

| State                      | What holds                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direction documented**   | `DESIGN.md` §A (approved system) and §B (brand expression, experience principles, visual governance, added 2026-10-20)                                                                                                                                                                                                          |
| **Tokens implemented**     | Confirmed in `src/app/globals.css` — ground `#f3efe7`, heading `#16261e`, primary `#1f4d3a`, gold `#d4af37`; Cinzel + Sora loaded through `next/font` in `layout.tsx`                                                                                                                                                           |
| **Components implemented** | `SiteShell`, `ProfileButton`, `PageHeader`, one `Button` with variants, `feedback.tsx` / `status.tsx` for states                                                                                                                                                                                                                |
| **Visually verified**      | **No.** The application has not been opened and inspected since the identity landed, and the repository has **no visual regression or responsive test infrastructure** — no Playwright, no screenshot comparison, no breakpoint test. `button-variants.test.ts` is the only automated design guard, and it covers buttons alone |

**Outstanding design work**, none of it started: visual regression coverage;
responsive verification at real breakpoints; automated contrast checking;
documented media standards for host-supplied photography (resolution, aspect
ratios, compression — `DESIGN.md` §B.6 marks these REQUIRES VERIFICATION);
confirmation that `prefers-reduced-motion` is honoured.

**The identity question is settled (2026-10-20).** A competing direction
supplied on 2026-10-16 — Ivory / Obsidian / Stone, forest demoted to an accent,
a new brand line — was weighed against §A and **rejected by the founders**.

**La Vivenzia remains a forest-green-and-ivory brand**, refined through
luxury-editorial design rather than replaced by an ink-led identity. Green stays
primary and the neutral axis; ivory `#F3EFE7` and the green-based dark neutral
`#16261E` stay; gold and the logo artwork are preserved; the tagline stays
"Experience Every Journey Through Its Soul"; terracotta and bronze are not
introduced. The craft of the rejected direction was kept — whitespace, editorial
typography, authentic photography, restrained motion, accessibility, consistent
tokens — none of which depended on changing a colour.

**No code change follows from this.** Option A is what the product already
implements: no re-skin, no asset re-cut, no token migration. The green/blue
toggle and dark-mode behaviour stay exactly as they are pending their own
review. Decision and evidence: `docs/VISUAL_IDENTITY_DECISION.md`.

**One defect survives the decision.** `--lv-accent-ink` (3.52:1) and
`--lv-fg-subtle` (3.19:1) fail WCAG AA in both light palettes, on text that
includes an interactive link and instructional copy. A fix holding hue and
saturation exactly is proposed in `VISUAL_IDENTITY_DECISION.md` §7.1 — four
light-mode values — and **has not been applied**. Both dark palettes pass.

---

## Milestone record — search, maps and location (2026-09-01, official Phase 5)

**Scope.** Official Phase 5, plus the two gaps a full Phase 0–5 audit found. The
audit itself is `docs/PHASE-5.1-AUDIT.md`; this is the summary.

**What was built.**

| Capability            | How                                                            |
| --------------------- | -------------------------------------------------------------- |
| Nearby discovery      | `ST_DWithin` against the GiST-indexed `geo` column             |
| Distance results      | `ST_Distance` on `geography` — metres, shown on the card       |
| Keyword relevance     | Weighted `word_similarity`, four GIN trigram indexes           |
| Misspelling tolerance | "kerela" finds Kerala; threshold 0.4 (A-016)                   |
| Location search       | `/api/v1/places/autocomplete` and `/places/resolve`            |
| Geocoding             | Real Google Places adapter behind the existing `MapsPort`      |
| Provider fallback     | The catalogue serves when Google is absent, throttled or down  |
| Traveller sign-in     | `/sign-in` code path and `/join` — the backend already existed |
| Category pages        | `/categories` and `/categories/[key]` (FR-01)                  |
| Location panel        | Address plus a keyless map link on the experience page         |

**The `geo` column had never been read.** PostGIS was enabled in the first
migration specifically so that nearby search would not need a retrofit
(ADR-0008), the column was generated and indexed correctly, and no query touched
it. Likewise `pg_trgm`, installed and unused. Phase 5.1 is largely the work of
using what was already provisioned.

**Retrieval stayed in PostgreSQL.** No search cluster, no vector database, no
cache tier. Rationale and the revisit trigger are in ADR-0014.

**Semantic search remains deferred and no vector column was added.** The
embeddings provider is still unresolved (A-006) and it fixes the column
dimension. ADR-0014 records precisely where the semantic arm attaches when the
decision lands — two functions in one file, with nothing above the repository
changing.

**Three defects were found by walking the running product, not by the suite:** a
fractional SQL parameter typed as an integer, a `"use client"` module exporting a
plain array that broke `/experiences` with HTTP 500, and a sort control that
labelled itself incorrectly. Details in the audit document. Each now has a test.

**That is four milestones running in which the only way to find a defect was to
open the product.** The invisible hero button, the soft 404, the missing logout,
and now the client-boundary 500. The pattern is consistent: each component was
correct and the composition was not. The guards added in response —
`button-variants`, `route-structure`, `client-boundary` — assert composition and
reachability rather than rendering, which is the property that keeps being
missed.

**The visual system is unchanged.** No token, colour, typeface or component
language was altered. The moodboard is still unapproved.

---

## Milestone record — traveller discovery (2026-08-26)

**Scope.** Functional traveller marketplace: homepage, browse with search,
filters and sorting, destination browsing, experience detail. Deliberately not
booking, payments, reviews, AI or maps — those are later milestones.

**The visual system is unchanged, deliberately.** The founders have not approved
the new moodboard, so this milestone uses the existing tokens, typography,
palette and components exactly as they were. No token was added, renamed or
recoloured. See "Replacing the design system" below for what a later visual pass
touches and what it does not.

**Already present, and reused rather than rebuilt.** The experience and host
data model, media storage, the review workflow that decides what is published,
the error model, the logger, and the whole `components/ui` layer — buttons,
fields, alerts, empty and loading states, badges, the wordmark. `Page<T>` and
the paging clamp moved to `src/modules/shared/pagination.ts` so discovery and
operations share one definition rather than two.

**Implemented.**

- `src/modules/discovery` — a public read surface whose port has **no status
  parameter at all**, so nothing unpublished is reachable through it.
- `parseFilters` — the input boundary. Every filter arrives from a query string
  a stranger controls; malformed values are dropped rather than rejected, and
  none of them can widen what is visible.
- Three public API routes and six traveller screens.
- One reusable `ExperienceCard`, rendered by every discovery surface, so a card
  redesign is one file rather than four screens.

**Files.** 16 added, 6 modified. **No database change** — no migration, no
schema edit, no new permission. Discovery reads what the review workflow already
publishes.

**Three defects found in this milestone's own work.**

**A soft 404 on every detail route.** A segment-level `loading.tsx` at
`experiences/` creates a Suspense boundary around the whole segment _including_
`experiences/[slug]`, so the shell flushed — committing HTTP 200 — before the
page could call `notFound()`. The right page rendered under the wrong status,
which is precisely what a search engine indexes, on a surface REQUIREMENTS.md
asks to be indexable. Confirmed against a production build, not just dev.
The Suspense boundary now lives inside the list page, covering the slow query
without covering the child route; both routes return a real 404 and the loading
skeleton is unchanged. A source-scanning test fails if a segment with a dynamic
child ever gains its own `loading.tsx` again.

A literal NUL byte reached PostgreSQL (`22021: invalid byte sequence`) from a
sentinel string used to make an unresolvable destination match nothing. The
sentinel was the wrong idea regardless — the query now short-circuits to an
empty page, which says what it means and has no magic value to corrupt.

`?minPrice=5000` meant ₹5,000 on the browse page and ₹50 through the API,
because only the page converted major units to minor. The conversion now happens
once inside `parseFilters`, so both entry points read the parameter identically.
A test pins it.

## Replacing the design system

The visual pass, when the moodboard is approved, changes:

- `src/app/globals.css` — the entire token layer: palette, type, radius,
  elevation, spacing.
- `src/components/ui/*` — buttons, fields, badges, alerts, empty and loading
  states, the wordmark.
- `src/components/site/*` — the traveller header, footer, experience card and
  destination card.

It does **not** need to change: `src/modules/discovery`, the repositories, the
API routes, or the page components' data flow. Every screen composes
`components/ui` and `components/site`; none carries its own colours, and a test
(`tests/unit/button-variants.test.ts`) fails if a button is recoloured through
`className` rather than through a variant.

---

## Milestone record — operations console (2026-08-25)

**Already present, and reused rather than rebuilt.** Every permission the review
workflow needs already existed (`experience:read:all`, `experience:approve`,
`experience:suspend`, `host:read`, `host:verify`) — **no new permission was
added**. So did the columns: `reviewedBy`, `reviewedAt`, `reviewNote` and
`publishedAt` on both `hosts` and `experiences`. Review history needs no new
table: `audit_logs` already records every transition with actor, before and
after, indexed on `(subject_type, subject_id)`. The MFA endpoints existed; only
the screen was missing.

**Implemented.**

- `src/modules/operations` — the decision tables. Which decisions exist, which
  permission each needs, which state each may be taken from, and whether a
  written reason is mandatory. Declared as data, so a transition absent from the
  table cannot happen.
- `OperationsService` — reads and decisions, all authorized at the service layer.
- Six `/api/v1/ops` endpoints and five screens.
- **The admin bootstrap** (`npm run grant-role`), closing an item open since the
  authentication milestone. The seed creates no users and registration refuses
  privileged roles, so this is the only path to a first administrator.
- **The MFA screen** (`/mfa`). Privileged roles hold an MFA-unsatisfied session
  and `authorize()` refuses everything until a TOTP code is accepted — without
  a screen the requirement was unreachable rather than enforced.

**Files.** 30 added, 8 modified. One additive migration,
`20260825113152_operations_review` — two foreign keys, no destructive statement.

**Dependencies.** None added.

**Three defects found in this milestone's own work.**

**A soft 404 on every detail route.** A segment-level `loading.tsx` at
`experiences/` creates a Suspense boundary around the whole segment _including_
`experiences/[slug]`, so the shell flushed — committing HTTP 200 — before the
page could call `notFound()`. The right page rendered under the wrong status,
which is precisely what a search engine indexes, on a surface REQUIREMENTS.md
asks to be indexable. Confirmed against a production build, not just dev.
The Suspense boundary now lives inside the list page, covering the slow query
without covering the child route; both routes return a real 404 and the loading
skeleton is unchanged. A source-scanning test fails if a segment with a dynamic
child ever gains its own `loading.tsx` again.

A latent CI failure inherited from the previous milestone: Prisma did not know
about the PostGIS GiST index or the generated `geo` expression, so
`migrate diff` reported drift and the CI step "Verify schema matches migrations"
would have failed (proven: exit 2). Declaring `@@index([geo], type: Gist)` and
`@default(dbgenerated())` fixes it — and stopped `migrate dev` from generating a
`DROP INDEX` and a `DROP DEFAULT` against a generated column. Now exit 0.

Two copy defects in refusal messages an operator reads mid-decision:
"cannot be suspendd" (the verb was being conjugated by appending `d`) and
"a experience". Both fixed, both covered by a test.

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

**Three defects found in this milestone's own work.**

**A soft 404 on every detail route.** A segment-level `loading.tsx` at
`experiences/` creates a Suspense boundary around the whole segment _including_
`experiences/[slug]`, so the shell flushed — committing HTTP 200 — before the
page could call `notFound()`. The right page rendered under the wrong status,
which is precisely what a search engine indexes, on a surface REQUIREMENTS.md
asks to be indexable. Confirmed against a production build, not just dev.
The Suspense boundary now lives inside the list page, covering the slow query
without covering the child route; both routes return a real 404 and the loading
skeleton is unchanged. A source-scanning test fails if a segment with a dynamic
child ever gains its own `loading.tsx` again.

The hero call to action was invisible. It was written as a `secondary` button
with colour utilities appended through `className` to recolour it — which does
nothing: Tailwind utilities share specificity, so the generated stylesheet's
order decides, and `bg-transparent` is emitted after `bg-gold-light`. The button
rendered near-black text on the near-black hero, present and clickable. Fixed by
adding `gold` and `inverse` variants for dark grounds; a source-scanning test now
fails if any button is recoloured through `className`.

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

## The review workflow

The loop the product runs on, and where each step is enforced.

```
host: draft ──submit──▶ IN_REVIEW ──approve──▶ PUBLISHED ──suspend──▶ SUSPENDED
                            │                                            │
                            └──reject──▶ REJECTED ──host edits──┐        │
                                              ▲                 │   reinstate
                                              └────submit───────┘        │
                                                                  PUBLISHED ◀┘
```

**Who may do what.** A host submits and withdraws; a host can never publish.
Operations approves, rejects, suspends and reinstates; operations never
archives, which is the host retiring their own listing. Both halves are
declared as tables — `src/modules/experiences/lifecycle.ts` for the host,
`src/modules/operations/review.ts` for operations — so a transition absent from
a table cannot happen.

**Reasons.** Required for reject and suspend, optional for approve and
reinstate. The rule is that a decision costing the host something must be
actionable: a rejection they cannot act on is a dead end. Minimum ten
characters, enforced in the domain and re-derived server-side.

**Hosts.** `DRAFT → PENDING` on submission, then `PENDING → VERIFIED` or
`PENDING → REJECTED`. A rejected profile returns to the host editable, with the
reason attached.

**Reaching the console.** Operations roles require MFA (ADR-0005), so
`authorize()` refuses every privileged permission until the session satisfies a
TOTP challenge at `/mfa`. The first privileged account is created with
`npm run grant-role <email> <role>` against an account that already registered
normally — registration itself refuses privileged roles, so there is no path
that creates and privileges an account in one step.

**Audit.** Every decision writes one `audit_logs` row: actor from the session,
before and after status, the reason, correlation ID. Review history in the
console is read from that table — there is no second store.

**Security.** No endpoint accepts an actor, reviewer or admin identifier; the
request schemas are `.strict()`, so sending one is rejected outright rather than
ignored. The permission each decision needs is looked up from the decision
table rather than chosen by the route, so a handler cannot authorize a
suspension with an approval permission.

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

**None for engineering through official Phase 5.** Discovery, search, location,
the review workflow and both consoles have been exercised against the running
application.

**Phase 6 is blocked on three founder decisions, not on code.** Booking cannot
be finished without the platform fee (A-003), the cancellation and refund policy
(A-004) and the GST/TCS structure (A-005). **A-005 has the longest external lead
time in the project and has still not been started** — it needs a chartered
accountant engaged before booking work completes, not after.

**External: the AWS SES account.** The application side is
complete and tested; nothing in the codebase is waiting on anything. What is
missing is an AWS account with a verified sending identity and production access
out of the SES sandbox. Until then a deployed environment can be configured
correctly and still reach nobody outside the verified list.

Leaving the SES sandbox is a support request with lead time, so it is the item
to start first. The full checklist — domain identity, DKIM, SPF alignment,
DMARC, IAM policy, configuration set — is in `docs/EMAIL.md`.

---

## Known gaps and follow-ups

### Traveller discovery

- **The visual design is deferred, not finished.** The moodboard has not been
  approved, so these screens use the existing system as a functional placeholder.
  The section "Replacing the design system" above lists exactly what a visual
  pass touches.
- **Search is `ILIKE`, not a search engine.** Correct and fast enough at this
  volume, with no trigram index yet because the row counts do not justify one.
  Semantic discovery (FR-02, FR-16) needs the embeddings decision (A-006).
- **No map view.** FR-03 wants nearby and viewport discovery. The spatial column
  and its GiST index are in place and unused; nothing else exists.
- **No wishlist, reviews or itineraries.** The permissions exist; the features
  do not.
- **Destination pages have no editorial content** — see A-013.
- **Paging is offset-based**, and deep pages get slower on a large table.

### Operations console

- **No MFA reset.** If an operator loses their authenticator they cannot get
  back in: `beginMfaEnrolment` refuses a second enrolment, which is what stops a
  hijacked session swapping the second factor. Resetting one needs an audited
  admin action that does not exist yet. Today the recovery is a database
  intervention.
- **The enrolment screen shows a key, not a QR code.** Authenticator apps accept
  manual entry, so it works; scanning would need a QR encoder dependency.
- **No notification reaches the host on a decision.** They see the outcome and
  the reason when they next open the console. Email would be the obvious
  addition and is deliberately out of scope here.
- **Verification cannot be reversed.** There is no un-verify decision for a host,
  and `experience:suspend` covers listings only. Revoking a host entirely is
  `user:suspend`, which has no screen yet.
- **Paging is offset-based.** Correct and fine at this volume; a deep page on a
  large table will get slower, and keyset paging is the answer when it does.
- **No bulk actions.** Each decision is taken on one item, deliberately — these
  publish or suppress somebody's livelihood.

- **Prettier normalized whitespace in the specification documents** on its first
  run, before they were added to `.prettierignore`. Content unchanged — all 21
  FRs and every section verified intact. Cannot recur.
- **The "Antigravity" references** in `README.md`, `PROJECT.md` §7 and
  `WIREFRAME.md` §14 address a different agent than `CLAUDE.md` and
  `DEVELOPMENT_WORKFLOW.md` do. Left unchanged — renaming was never in scope.
- **`REQUIREMENTS.md` §5** still lacks `Session`, `Role`, `Permission`,
  `UserRole`, `ConsentRecord`, `Cart`, `CartItem` and `Dispute`. The first four
  now exist in the schema.
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

- **321/321 unit tests**, passing with **no environment variables set at all**.
- **178/178 database integration tests**, including the complete authentication,
  onboarding and inventory flows against real PostgreSQL.
- `prisma validate` passes; no drift between schema and migrations.
- Production build succeeds; all 8 auth routes compile as dynamic.

Verified live over HTTP against a running server, not only through the service
layer: registration, OTP issue/verify, code replay rejection, wrong-code
rejection, password login (correct and incorrect), `me` with and without a
session, cross-origin POST rejection, logout, and rejection of a captured token
after revocation.

The **complete review loop** was verified over HTTP against a running server.
A host registered, built a profile, created an experience, uploaded a
photograph and submitted it. An operator — bootstrapped with
`npm run grant-role`, then enrolled and challenged through `/mfa` with a real
TOTP code — saw it in the queue, opened it, and rejected it with a reason. The
host read that reason both through the API and rendered on their editor page,
made the requested changes, and resubmitted; the listing returned to the queue
and was approved, reaching PUBLISHED with `publishedAt` stamped and the
reviewer recorded. The audit trail carried all four transitions with the right
actor on each.

Refusals were exercised at every step and all held: editing while in review
(409), submitting twice (409), suspending an in-review listing (409), rejecting
with no reason (400), a host attempting an operations decision (403), a
cross-origin POST (403), and a request carrying a forged `actorId` (400 — the
schemas are `.strict()`, so an unknown key is rejected rather than ignored).
Before the MFA challenge was satisfied, all three operations endpoints returned 401.

One thing the loop proved was _not_ a defect: resubmission was refused until
every newly added photograph had alternative text. That is the readiness gate
working as designed.

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

**Official Phase 6 — Booking & Payments.** That is the roadmap answer and it does
not need re-deciding.

What it needs before it can _finish_ has not changed and is not code: the
platform fee (A-003), the cancellation and refund policy (A-004) and the GST/TCS
structure (A-005). Availability and slots (FR-08) are the first buildable piece
and depend on none of them, so Phase 6 can start while those are being settled —
but it cannot ship until they land.

**A-005 remains the longest lead item in the project and has still not been
started.** It needs a chartered accountant engaged. Every week it waits is a week
added to the end of Phase 6, not to its beginning.

Two things run in parallel and belong to no phase:

**The approved moodboard, applied.** Everything functional through Phase 5 is in
place and the design system is centralised, so a visual pass is a token and
component change rather than a rebuild. This is the cheapest it will ever be —
every screen built before it is another surface to revisit. Nine traveller
screens and two consoles now exist, which is more than when this was last
written.

**The AWS SES account.** The application side is complete and tested and no
real email has ever been sent. Leaving the sandbox is a support request with
lead time. `docs/EMAIL.md` has the checklist.

**A-009 is now urgent rather than merely answerable.** Listings are visible to
travellers, so "what happens when a host edits a live listing" affects what a
traveller sees. The conservative default is in place: a published listing is not
editable. The alternative — allow the edit, return the listing to review — is a
product decision that should be settled before hosts have many live listings.

Open items independent of feature work. This list was duplicated in two places
until Phase 5.1; it is one list.

- **Engage a chartered accountant on GST/TCS (A-005).** Longest lead time in the
  project. Still not started.
- ~~Resolve the 2026-10-16 brand direction against the approved system.~~
  **Closed 2026-10-20** — founders selected the existing forest-green-and-ivory
  identity. No code change follows. `docs/VISUAL_IDENTITY_DECISION.md`.
- **Apply the WCAG AA fix to `--lv-accent-ink` and `--lv-fg-subtle`.** Four
  light-mode values, hue and saturation preserved; both dark palettes already
  pass. Proposed in `VISUAL_IDENTITY_DECISION.md` §7.1, awaiting approval.
- **Visual verification of the approved identity.** The application was run on
  2026-10-20 — it boots, serves every route, queries the database and ships the
  full four-combination token set — but it was **not seen**: the browser
  extension would not connect. 21 screens × 4 combinations remain unverified,
  and there is still no visual regression or responsive test infrastructure.
  `DESIGN.md` §B.12.
- **Decide the green/blue palette axis and the console ground (ADR-0012).**
  Explicitly deferred by the founders pending their own review.
- **TOTP replay prevention**, before the first money-moving endpoint ships. A
  code remains valid for its whole window, so an intercepted one can be reused
  inside it.
- **MFA reset for a locked-out operator (A-012).** There is no supported path;
  the only recovery is a direct database update. Fine with one operator, not
  fine with a team.
- **Traveller profile, preferences and wishlist.** Officially Phase 3, correctly
  deferred: there is no `TravellerProfile` table and nothing yet worth saving.
  Wishlist is the one with product value before booking exists.
- **Curated collections (FR-01).** Deferred pending editorial content, for the
  same reason destinations are derived (A-013).

Resolved since this list was written: the super-admin bootstrap now exists as
`scripts/grant-role.ts`, which grants a privileged role with an interactive
confirmation and writes an audit row.
