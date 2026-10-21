# Roadmap vs Implementation Audit

**Date:** 2026-10-20
**Repository:** `D:\LA  VIVENZIA\lavivenziaSAAS`
**Type:** Audit only. No code, configuration, schema or infrastructure changed.
Nothing staged, committed, pushed or deployed.

---

## 1. Executive summary

The founder update is **substantially accurate**, with two corrections and one
important nuance.

**Confirmed:** Phases 0–5 are implemented, the admin console was genuinely built
ahead of schedule and is properly authorised, and booking/payments has not
started. Full local gate passes: **409 unit tests, typecheck, lint** — all green
today.

**Corrections:**

1. **"Phases 0–5 complete" overstates verification, not implementation.** Only
   Phase 0 earns COMPLETE AND VERIFIED. Phases 1, 2, 5 and 7 are implemented but
   have never been inspected in a browser, and the repository has **no visual
   regression, responsive or end-to-end test infrastructure**.
2. **"Transactional email built" is true; "email works" is not.** Code and mock
   tests exist (58 tests). There is **no evidence in this repository** that a
   real email has ever been delivered.

**Nuance:** Phase 3 (auth) and Phase 4 (host) are _partially_ implemented — auth
is missing its entire profile half, host is missing availability and KYC
documents. Calling them "complete" conflates launch scope with roadmap scope.

**Current stopping point:** Phase 5 finished; Phase 6 declared but **zero
artefacts exist**. The project is idle at the Phase 5 → 6 boundary, waiting on
founder decisions rather than engineering.

---

## 2. Repository identity — confirmed

Main consumer-facing SaaS, **not** the CRM.

| Signal              | Value                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `package.json` name | `lavivenzia`                                                                                  |
| Description         | "La Vivenzia — curated experiential tourism marketplace"                                      |
| Domain modules      | `auth`, `discovery`, `experiences`, `hosts`, `media`, `notifications`, `operations`, `shared` |
| CRM markers         | None                                                                                          |

CRM material (`docs/LA-VIVENZIA-TWENTY-GAP-ANALYSIS.md`) was **excluded** from
evidence throughout.

---

## 3. Baseline roadmap — PDF not present

**`La_Vivenzia_Phased_Development_Strategy.pdf` is NOT in the repository.** A
filesystem search for `*.pdf` and `*phased*development*` returned nothing.

Phase scope was therefore taken from:

- `PROJECT_STATE.md` — reproduces the master phase table and names it authoritative
- `REQUIREMENTS.md` — FR-01 … FR-16
- `docs/adr/0001`–`0015`

**Limitation:** phase _acceptance criteria_ could not be read from the original
source. Where the reproduction is ambiguous, this audit says so rather than
guessing.

---

## 4. Phase status — 0 to 12

