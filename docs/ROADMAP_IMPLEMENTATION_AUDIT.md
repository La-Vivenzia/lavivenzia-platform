# Roadmap vs Implementation Audit

**Date:** 2026-11-05
**Supersedes:** the 2026-10-20 edition of this document
**Repository:** `D:\LA  VIVENZIA\lavivenziaSAAS` (branch `main`, HEAD `c01ac89`, level with `origin/main`)
**Brief:** `specs/PROJECT_AUDIT_SPEC.md`
**Type:** Audit only. No application code, configuration, schema or
infrastructure was changed. Only this file and
`docs/FOUNDER_DECISIONS_AND_BLOCKERS.md` were edited.

---

## 1. Executive summary

In the 16 days since the last audit the repository went from **409 to 953 unit
tests** and from "Phase 6 not started" to an **end-to-end interactive product**:
availability slots, a traveller booking panel with server-verified demo and
Razorpay **test-mode** checkout, a deterministic itinerary engine, curated trip
bundles, a concierge, a Google Places (New) adapter with fallback, and a FinOps
metering engine. All work is committed and pushed; the 120 uncommitted paths
flagged on 2026-10-20 are gone.

**Gate status today (run in this audit, not inferred):**

| Check                                   | Result                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `npm test`                              | ✅ **48 files, 953 / 953 passed**, 0 failed, 0 skipped (≈8 s)                   |
| `npm run typecheck`                     | ✅ PASS                                                                         |
| `npm run lint`                          | ✅ PASS                                                                         |
| `npm run build` (Next.js 16.3.1)        | ✅ PASS — 41 API route handlers                                                 |
| `npm run format:check`                  | ❌ **FAIL** — `specs/FINOPS_METERING_SPEC.md`, `specs/PROJECT_AUDIT_SPEC.md`    |
| `npm run verify` (CI's first job)       | ❌ **would fail** at `format:check` — see §9.1                                  |
| `npm run test:integration` (~190 tests) | ⚠️ **NOT RUN** — Docker daemon not running; no database available to this audit |
| Browser / visual inspection             | ⚠️ **NOT DONE** — still no visual-regression or E2E infrastructure              |

**The headline finding.** The product _looks_ bookable but **is not
transactional**. There is still **no `Booking`, `Payment`, `Voucher` or
`Ledger` table** (14 Prisma models, 6 migrations — the newest is slots,
2026-10-20). Checkout is a signed, stateless 30-minute token (ADR-0016);
`reservedCount` is never incremented, so **no seat is ever held**, and live
Razorpay keys are refused in code. This is correct and deliberate — but it means
the Pune pilot **cannot take a real booking today**, and that is the single
largest gap between the codebase and pilot go-live.

**Three further pilot-critical findings** (detail in §5 and §9):

1. **The pilot seed creates no availability.** `scripts/seed-pune-pilot.ts`
   publishes 16 listings but writes **zero `ExperienceSlot` rows**, and the host
   UI that creates slots now redirects off-site to `host.lavivenzia.com`. In a
   freshly seeded database **no pilot listing is bookable** even in demo mode.
2. **Viman Nagar has no coverage.** 0 listings, 0 concierge hotspots, 0 mentions
   anywhere in `src/`. Four of the five named pilot locations are covered.
3. **TLS certificate verification is disabled** in the database path:
   `rejectUnauthorized: false` for Supabase in `src/lib/db.ts:23`, and
   `NODE_TLS_REJECT_UNAUTHORIZED = "0"` at the top of `prisma/seed.ts`,
   `scripts/seed-pune-pilot.ts`, `scripts/verify-database.ts` and in
   `.env.local` — the latter makes the warning appear during `next build`.

**Newly built since 2026-10-20 (verified in source and tests):**

| Capability                             | Evidence                                                                                                      | Tests |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----- |
| FinOps API metering                    | `src/modules/metering/{rates,service,types}.ts` (568 lines); `GET/POST /api/v1/ops/metering`                  | 77    |
| AI itinerary synthesis (deterministic) | `src/modules/itinerary/{generator,service,types}.ts` (993 lines); `POST /api/v1/itinerary/generate`           | 33    |
| Google Places API (New)                | `src/adapters/maps/google/index.ts` (346 lines), `places:autocomplete` + `places/{id}`, field masks, timeouts | 35    |
| Availability slots (FR-08)             | `ExperienceSlot` model + 4 CHECK constraints; `src/modules/availability/` (479 lines)                         | 46    |
| Booking panel + checkout               | `src/modules/booking/` (934 lines); `…/checkout`, `…/checkout/confirm`, `…/slots`                             | 102   |
| Concierge                              | `src/modules/concierge/` (1,300 lines); `GET /api/v1/concierge`                                               | 71    |
| Copilot (LLM-optional)                 | `src/modules/copilot/` (701 lines); `POST /api/v1/copilot`                                                    | 32    |
| Trip architect + simulated booking     | `src/modules/trips/` (695 lines); `/trips/architect`; `POST /api/v1/trips/simulate-book`                      | 27    |
| Mood journeys / archetypes             | `src/modules/journeys/` (490 lines); `GET /api/v1/journeys`                                                   | 19    |
| Live map tracker                       | `src/components/map/live-map-tracking.ts` — keyless OSM tiles, road route with straight-line fallback         | 36    |
| Resend email transport                 | `src/adapters/email/resend/index.ts` (273 lines), metered                                                     | 17    |
| R2 / S3 media storage                  | `src/adapters/storage/s3/index.ts` (265 lines)                                                                | 29    |

---

## 2. Repository identity and history

Main consumer SaaS, not the CRM. `package.json` name `lavivenzia`, Next.js
16.3.1, React 19.2, Prisma 7.9, Zod 4, Node ≥ 22.12.

| Measure                        | 2026-10-20 | 2026-11-05                                                  |
| ------------------------------ | ---------- | ----------------------------------------------------------- |
| Commits on `main`              | 8          | 40                                                          |
| Unit test files / tests        | 29 / 409   | 48 / 953                                                    |
| Integration test files         | 8          | 8 (unchanged; none for slots, booking, metering, itinerary) |
| Prisma models / migrations     | 13 / 5     | 14 / 6                                                      |
| API route handlers             | —          | 41                                                          |
| Domain modules (`src/modules`) | 8          | 16                                                          |
| ADRs                           | 15         | 16                                                          |
| Uncommitted paths              | 120        | 1 (`specs/PROJECT_AUDIT_SPEC.md`, untracked)                |

Recent milestones (from `git log`):

| Date       | Commit    | Milestone                                                    |
| ---------- | --------- | ------------------------------------------------------------ |
| 2026-10-21 | `f2a27c8` | Approved identity, discovery, Resend, availability slots, R2 |
| 2026-10-22 | `c1cd000` | Amanora/Magarpatta pilot seed                                |
| 2026-10-22 | `c03f3ab` | Copilot service + API                                        |
| 2026-10-27 | `c2e4e65` | Supabase Postgres SSL, production invariants                 |
| 2026-10-28 | `b828974` | Booking flow with Razorpay checkout + confirmation voucher   |
| 2026-10-30 | `d3fc5a6` | Maps provider fallback + embed                               |
| 2026-10-30 | `c42203d` | Trip architect, simulated booking, master timeline           |
| 2026-10-30 | `c498896` | WhatsApp Trip Butler deep-link                               |
| 2026-11-01 | `280b905` | Host management decoupled → host portal redirect             |
| 2026-11-01 | `e6b2e8f` | Phase 8 & 9 itinerary synthesis engine                       |
| 2026-11-02 | `5b4cbad` | Assistant and palette toggles removed from UI                |
| 2026-11-05 | `c01ac89` | FinOps metering engine                                       |

---

## 3. Phase status — 0 to 12

Status vocabulary: **COMPLETE AND VERIFIED** (code + tests + runtime/browser) ·
**IMPLEMENTED, VERIFICATION INCOMPLETE** (code + unit tests, never seen in a
browser or against a live provider) · **PARTIAL** · **SIMULATED** (UI and
contract exist, nothing real happens by design) · **NOT STARTED**.

| Phase | Name (spec)                       | Status                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | --------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Foundations                       | **COMPLETE AND VERIFIED**                   | Hexagonal layering lint-enforced (`eslint.config.mjs`); `src/ports/*` (7 ports) with adapters behind each; Zod env split (`src/lib/env.ts`, ADR-0009); startup invariants in `src/instrumentation.ts`; 953 tests run with no external service. Tokens in `src/app/globals.css` (forest green/ivory/gold — ADR-0015)                                                                                                                                                                                                                |
| 1     | Public website & shell            | **IMPLEMENTED, VERIFICATION INCOMPLETE**    | `src/app/(site)/*`, `src/components/layout`; dark-mode toggle restored in `feeaa9b`, palette switch and floating widgets removed in `5b4cbad`. **Never visually verified**; WCAG AA defect on `--lv-accent-ink`/`--lv-fg-subtle` still open (`VISUAL_IDENTITY_DECISION.md` §7.1)                                                                                                                                                                                                                                                   |
| 2     | Experience discovery              | **IMPLEMENTED, VERIFICATION INCOMPLETE**    | `src/modules/discovery/` (573 lines), `src/adapters/persistence/prisma/discovery-repositories.ts` (771 lines, PostGIS + trigram); pilot catalogue `src/data/pune-pilot.ts` (16 listings); offline fallback `pilot-discovery-fallback.ts` (dev only, never production). Places autocomplete/resolve routes. Curated collections (FR-01) still absent                                                                                                                                                                                |
| 3     | Authentication & roles            | **PARTIAL**                                 | 8 `/api/v1/auth/*` routes; OTP, argon2id, TOTP MFA, hashed sessions, RBAC (`src/modules/auth/permissions.ts`); `/join` traveller flow (`src/lib/traveller-join.ts`). **No traveller profile model, no wishlist persistence** (`FavouriteButton` is UI-only), **no Google OAuth** (`GOOGLE_CLIENT_ID` set locally but referenced nowhere in `src/`), no password reset, no MFA recovery (A-012)                                                                                                                                     |
| 4     | Host management & publishing      | **IMPLEMENTED — UI MOVED OUT**              | Host API intact: 9 `/api/v1/host/*` routes incl. slot CRUD; lifecycle `src/modules/experiences/lifecycle.ts`. **Every `/host/*` and `/become-a-host` page now 307-redirects to `https://host.lavivenzia.com`** (`next.config.ts:46–72`); that portal is **not in this repository** and its state is unverifiable here. KYC documents (A-011) not built                                                                                                                                                                             |
| 5     | Search & proximity                | **IMPLEMENTED, VERIFICATION INCOMPLETE**    | `ST_DWithin`/`ST_Distance` + trigram in discovery repository; `src/modules/discovery/geo.ts`; Google adapter (New API) + `FallbackMapsAdapter` + catalogue provider; keyless OSM map embed. `GOOGLE_MAPS_API_KEY` **is now set locally** (name only checked) — no evidence in repo of a live call result. Semantic/vector search: still 0 vector columns (A-006)                                                                                                                                                                   |
| 6     | Bookings & checkout               | **PARTIAL — NOT TRANSACTIONAL**             | **Built:** `ExperienceSlot` + DB-enforced capacity CHECKs; host slot API; public bookable-slot API; guest-limit rules (`booking/guests.ts`); pricing `quoteBooking` in integer paise (`booking/pricing.ts`); signed-intent checkout + server-side Razorpay signature verification (`booking/checkout.ts`); `RazorpayAdapter.createOrder` + `verifyCheckoutSignature` + `verifyWebhook` implemented; on-screen voucher. **Missing:** Booking/Payment/Voucher tables, seat hold, webhook route, refunds, invoices, live mode. See §6 |
| 7     | Admin & operations console        | **IMPLEMENTED, VERIFICATION INCOMPLETE**    | 8 `/api/v1/ops/*` routes; `src/modules/operations/` with `authorize()` + audit log on every decision; `/ops`, `/ops/experiences`, `/ops/hosts` pages. **No ops visibility of slots or bookings** (none exist), **no metering dashboard page** (API only)                                                                                                                                                                                                                                                                           |
| 8     | AI discovery (copilot)            | **IMPLEMENTED — DETERMINISTIC; LLM ABSENT** | `src/modules/copilot/service.ts` ranks via the discovery port (published listings only) and optionally enriches rationale with an LLM inside a 4 s timeout, discarding unknown ids. **`AnthropicLlmAdapter.generateStructured` still throws `NotImplementedError`** (`src/adapters/llm/anthropic/index.ts:57`); copilot degrades to deterministic text. Embeddings adapter: 26-line stub                                                                                                                                           |
| 9     | Itinerary engine & trip architect | **IMPLEMENTED — STATIC CATALOGUE**          | Deterministic, pruned exhaustive scheduler with chronology self-check (`itinerary/generator.ts`); `ItinerarySynthesizer` + `TripArchitectView` on `/trips/architect`; 3 curated trips (`trips/data.ts`). **Reads `PILOT_EXPERIENCES` from source, not PostgreSQL** — see §9.4. Trip booking is **SIMULATED** (`trips/simulate.ts`: no provider, no row, `chargedMinor: 0`)                                                                                                                                                         |
| 10    | FinOps metering & observability   | **PARTIAL**                                 | Metering: complete as specified (§7). Observability: **unchanged since October** — PostHog adapter 11-line stub, no Sentry SDK, `SENTRY_DSN`/`POSTHOG_KEY` unset; pino logs with correlation IDs go only to stdout. Transactional email: Resend + SES adapters; `EMAIL_TRANSPORT=resend` locally — **no delivery evidence in the repository**                                                                                                                                                                                      |
| 11    | Scale, intermediate host SaaS     | **NOT STARTED (in this repo)**              | Host SaaS moved to the external host portal. No QR voucher validation endpoint, no redemption model, no multi-tenant concerns                                                                                                                                                                                                                                                                                                                                                                                                      |
| 12    | Live companion & production       | **NOT STARTED**                             | WhatsApp: a `https://api.whatsapp.com/send?text=…` share link only (`TripArchitectView.tsx:506`) — no Cloud API adapter, no webhook, no bot. Twenty CRM: 0 references. **No deploy config** (no app Dockerfile, `vercel.json`, Railway/Fly/Render config, IaC). CI exists (`.github/workflows/ci.yml`, 2 jobs)                                                                                                                                                                                                                     |

**Totals:** 1 complete-and-verified · 4 implemented-unverified · 3 implemented
with a material qualifier (4, 8, 9) · 3 partial (3, 6, 10) · 2 not started
(11, 12).

> **Phase numbering note.** The audit brief uses a Phase 0–12 scheme that
> differs from the master table in `PROJECT_STATE.md` (where 10 is "CRM &
> Notifications", 11 "Analytics, Security & Hardening", 12 "Integration, QA &
> Production"). This table follows the brief. The underlying evidence is the
> same either way.

---

## 4. Module inventory

| Module (`src/modules/…`) | Lines | Persistence           | Unit tests         | Integration tests      |
| ------------------------ | ----- | --------------------- | ------------------ | ---------------------- |
| `auth`                   | 1,577 | PostgreSQL            | 108 across 8 files | ✅ `auth-flows`        |
| `discovery`              | 573   | PostgreSQL + fallback | 70                 | ✅ `discovery`         |
| `experiences`            | 940   | PostgreSQL            | 34                 | ✅ `host-inventory`    |
| `hosts`                  | 383   | PostgreSQL            | 11                 | ✅ `host-inventory`    |
| `operations`             | 606   | PostgreSQL            | 29                 | ✅ `operations-review` |
| `availability`           | 479   | PostgreSQL            | 46                 | ❌ none                |
| `booking`                | 934   | **none** (stateless)  | 102                | ❌ none                |
| `metering`               | 568   | **process memory**    | 77                 | n/a                    |
| `itinerary`              | 993   | **static source**     | 33                 | n/a                    |
| `concierge`              | 1,300 | **static source**     | 71                 | n/a                    |
| `trips`                  | 695   | **static source**     | 27                 | n/a                    |
| `journeys`               | 490   | **static source**     | 19                 | n/a                    |
| `copilot`                | 701   | via discovery port    | 32                 | n/a                    |
| `media`                  | 130   | S3/R2 or local        | 18 (+29 adapter)   | —                      |
| `notifications`          | 139   | —                     | 11                 | ✅ `email-delivery`    |
| `shared`                 | 52    | —                     | indirect           | —                      |

**Five of sixteen modules read the catalogue from TypeScript source rather
than the database.** That is fine for a demo and is honest about it in code
comments, but it is the main structural risk for a live pilot (§9.4).

### Adapters

| Port         | Adapter(s)                                | State                                                                                                                                                                |
| ------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments`   | `razorpay` (230 lines)                    | `createOrder`, `verifyCheckoutSignature`, `verifyWebhook` real; 8 s timeout; `fetchPayment` still `NotImplementedError` (line 189 — reconciliation). **Not metered** |
| `maps`       | `google` (346), `local` (171), `fallback` | Real; metered (`places.autocomplete`, `places.details`)                                                                                                              |
| `email`      | `resend` (273), `ses` (257), `console`    | Real; Resend metered                                                                                                                                                 |
| `llm`        | `anthropic` (88)                          | **Stub** — `generateStructured` throws; `recordUsage` metering ready                                                                                                 |
| `embeddings` | index (26)                                | Stub                                                                                                                                                                 |
| `storage`    | `s3` (265, R2-compatible), `local` (110)  | Real                                                                                                                                                                 |
| `analytics`  | `posthog` (11)                            | Stub                                                                                                                                                                 |

---

## 5. Pune Pilot MVP readiness

### 5.1 Location coverage

Counted from `addressLine` in `src/data/pune-pilot.ts` (16 listings) and
`HOTSPOTS` in `src/modules/concierge/options.ts`.

| Pilot location       | Listings                                                                   | Concierge hotspot      | Status             |
| -------------------- | -------------------------------------------------------------------------- | ---------------------- | ------------------ |
| Amanora              | 6                                                                          | ✅ `amanora`           | ✅ Covered         |
| Seasons Mall         | 6                                                                          | ✅ `seasons`           | ✅ Covered         |
| Magarpatta Cybercity | 2 standalone (+ the 6 Seasons Mall listings, which sit in Magarpatta City) | ✅ `magarpatta`        | ✅ Covered         |
| Hadapsar             | 2 standalone (14 of 16 addresses name Hadapsar)                            | ❌ (covered by radius) | ✅ Covered         |
| **Viman Nagar**      | **0**                                                                      | **❌**                 | **❌ NOT COVERED** |

Viman Nagar is ~8 km north of Magarpatta. It sits inside the concierge's 25 km
`PILOT_AREA_METRES`, so a traveller there is _accepted_ — and then shown East
Pune listings only. Copy in `PILOT_HOST.about` and the seed header names
Amanora, Seasons Mall and Magarpatta only.

### 5.2 Data seed

| Item                   | State                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listings               | 16, upserted by slug — idempotent                                                                                                                                      |
| Content per listing    | Title, summary, description, category, address, postcode, lat/lng, duration, min/max guests, price (paise), unit, inclusions, exclusions, notes, cover image, alt text |
| Languages              | `en`, `hi`, `mr`                                                                                                                                                       |
| Status                 | Written directly as `PUBLISHED` with `publishedAt = now()` — **bypasses the review lifecycle and writes no audit-log entry**                                           |
| **Availability slots** | **None written.** No pilot listing is bookable after a fresh seed                                                                                                      |
| Venue prices           | Hard-coded in source; **no evidence of venue sign-off** on price, duration or capacity                                                                                 |
| Cover images           | Storage keys only; image rights not evidenced in repo                                                                                                                  |
| TLS                    | Script sets `NODE_TLS_REJECT_UNAUTHORIZED = "0"` process-wide (line 1)                                                                                                 |

### 5.3 Hostless curation model (`PILOT_HOST`)

`PILOT_HOST` is a single `COMPANY` host, "La Vivenzia Pune Curations"
(`pune.pilot.host@lavivenzia.com`), force-set to `VERIFIED` on every seed run.
All 16 listings belong to it. This is a sound pilot model — La Vivenzia is the
merchant of record and the venue is a supplier — but it has three consequences
that the code does not yet handle:

1. **Fulfilment.** The named venues (Smaaash, Timezone, Effingut, Cinépolis,
   Absolute Barbecues, O2 Spa, Third Wave Coffee, etc.) are third-party
   businesses. Nothing in the repository records an agreement with any of them,
   nor a channel by which a booking reaches the venue.
2. **Slot management.** The only in-repo way to create slots is the host API
   under the pilot host's session. Signing in as that host needs OTP email to
   `pune.pilot.host@lavivenzia.com`. The host UI is now off-site. **There is no
   ops-side slot tool and no seed for slots.**
3. **Redemption.** Venue staff have no way to check a voucher (§8.3).

### 5.4 Pilot readiness scorecard

| Capability a pilot traveller needs       | Ready?        | Gap                                                                  |
| ---------------------------------------- | ------------- | -------------------------------------------------------------------- |
| Browse and search East Pune listings     | ✅ Code       | Browser verification                                                 |
| See a listing on a map, get directions   | ✅ Code       | Keyless OSM + Google Maps link; Google key now present locally       |
| Plan an evening (itinerary / concierge)  | ✅ Code       | Static catalogue (§9.4)                                              |
| Sign in                                  | ⚠️            | Depends on real email delivery — unevidenced                         |
| Pick a date and time                     | ❌ Data       | No slots seeded                                                      |
| Pay real money                           | ❌            | Live mode blocked by design; Razorpay live account; no Payment table |
| Hold a seat                              | ❌            | `reservedCount` never written                                        |
| Receive a booking email / stored voucher | ❌            | No Booking table; confirmation exists only in the browser            |
| Present a voucher the venue can validate | ❌            | No redemption endpoint or app                                        |
| Cancel / get a refund                    | ❌            | A-004 undecided; no Refund flow                                      |
| Receive a GST-compliant invoice          | ❌            | A-005 undecided                                                      |
| Get help on WhatsApp                     | ❌            | Share link only                                                      |
| Ops sees what was booked                 | ❌            | Nothing to see                                                       |
| Production failure is noticed            | ❌            | No error monitoring                                                  |
| App is deployed                          | ❌ Unverified | No deploy config in repo; Supabase is evidently used for the DB      |

**Verdict:** the Pune pilot is **demo-ready, not transaction-ready**. It can
be shown to investors, venues and test users today in `demo` or `razorpay_test`
mode (once slots exist). It cannot take a real booking.

---

## 6. Phase 6 — requirement by requirement

| Requirement                        | 2026-10-20   | 2026-11-05                     | Evidence                                                                                                             |
| ---------------------------------- | ------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Availability validation            | NOT STARTED  | ✅ **IMPLEMENTED**             | `availability/rules.ts` (217) — overlap, cut-off, past-slot, capacity-below-reserved                                 |
| Slot inventory                     | NOT STARTED  | ✅ **IMPLEMENTED**             | `ExperienceSlot`; CHECKs `capacity_positive`, `reserved_within_capacity`, `ends_after_starts`, `cutoff_not_negative` |
| Seat reservation / hold            | NOT STARTED  | ❌ **NOT STARTED**             | `reservedCount` has no writer; ADR-0016 "two people can confirm the last seat"                                       |
| Guest limits                       | NOT STARTED  | ✅ **IMPLEMENTED**             | `booking/guests.ts` — min, max, seats remaining                                                                      |
| Pricing engine                     | NOT STARTED  | ⚠️ **BASE ONLY**               | `booking/pricing.ts` — price × guests or per group, integer paise. **No fee, tax or commission by design**           |
| Booking record                     | NOT STARTED  | ❌ **NOT STARTED**             | No `Booking` model                                                                                                   |
| Razorpay order creation            | Stub         | ✅ **IMPLEMENTED (test keys)** | `RazorpayAdapter.createOrder`, 8 s timeout, amount/currency echo check, never retried                                |
| Checkout signature verification    | —            | ✅ **IMPLEMENTED**             | `verifyCheckoutSignature`; checked against the order id inside the signed intent                                     |
| Webhook verification               | Implemented  | ✅ Implemented, **unwired**    | `verifyWebhook` (HMAC + `timingSafeEqual`, 12 tests) — **no route consumes it**; no idempotency store                |
| Live payments                      | —            | ❌ **BLOCKED IN CODE**         | `resolveCheckoutMode` rejects non-`rzp_test_` keys; production default `off`                                         |
| Confirmation voucher               | NOT STARTED  | ⚠️ **ON-SCREEN ONLY**          | `booking-panel.tsx:567` — printable; `DEMO-`/`TEST-` reference; no QR, not stored, not emailed                       |
| Master trip voucher                | —            | ⚠️ **SIMULATED**               | `trips/simulate.ts` — QR via `uqr`; comment: "Not a credential — nothing will accept it"                             |
| GST invoice                        | NOT STARTED  | ❌ NOT STARTED (A-005)         | —                                                                                                                    |
| Cancellation / refund / reschedule | NOT STARTED  | ❌ NOT STARTED (A-004)         | —                                                                                                                    |
| Platform commission                | NOT STARTED  | ❌ NOT STARTED (A-003)         | —                                                                                                                    |
| Host / venue payout ledger         | NOT STARTED  | ❌ NOT STARTED                 | —                                                                                                                    |
| Reconciliation                     | NOT STARTED  | ❌ NOT STARTED                 | —                                                                                                                    |
| Payment audit trail                | Generic only | Generic only                   | `AuditLog` not written by checkout                                                                                   |

**Server-trust posture is correct.** The browser sends only a slot id and a
guest count; price, availability and payment success are decided on the server;
the intent is HMAC-signed with a key derived from `SESSION_SECRET`; checkout and
confirm are IP rate-limited. CLAUDE.md rule 6 ("never trust client-side payment
success") is satisfied for the scope that exists. Rule 6's second half
("process webhooks idempotently") is **not yet applicable** — there is no
webhook route.

---

## 7. FinOps metering (Phase 10) — detailed

Spec: `specs/FINOPS_METERING_SPEC.md`. Commit `c01ac89`.

| Requirement                       | Status                 | Evidence                                                                                                                                                   |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ring buffer                       | ✅                     | `DEFAULT_METERING_CAPACITY = 10_000`, `service.ts:33`                                                                                                      |
| Integer minor-unit pricing        | ✅                     | Exact rationals in BigInt, single half-up rounding (`rates.ts:98–145`)                                                                                     |
| Google Places rates               | ✅                     | autocomplete, searchText, details, photos                                                                                                                  |
| Gemini rates                      | ✅ rates only          | **No Gemini adapter exists** — nothing will ever record these                                                                                              |
| Anthropic rates                   | ✅                     | Sonnet/Haiku input/output; unknown model priced at Sonnet (over-states)                                                                                    |
| WhatsApp rates                    | ✅ rates only          | **No WhatsApp adapter exists**                                                                                                                             |
| Resend rate                       | ✅                     | Metered in `resend/index.ts:212`                                                                                                                           |
| Razorpay fee rate                 | ✅ rates only          | 2.36 % (2 % + 18 % GST) — **`RazorpayAdapter` is not instrumented**                                                                                        |
| IST period boundaries             | ✅                     | Fixed +05:30 offset, Monday weeks (`periodStart`)                                                                                                          |
| ₹5,000 budget guardrail           | ⚠️ **Alert flag only** | `budgetAlert.triggered` in the summary (`service.ts:240`). **Nothing blocks, throttles or notifies** when exceeded                                         |
| Never breaks the observed request | ✅                     | `recordUsageSafely`; `record` does no I/O and does not throw                                                                                               |
| Ops API                           | ✅                     | `GET/POST /api/v1/ops/metering`, SHA-256 digest + `timingSafeEqual` secret check; **open without a secret outside production**, fails closed in production |
| Persistence                       | ❌ by design           | Process memory: lost on restart, per-instance only. The provider invoice remains the record                                                                |
| Dashboard UI                      | ❌                     | API only; no `/ops` page                                                                                                                                   |
| FX rate                           | ⚠️                     | Fixed ₹86.00/USD (`PAISE_PER_USD`) — a budgeting baseline, not live                                                                                        |

**Interpretation for founders.** The meter is accurate arithmetic over
whatever the current server process has seen. On a multi-instance or serverless
host it will under-report, and on every deploy it resets to zero. It is a
gauge, not a guardrail. If the ₹5k cap is meant to _stop_ spend, that is
unbuilt; the provider-side quota (Google Cloud budget alerts / API quotas) is
the real control and should be configured outside the app.

---

## 8. External integrations — readiness matrix

### 8.1 Razorpay

| Item                         | State                                                                     |
| ---------------------------- | ------------------------------------------------------------------------- |
| Adapter                      | Real for orders, checkout signature and webhook signature                 |
| Test keys configured locally | **No** — `RAZORPAY_*` names absent from `.env.local`                      |
| Live merchant account        | Unknown — no evidence in repository                                       |
| Live mode in code            | **Deliberately impossible** until the Booking aggregate exists (ADR-0016) |
| Webhook endpoint             | **Not built**                                                             |

### 8.2 Meta WhatsApp Cloud API

Nothing beyond a share link. No adapter, no `WHATSAPP_*` env variables in
`env.ts` or `.env.example`, no webhook verification route, no message
templates, no bot. Metering rates exist in anticipation.

### 8.3 Voucher redemption (venue staff)

Not started. No voucher table, no signed/verifiable voucher code, no
`/redeem` endpoint, no staff role in RBAC, no scanner UI. The trip QR is
explicitly a non-credential.

### 8.4 Twenty CRM

0 references in `src/`. The metering route comment names "CRM, WhatsApp bot"
as intended _callers_ of `POST /api/v1/ops/metering`; nothing else exists. No
event outbox, no worker job, no sync. (`docs/LA-VIVENZIA-TWENTY-GAP-ANALYSIS.md`
concerns the separate CRM repository and was excluded from evidence.)

### 8.5 Google Maps Platform

Places API (New) adapter real and metered; `GOOGLE_MAPS_API_KEY` present in
`.env.local`. Embedded map uses keyless OpenStreetMap tiles, so no
browser-published Google key is required. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is
declared in `.env.example` but not set.

### 8.6 Email

`EMAIL_TRANSPORT=resend` and `RESEND_API_KEY`/`EMAIL_FROM` are set in
`.env.local` (names only checked). That is a change from October (SES/AWS was
the plan). **The repository still holds no evidence of a delivered message** —
no message id, log or test record. `PROJECT_STATE.md` still says "no real email
has been sent". Founder to confirm.

### 8.7 Database hosting

Supabase is in use (`.env.supabase` present, `db.ts` special-cases
`supabase.co`, `next.config.ts` allows Supabase storage). Supabase MCP access
from this audit session failed authentication, so the hosted database state
(migrations applied, seed run, slots present) **could not be inspected**.

---

## 9. Engineering findings

### 9.1 CI would fail today — LOW effort, HIGH visibility

`ci.yml` runs `format:check` first. `specs/FINOPS_METERING_SPEC.md` (committed
in `c01ac89`) is not Prettier-formatted, so **the CI run for HEAD fails before
reaching tests**. `specs/PROJECT_AUDIT_SPEC.md` (untracked) would fail it too
once committed. Fix: `npx prettier --write specs/`. Not applied here because the
brief restricts edits to the two audit documents.

### 9.2 TLS verification disabled — HIGH

| Location                       | What it does                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db.ts:23`             | `ssl: { rejectUnauthorized: false }` for any `supabase.co` URL — **runtime, including production**                                        |
| `prisma/seed.ts:1, :45`        | Global `NODE_TLS_REJECT_UNAUTHORIZED = "0"` + same SSL override                                                                           |
| `scripts/seed-pune-pilot.ts:1` | Global `NODE_TLS_REJECT_UNAUTHORIZED = "0"`                                                                                               |
| `scripts/verify-database.ts:1` | Global `NODE_TLS_REJECT_UNAUTHORIZED = "0"`                                                                                               |
| `.env.local`                   | `NODE_TLS_REJECT_UNAUTHORIZED` set — disables verification for **every** HTTPS call in `next dev`/`next build` (Razorpay, Google, Resend) |

The production path encrypts but does not authenticate the database server,
leaving it open to interception. Supabase publishes a CA certificate; the fix
is to pin it (`ssl: { ca }`) and delete the global overrides.

### 9.3 Pilot listings have no slots — HIGH (pilot blocker)

See §5.2–5.3. Needs either a slot seed (deterministic recurring schedule per
listing) or an ops-side slot tool. Engineering-only; no founder decision needed
beyond confirming each venue's operating hours and capacity.

### 9.4 Static catalogue in five modules — MEDIUM

`itinerary`, `concierge`, `trips`, `journeys` (and the offline fallback) import
`PILOT_EXPERIENCES` directly. Consequences in a live pilot:

- An ops **suspension** or **unpublish** in the database does not remove the
  listing from itineraries, concierge results, trips or journeys.
- A **price change** made through the host API is not reflected in
  itinerary/concierge totals — the two can disagree with the booking panel,
  which reads PostgreSQL.
- These surfaces never see availability, so they can recommend a listing with
  no bookable slot.

CLAUDE.md §7 ("AI must not invent price … availability") is respected
literally — the prices are real listing prices — but the _source_ can go
stale. Route these modules through the discovery port before pilot launch.

### 9.5 Trip "planned" lines carry indicative prices — MEDIUM

`trips/data.ts` mixes catalogue listings with `planned` lines (Mulshi villa,
Pawna domes, kayaking) priced with **indicative** figures. The code labels them
(`priceBasis: "indicative"`) and curator scores `verified: false`. Acceptable
for a simulation; must be replaced with venue quotes before anything is sold.

### 9.6 Missing rate limits on two public routes — LOW

`GET /api/v1/concierge` and `GET /api/v1/journeys` call `enforceIpRateLimit`
zero times. Both are pure in-memory computations with no provider cost, so the
exposure is CPU only. The other 8 public compute routes are limited.

### 9.7 Rate limiter fails open outside production — LOW

`src/lib/rate-limit.ts:48–52` swallows DB errors when
`NODE_ENV !== "production"`. Correct for local preview; confirm any **staging**
deployment runs with `NODE_ENV=production`.

### 9.8 Documentation drift — LOW

- `PROJECT_STATE.md` last updated 2026-11-01; does not mention metering.
- `docs/ASSUMPTIONS.md` last touched 2026-10-21; A-003/004/005/006/011/012 all
  still DEFERRED.
- ADR-0010 still reads "business logic blocked" — partly superseded by
  ADR-0016.
- `SYSTEM_DESIGN.md` **was** updated for metering.

### 9.9 Test coverage gaps — MEDIUM

No integration test exercises `ExperienceSlot` CHECK constraints, the slot API,
or checkout against a real database. Unit coverage of the same code is strong
(46 + 102 tests). Integration suite (~190 tests) not run in this audit.

### 9.10 Verified strengths

- Server-decides-everything checkout; signed intent; live keys refused.
- DB-level capacity invariants ready for the booking transaction.
- Metering is exact integer arithmetic and cannot break a request.
- Copilot LLM path bounded (4 s), schema-validated, unknown ids discarded,
  deterministic fallback.
- Production fails closed on missing `METERING_SECRET_KEY`; checkout defaults to
  `off` in production.
- Every simulation is labelled as such in the UI (`DEMO-`/`TEST-` prefixes,
  `SIMULATION_NOTICE`, "no seat is held").

---

## 10. Commands executed in this audit

All non-destructive. No database started, no network call to any provider, no
secret value read or printed (env files inspected for **variable names** only).

| Command                          | Result                                                       |
| -------------------------------- | ------------------------------------------------------------ |
| `npm test`                       | ✅ 48 files, 953 passed                                      |
| `npx vitest run --reporter=json` | ✅ 953 / 953; per-file counts used in §1 and §4              |
| `npm run typecheck`              | ✅ PASS                                                      |
| `npm run lint`                   | ✅ PASS                                                      |
| `npm run format:check`           | ❌ 2 spec files                                              |
| `npm run build`                  | ✅ PASS; TLS-disabled warnings emitted (from `.env.local`)   |
| `docker ps`                      | Daemon not running — integration tests not executed          |
| `git status` / `git log`         | Clean apart from the untracked audit spec; level with origin |

### Verification gaps

| Evidence type        | Covered                                                            |
| -------------------- | ------------------------------------------------------------------ |
| Code                 | All phases                                                         |
| Unit tests           | 953, all green                                                     |
| Integration tests    | **Not run** this audit                                             |
| Runtime              | **Not run** this audit                                             |
| Browser              | **Never** — still no visual regression or E2E tooling              |
| Live providers       | **None evidenced** (Razorpay, Google, Resend, Anthropic, WhatsApp) |
| Hosted DB (Supabase) | **Not inspectable** — MCP authentication failed                    |
| Host portal          | **Outside this repository**                                        |

---

## 11. Path to a transacting Pune pilot

In dependency order. Items 1–4 need no founder decision.

1. **Format `specs/`** so CI is green again.
2. **Pin the Supabase CA**; remove every `NODE_TLS_REJECT_UNAUTHORIZED` and
   `rejectUnauthorized: false`.
3. **Seed pilot slots** (or build an ops slot tool) from venue-confirmed hours
   and capacities.
4. **Booking aggregate**: `Booking` + `Payment` tables, pending booking + seat
   hold in one transaction (`reservedCount` increment against the existing
   CHECK), hold expiry job on pg-boss, `confirm` as a state transition,
   idempotent `POST /api/v1/payments/razorpay/webhook` using the existing
   `verifyWebhook`, stored voucher with a signed code, confirmation email.
5. **Founder inputs land** (A-003 fee, A-004 refunds, A-005 GST/TCS) → fee, tax
   and invoice lines; refund flow.
6. **Razorpay live keys** → add `live` checkout mode behind the persisted
   booking.
7. **Voucher redemption**: venue-staff role, `/redeem` endpoint, mobile scanner
   page.
8. **Read pilot surfaces from PostgreSQL** (§9.4).
9. **Sentry** + a deploy target with config in the repository.
10. **Browser pass** across the five §B.12 states before inviting real users.

WhatsApp Cloud API and Twenty CRM sync are post-pilot unless the founders make
them launch criteria.