| Phase | Name                            | Status                                   | Evidence                                                                                                                                                                                    |
| ----- | ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Architecture & Foundation       | **COMPLETE AND VERIFIED**                | Hexagonal layering enforced by lint (`eslint.config.mjs:21–27, 49–55`); 15 ADRs; 409 tests run with **zero env vars**; typecheck + lint + build pass                                        |
| 1     | Design System & UI              | **IMPLEMENTED, VERIFICATION INCOMPLETE** | Tokens verified in `globals.css`; Cinzel+Sora via `next/font`; 49 components. **Never seen in a browser**; no visual regression infra                                                       |
| 2     | Public Website & Discovery      | **IMPLEMENTED, VERIFICATION INCOMPLETE** | 9 traveller screens, 3 public API routes, `modules/discovery` with no status param; `discovery-filters`, `route-structure`, `client-boundary` tests. Curated collections (FR-01) deferred   |
| 3     | Authentication & Profiles       | **PARTIALLY IMPLEMENTED**                | 8 `/api/v1/auth` routes, argon2id, OTP, TOTP, sessions, RBAC 6/40/86. **No `TravellerProfile` model**, no preferences, no wishlist, no Google OAuth, no password reset                      |
| 4     | Host & Inventory                | **PARTIALLY IMPLEMENTED**                | Host profile + verification lifecycle, experiences with lifecycle/media/pricing, 9 host screens. **No availability/slots (FR-08)**, no KYC documents                                        |
| 5     | Search, Maps & Location         | **IMPLEMENTED, VERIFICATION INCOMPLETE** | `ST_DWithin` ×2, `ST_Distance` ×3, `word_similarity` ×10, `gin_trgm_ops` ×4 verified in source. **Semantic search absent — 0 vector columns**, embeddings adapter is a 26-line stub         |
| 6     | Booking & Payments              | **NOT STARTED — BLOCKED**                | **0 of 14 models** (Booking, Payment, Order, Cart, Refund, Invoice, Payout, Commission, Availability, Slot, Reservation, Voucher, Ledger, Transaction). **0 API routes.** No domain module  |
| 7     | Admin & Operations              | **IMPLEMENTED, VERIFICATION INCOMPLETE** | 7 ops routes; `authorize(principal, PERMISSIONS.*)` in service; CSRF via `assertSameOrigin`; actor from principal, never client. 62 tests pass. Not browser-verified                        |
| 8     | AI Discovery MVP                | **NOT STARTED**                          | `AnthropicLlmAdapter` throws `NotImplementedError`; embeddings stub; `ANTHROPIC_API_KEY` unset; A-006 unresolved                                                                            |
| 9     | Itinerary Engine                | **NOT STARTED**                          | No module, model, route or test                                                                                                                                                             |
| 10    | CRM & Notifications             | **PARTIALLY IMPLEMENTED**                | SES adapter 257 lines with retry/throttle handling; 58 email tests. **No real delivery evidence**                                                                                           |
| 11    | Analytics, Security & Hardening | **PARTIALLY IMPLEMENTED**                | Security strong: RBAC, audit log, rate limits, argon2id, hashed sessions, webhook signature verification. **Observability absent** — PostHog 11-line stub, `SENTRY_DSN`/`POSTHOG_KEY` unset |
| 12    | Integration, QA & Production    | **NOT STARTED**                          | **No IaC, no deploy config, no app Dockerfile.** Only `docker/postgres/Dockerfile` for local dev                                                                                            |

**Totals:** 1 verified · 4 implemented-unverified · 4 partial · 4 not started.

---

## 5. Founder update — claim by claim

| Claim                                                                    | Verdict                                        | Evidence                                                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "Travellers can browse, search by location and category, open a listing" | **CONFIRMED (code + tests)**                   | 9 screens, `/api/v1/experiences`, `/destinations`, `/categories`, `/places/*`; PostGIS + trigram verified in source           |
| "Hosts can onboard, create listings, submit them"                        | **CONFIRMED (code + tests)**                   | Host routes + `host-inventory` integration suite                                                                              |
| "Ops console reviews and publishes"                                      | **CONFIRMED (code + tests)**                   | 7 ops routes; approve/reject/suspend/reinstate per `review/route.ts` (FR-07, FR-14); 62 tests                                 |
| "Sign-in, security and permissions built and tested"                     | **CONFIRMED (code + tests)**                   | 8 auth routes; RBAC 6 roles / 40 permissions / 86 grants                                                                      |
| "Phases 0–5 of 12 complete"                                              | **PARTIALLY CONFIRMED**                        | Implemented yes; _verified_ only Phase 0. Phases 3 and 4 are partial against roadmap scope                                    |
| "Admin console built ahead of schedule"                                  | **CONFIRMED**                                  | Phase 7 work exists at Phase 5 time; authorisation is real, not cosmetic                                                      |
| "Transactional email built ahead of schedule"                            | **CONFIRMED (code)** — delivery **UNVERIFIED** | See §6                                                                                                                        |
| "Next is Phase 6: booking and payments"                                  | **CONFIRMED**                                  | 0 models, 0 routes, 0 modules                                                                                                 |
| "Forest green + ivory locked in, tagline unchanged"                      | **CONFIRMED**                                  | `#1f4d3a` ×4, `#f3efe7` ×7 in `globals.css`; tagline present in `src/data/`; **Obsidian `#171715` appears 0 times in `src/`** |
| "No real email has ever been sent"                                       | **CONFIRMED**                                  | No delivery evidence anywhere in repo                                                                                         |
| "Engineering isn't the bottleneck"                                       | **CONFIRMED**                                  | Phase 6's first buildable piece (FR-08 availability) depends on no pending decision, yet does not exist                       |

### One contradiction found

**A third brand line ships in production metadata.** `src/app/layout.tsx`
renders `<title>` as **"La Vivenzia — Journeys Designed Around You"**, alongside
the approved tagline "Experience Every Journey Through Its Soul". Observed in the
running application on 2026-10-20. Not a blocker; needs a decision.

---

## 6. Email — the four levels

| Level                            | Status             | Evidence                                                                                                                                                                                     |
| -------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Code implemented              | ✅ **YES**         | `src/adapters/email/ses/index.ts` — 257 lines, bounded retry/backoff (line 24), throttle detection (`$retryable.throttling`, line 94), config guards (114, 117), error translation (173–174) |
| 2. Tested with mocks             | ✅ **YES**         | **58 tests** across `ses-email-adapter`, `email-templates`, `email-transport`, `console-email-adapter` — all pass                                                                            |
| 3. Tested against real provider  | ❌ **NO EVIDENCE** | `EMAIL_TRANSPORT`, `EMAIL_FROM`, `SES_CONFIGURATION_SET` all **unset** locally (`AWS_REGION` is set)                                                                                         |
| 4. Delivered to a real recipient | ❌ **NO EVIDENCE** | No message ID, delivery log or confirmation anywhere in the repository                                                                                                                       |

> **Important caveat per the audit brief:** missing local configuration is **not
> proof that no AWS account exists**. This audit can only state that _the
> repository contains no evidence_ of a configured provider or a delivered
> message. Whether an account exists externally must be confirmed by the founder.

Templates: **one** (`auth.login-code`).

---

## 7. Phase 6 — requirement by requirement

| Requirement                        | Status                    | Evidence                                                                                                                    |
| ---------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Availability validation            | **NOT STARTED**           | No `Availability` model                                                                                                     |
| Slot / inventory reservation       | **NOT STARTED**           | No `Slot`, `Reservation` model                                                                                              |
| Individual & group bookings        | **NOT STARTED**           | No `Booking` model                                                                                                          |
| Cart & checkout                    | **NOT STARTED**           | No `Cart`/`Order` model, no route                                                                                           |
| Razorpay integration               | **BOUNDARY ONLY**         | `createOrder` (line 32) and `fetchPayment` (line 39) both `throw NotImplementedError`                                       |
| Payment verification & webhooks    | **PARTIALLY IMPLEMENTED** | `verifyWebhook` (line 51) **is implemented** — HMAC + `timingSafeEqual`, runs on raw body before parsing. **10 tests pass** |
| GST invoice foundation             | **NOT STARTED**           | No `Invoice` model. Blocked by A-005                                                                                        |
| Booking confirmation & voucher     | **NOT STARTED**           | No `Voucher` model                                                                                                          |
| Cancellation / refund / reschedule | **NOT STARTED**           | No `Refund` model. Blocked by A-004                                                                                         |
| Platform commission                | **NOT STARTED**           | No `Commission` model. Blocked by A-003                                                                                     |
| Host payout ledger                 | **NOT STARTED**           | No `Payout`/`Ledger` model                                                                                                  |
| Payment reconciliation             | **NOT STARTED**           | —                                                                                                                           |
| Transaction audit trail            | **FOUNDATION EXISTS**     | Generic `AuditLog` model exists; no payment-specific trail                                                                  |

**No financial arithmetic exists anywhere.** `experiences.base_price_minor`
holds the host's list price only — no fee, tax, commission or payout is stored
or derived. This is the correct posture while A-003/004/005 are open: each
determines column structure for money-holding records.

**Buildable now, blocked by nothing:** availability and slots (FR-08), cart
structure, booking state machine skeleton, voucher generation.
**Blocked:** anything computing an amount.

---

## 8. Infrastructure & production readiness

| Area                    | State                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Deployment config / IaC | **NONE** — no Terraform, CDK, SST, `vercel.json`, serverless or app Dockerfile         |
| Environment separation  | Zod-validated env split build-safe vs runtime (ADR-0009); only local exists            |
| Database                | Local Docker only. **Container was stopped at audit time**; not started (no approval)  |
| Migrations              | 5 migrations; CI applies them to a clean database                                      |
| Email provider          | Code ready; provider unconfirmed (§6)                                                  |
| Error monitoring        | **NONE** — `SENTRY_DSN` unset                                                          |
| Product analytics       | **NONE** — PostHog adapter is an 11-line stub, `POSTHOG_KEY` unset                     |
| Backup / recovery       | No runbook found                                                                       |
| CI                      | 3 jobs defined. **Has not run against current work** — nothing pushed since 2026-08-25 |
| Production deployment   | **Never happened**                                                                     |

---

## 9. Tests executed in this audit

All non-destructive. No database started.

| Command                                                          | Result                            |
| ---------------------------------------------------------------- | --------------------------------- |
| `npm run test`                                                   | ✅ **29 files, 409 tests passed** |
| `npx tsc --noEmit`                                               | ✅ PASS                           |
| `npm run lint`                                                   | ✅ PASS                           |
| `npx vitest run tests/unit/razorpay-webhook.test.ts`             | ✅ 10 passed                      |
| `npx vitest run operations-review + authorization + permissions` | ✅ 62 passed                      |
| `npx vitest run` ×4 email suites                                 | ✅ 58 passed                      |

**Not executed:** `npm run test:integration` (~190 tests) — requires the stopped
database; starting it needs approval. Also `db:verify`, `db:migrate`, worker.

### Verification gaps

| Finding type                 | Status                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed by code            | Phases 0–5, 7, 10, 11 implementation claims                                                                                                                                                                           |
| Confirmed by automated tests | 409 unit tests; auth, ops, email, webhook, discovery logic                                                                                                                                                            |
| **Confirmed by runtime**     | **Partial.** On 2026-10-20 the app ran: all routes returned expected status, DB health 4ms, 3 live experiences served, full token set delivered. **Not running now** (Docker down, port 3000 held by another process) |
| **Confirmed by browser**     | **NONE.** The application has never been visually inspected. Extension would not connect                                                                                                                              |
| Documented but unverified    | 190 integration tests; responsive behaviour; `prefers-reduced-motion`; real email delivery                                                                                                                            |
| Contradicted by evidence     | `<title>` third brand line; `--lv-accent-ink` comment claims AA pass but measures 3.52:1                                                                                                                              |

---

## 10. Current stopping point

**Phase 5 complete; Phase 6 declared but not begun.**

- Last commit `aeff6d7`, 2026-08-25, level with `origin/main`
- **120 uncommitted paths** — roughly eight weeks of work never committed, pushed or CI-validated
- Last documented milestone: approved visual identity, 2026-09-08
- Identity conflict resolved 2026-10-20 (forest green + ivory retained)

**Why work stopped is UNKNOWN** — no evidence in repository, logs or documents.
Not inferred here.

---

## 11. Recommended next engineering milestone

**Availability and slots (FR-08).**

- It is the first buildable piece of Phase 6 and **depends on none of the
  pending founder decisions** — it stores _when an experience runs_, not what it
  costs.
- Phase 4 is incomplete without it, so it closes an existing gap too.
- Booking cannot be built on top of anything else first.
- It touches no money column, so A-003/004/005 cannot invalidate it.

**Before starting**, two cheap, unblocked actions: commit and push the 120 paths
so CI finally validates them, and open the application in a browser — four
consecutive milestones produced defects found only that way.
