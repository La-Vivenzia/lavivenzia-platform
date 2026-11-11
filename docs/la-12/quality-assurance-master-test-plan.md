# LA-12 — Master Quality Assurance Test Plan

## Pune Pilot 2026 Ecosystem: Platform, Host SaaS & CRM Integration

**Document ID:** `LV-QA-LA12-PUNE-2026-V1`  
**Parent Initiative:** `LA-12` — Intermediate Host SaaS Development & Ecosystem Integration  
**Repository Scope:** `La-Vivenzia/lavivenzia-platform` (Platform Core & Schema Authority) & `La-Vivenzia/lavivenzia-host` (Host SaaS Portal)  
**Target Environment:** Pune Pilot MVP 2026 (East Pune Cluster: Koregaon Park, Kalyani Nagar, Viman Nagar)  
**Primary Database:** AWS RDS PostgreSQL 16 (Multi-AZ) / Local Docker Development  
**ORM:** Prisma 7.9.1 with `@prisma/adapter-pg`  
**Document Baseline Date:** November 10, 2026  
**Document Status:** FORMAL QA MASTER BASELINE — FINAL CONSISTENCY AUDITED (VERSION 1.3.0)

---

## A. Document Control

### 1. Document Metadata

- **Title:** Master Quality Assurance Test Plan — La Vivenzia Pune Pilot 2026
- **Initiative:** `LA-12` (Intermediate Host SaaS & Ecosystem Integration)
- **Principal Author:** Lead Fullstack SaaS Engineer & Principal QA Architect
- **Technical Reviewer & Executive Sponsor:** Karan Patil (Founder & Tech Lead, `karan.patil@lavivenzia.com`)
- **Version:** `1.3.0-FINAL-CONSISTENCY`
- **Effective Date:** November 10, 2026

### 2. Purpose & Engineering Philosophy

This Master Quality Assurance Test Plan establishes the engineering verification gates, concurrency validation protocols, security controls, and regression frameworks governing the commercial launch of the La Vivenzia Pune Pilot 2026.

> [!IMPORTANT]
> **Engineering Realism & Evidence Principle:** No software test framework can guarantee zero software crashes, zero clock drift, or total absence of customer defects. The objective of this framework is to define measurable quality objectives, enforce transactional isolation invariants, document failure boundaries, and transparently distinguish verified test evidence from unexecuted or planned capabilities.

### 3. Scope & Exclusions

- **In Scope:**
  - `lavivenzia-platform`: Customer discovery, dual pricing calculation, booking capacity engine, pessimistic row-level mutex, Razorpay order/webhook pipeline, Ed25519 digital voucher generation, and CRM onboarding ingress.
  - `lavivenzia-host`: Partner portal, listing management, calendar availability matrix, 4-stage mobile QR scanner, door attendant PIN authentication, and weekly settlement CSV export engine.
  - Multi-tenant data isolation, RBAC role hierarchy, and database transaction boundaries.
- **Out of Scope (Post-Pilot / Phase 2.5):**
  - Automated Razorpay Route linked-account disbursements (`REQ-OPS-003` — formally deferred).
  - Multi-city geo-distributed multi-region database replication (Pilot restricted strictly to Pune AWS `ap-south-1`).
  - Third-party PMS bidirectional availability sync (Opera, Cloudbeds, Sirvoy).

### 4. Source Documents Reviewed & Reconciled

1. `LV-PRD-2026-PUNE-01`: Pune Pilot Official PRD (Doc 1)
2. `LV-INTERMEDIATE-SAAS-2026-01`: Intermediate SaaS Requirements Specification (Doc 2)
3. `LV-HOST-SAAS-SPEC-2026-01`: Host SaaS Requirements & Technical Specification (Doc 3)
4. `LV-REQ-LA12-PHASE-1.6-RTM`: Requirements Traceability Matrix Baseline (37 Requirements)
5. `LV-MASTER-CONTEXT-PART-3`: Governance Decision Gates (ADR A-001 through A-007) and Seven-Step Roadmap
6. `prisma/schema.prisma` and PostgreSQL Migration `20261110140000_init_booking_and_payment_pipeline`

---

## B. Measurable Quality Objectives & Acceptance Invariants

The platform establishes measurable quality objectives across eleven critical dimensions, distinguishing the architectural invariant from current verification evidence:

1. **Functional Correctness:** Every user journey from discovery to check-in adheres strictly to verified PRD acceptance criteria.
2. **Database Referential Integrity:** Foreign key referential integrity (`ON DELETE RESTRICT`/`CASCADE`), `CHECK` constraints on capacity (`experience_slots_reserved_within_capacity`), and database-level unique constraints are enforced by the PostgreSQL schema DDL.
3. **Capacity Math Invariance:** Available seat capacity strictly follows:
   $$\text{Available Capacity} = \text{Slot Capacity} - \text{ExperienceSlot.reservedCount} - \text{Active Held Seats}$$
   _(Unit-verified across 35 test cases; empirically verified on live PostgreSQL 16 across 10 concurrency scenarios)._
4. **Concurrency Safety Objective:** Prevent inventory overselling when $N$ customers simultaneously contend for $M$ seats where $N > M$. Enforced via PostgreSQL `SELECT ... FOR UPDATE` pessimistic row locking. _(Verified across 10 live PostgreSQL 16 concurrency scenarios in `tests/integration/booking-capacity-concurrency.test.ts`)._
5. **Ledger Isolation Invariant:** $\Delta(\text{ExperienceSlot.reservedCount}) = 0$ on hold creation, expiration, or cancellation. `reservedCount` reflects committed confirmed bookings only. _(Unit-verified)._
6. **Financial Correctness:** All monetary values stored and processed strictly as integer minor units (INR paise). Zero floating-point roundoff permitted in any financial calculation. _(Unit-verified)._
7. **Security & Authorization Boundaries:** Strict multi-tenant isolation by `partnerId` (`REQ-SEC-001`); rigid 2-tier host role hierarchy (`HOST_OWNER` vs `HOST_DOOR_STAFF`, `REQ-SEC-002`); cryptographic Ed25519 signature verification on bearer vouchers (`REQ-PAY-009`). _(Planned for Steps 5 & 6)._
8. **Webhook Idempotency Objective:** Prevent duplicate credit or duplicate booking state transitions upon repeated webhook delivery via database unique constraint on `PaymentEvent.eventId` (`REQ-PAY-006`). _(Planned for Step 4)._
9. **Resilient Failure Handling:** Transaction rollback on failures _(Unit mock rollback verified; live PostgreSQL rollback verified in Scenario 7)_; dynamic query-time hold reclamation without reliance on polling cron jobs _(Unit-verified & PG Scenario 8 verified)_; graceful offline catalogue fallback _(Unit-verified)_.
10. **Performance & Latency Thresholds:** Target sub-200ms API response time for slot availability inquiries under 50 RPS; target sub-500ms database transaction duration for pessimistic row lock acquisition. _(Performance benchmarks planned for pre-release load testing)._
11. **Regression Prevention:** 100% pass rate across the baseline unit suite (49 test files, 909 tests) on every pull request. _(Verified with safe test timeout)._

---

## C. Architecture & System Boundaries

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                LA VIVENZIA ECOSYSTEM ARCHITECTURE                     │
└────────────────────────────────────────────────────────────────────────────────────────┘

     Traveller Web App                       Host Portal & Scanner             Salesforce / HubSpot
   (lavivenzia-platform)                       (lavivenzia-host)                 (lavivenzia-crm)
            │                                         │                                  │
            │ HTTP / Session                          │ HTTP / Shift Token               │ HTTPS Signed
            ▼                                         ▼                                  ▼
┌───────────────────────┐                 ┌───────────────────────┐                 ┌─────────────┐
│  Next.js 16 Web App   │                 │  Next.js 16 Host App  │                 │ External CRM│
│  - Catalogue / Browse │                 │  - Front-Desk Scanner │                 │ Lead Stages │
│  - Capacity Engine    │                 │  - Slot Scheduler     │                 └──────┬──────┘
│  - Checkout Intent    │                 │  - Booking Roster     │                        │
│  - Webhook Ingress    │                 │  - CSV Payout Export  │                        │ POST Ingress
└───────────┬───────────┘                 └───────────┬───────────┘                        ▼
            │                                         │                     ┌─────────────────────────────┐
            │        Prisma 7.9.1 Client              │                     │ Platform CRM Bridge Route   │
            │  (Connection Pool max: 10)              │                     │ /api/v1/partners/provision  │
            ▼                                         ▼                     └──────────────┬──────────────┘
┌──────────────────────────────────────────────────────────────────────────────────────────┴──────────────┐
│                                   AWS RDS PostgreSQL 16 (Multi-AZ)                                      │
│                                                                                                         │
│  - Platform is the SOLE canonical schema and migration owner.                                           │
│  - Host SaaS shares this database via generated client but NEVER executes migrations independently.     │
│  - Shared Tables: users, hosts, partner_accounts, experience_slots, bookings, payments, vouchers.       │
│  - Concurrency Mutex: SELECT id, capacity, reserved_count FROM experience_slots WHERE id = $1 FOR UPDATE│
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Architectural Tenets

1. **Repository Topology (ADR A-001):** Decoupled standalone repositories: `lavivenzia-platform` (public marketplace) and `lavivenzia-host` (host SaaS operations).
2. **Database Authority:** `lavivenzia-platform` owns the Prisma schema and database migrations. `lavivenzia-host` consumes the identical schema definition.
3. **Tenant Boundary:** Every host and partner account is strictly partitioned by `partnerId` / `hostId`.
4. **CRM Decoupling:** External CRM communicates with Platform via signed webhook (`REQ-CRM-001`). Platform maintains zero direct database linkages to CRM.

---

## D. Expanded Test Inventory Across All 10 RTM Modules

### Module 1: Catalogue & Experience Discovery

| Test Case ID | Req ID         | Test Scope & Category | Description & Input                                   | Expected Result                                          | Severity | Repo     | Step      | Current Status          |
| :----------- | :------------- | :-------------------- | :---------------------------------------------------- | :------------------------------------------------------- | :------- | :------- | :-------- | :---------------------- |
| `TC-CAT-001` | `REQ-MAIN-001` | Positive / API        | `GET /api/v1/experiences?destination=pune`            | Returns 200 OK with published experiences in East Pune   | Medium   | Platform | Discovery | **PASSED** (Unit Suite) |
| `TC-CAT-002` | `REQ-MAIN-001` | Negative / Boundary   | Query experiences with invalid negative price filters | Returns 400 Bad Request or sanitizes bounds gracefully   | Low      | Platform | Discovery | **PASSED** (Unit Suite) |
| `TC-CAT-003` | `REQ-MAIN-002` | Positive / Pricing    | Experience with `pricingUnit = 'PER_PERSON'`          | Quote multiplies unit price by guest count               | High     | Platform | Discovery | **PASSED** (Unit Suite) |
| `TC-CAT-004` | `REQ-MAIN-002` | Positive / Pricing    | Experience with `pricingUnit = 'PER_GROUP'`           | Quote applies flat unit price regardless of party size   | High     | Platform | Discovery | **PASSED** (Unit Suite) |
| `TC-CAT-005` | `REQ-MAIN-003` | Resilience / Fallback | Simulate PostgreSQL outage on catalogue browsing      | Offline fallback activates; curated pilot catalog served | High     | Platform | Discovery | **PASSED** (Unit Suite) |
| `TC-CAT-006` | `REQ-MAIN-004` | Security / Privacy    | Browse experience listing before confirmed booking    | Exact street address withheld; city/region returned      | High     | Platform | Discovery | **PASSED** (Unit Suite) |
| `TC-CAT-007` | `REQ-MAIN-004` | Security / Disclosure | Fetch experience venue after booking confirmation     | Full street address and latitude/longitude released      | High     | Platform | Discovery | **PASSED** (Unit Suite) |

---

### Module 2: Capacity, Availability & Hold

| Test Case ID | Req ID        | Test Scope & Category       | Description & Input                                                    | Expected Result                                                   | Severity     | Repo     | Step   | Current Status                  |
| :----------- | :------------ | :-------------------------- | :--------------------------------------------------------------------- | :---------------------------------------------------------------- | :----------- | :------- | :----- | :------------------------------ |
| `TC-CAP-001` | `REQ-MVP-001` | Positive / UI               | Select date, time slot, and guest count on booking panel               | Panel previews pricing and enables Reserve button                 | Medium       | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-002` | `REQ-MVP-002` | Positive / Hold             | Request hold for 2 guests on available slot                            | Booking created with status `HELD`, `heldUntil = now + 5m`        | **Critical** | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-003` | `REQ-MVP-002` | Invariant / Ledger          | Inspect `ExperienceSlot.reservedCount` after hold creation             | `reservedCount` is completely unchanged ($\Delta = 0$)            | **Critical** | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-004` | `REQ-MVP-003` | Concurrency / Mutex         | 10 concurrent requests for 1 seat each on slot capacity 5              | Exactly 5 succeed (201), 5 fail (409 Conflict); 0 oversell        | **Critical** | Platform | Step 2 | **PASSED** (PG Scenario 1)      |
| `TC-CAP-005` | `REQ-MVP-003` | Concurrency / Mutex         | 2 concurrent requests for 6 seats each on slot capacity 10             | Exactly 1 succeeds, 1 rejected with `ConflictError`               | **Critical** | Platform | Step 2 | **PASSED** (PG Scenario 2)      |
| `TC-CAP-006` | `REQ-MVP-003` | Concurrency / Mutex         | 20 concurrent requests for 2 seats each on slot capacity 10            | Exactly 5 succeed, 15 rejected; active holds = 10                 | **Critical** | Platform | Step 2 | **PASSED** (PG Scenario 4)      |
| `TC-CAP-007` | `REQ-MVP-003` | Concurrency / Stress        | 100 concurrent requests for 1 seat on slot capacity 10                 | Exactly 10 succeed, 90 rejected; zero lock leaks                  | **Critical** | Platform | Step 2 | **PASSED** (PG Scenario 5)      |
| `TC-CAP-008` | `REQ-MVP-004` | Boundary / Expiry           | Query available capacity when prior hold has `heldUntil <= now`        | Expired hold excluded at query time; capacity freed immediately   | **Critical** | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-009` | `REQ-MVP-004` | Boundary / Staggered        | Multiple holds expiring at $T+1\text{m}$, $T+3\text{m}$, $T+5\text{m}$ | Capacity progressively reclaims at each milestone                 | **Critical** | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-010` | `REQ-MVP-003` | Rollback / Unit Mock        | Transaction error midway through hold creation in mock repository      | Entire transaction rolls back; 0 orphan bookings/items            | **Critical** | Platform | Step 2 | **PASSED (Unit Mock Rollback)** |
| `TC-CAP-011` | `REQ-MVP-002` | Validation / Zero           | Request reservation with `guests = 0`                                  | Rejected with 400 Bad Request (`VALIDATION_FAILED`)               | High         | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-012` | `REQ-MVP-002` | Validation / Negative       | Request reservation with `guests = -2`                                 | Rejected with 400 Bad Request (`VALIDATION_FAILED`)               | High         | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-013` | `REQ-MVP-002` | Validation / Decimal        | Request reservation with non-integer `guests = 2.5`                    | Rejected with 400 Bad Request (`VALIDATION_FAILED`)               | High         | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-014` | `REQ-MVP-003` | Boundary / Exact Fit        | Request exactly remaining capacity (e.g. 10 of 10 seats)               | 201 Created; available capacity becomes 0                         | **Critical** | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-015` | `REQ-MVP-003` | Boundary / Overcapacity     | Request 1 seat above remaining capacity (11 of 10 seats)               | Rejected with 409 Conflict (`CONFLICT`)                           | **Critical** | Platform | Step 2 | **PASSED** (Unit Suite)         |
| `TC-CAP-016` | `REQ-MVP-003` | Concurrency / Multi-User    | Multiple independent customer accounts reserve simultaneously          | Serialization orders requests; zero cross-account leakage         | **Critical** | Platform | Step 2 | **PASSED** (PG Scenario 3 & 9)  |
| `TC-CAP-017` | `REQ-MVP-003` | Rollback / Real PG          | Abort PostgreSQL transaction during concurrent insert                  | Database rolls back completely; zero partial rows in PostgreSQL   | **Critical** | Platform | Step 2 | **PASSED** (PG Scenario 7)      |
| `TC-CAP-018` | `REQ-MVP-003` | Isolation / Multi-Slot      | Concurrent reservations against Slot A and Slot B                      | Slot A transactions execute independently without blocking Slot B | High         | Platform | Step 2 | **PASSED** (PG Scenario 6)      |
| `TC-CAP-019` | `REQ-MVP-002` | Boundary / Integer Overflow | Request with `guests = Number.MAX_SAFE_INTEGER`                        | Rejected gracefully with 400 Bad Request                          | Medium       | Platform | Step 2 | **PASSED** (Unit Suite)         |

---

### Module 3: Dual Checkout & Payment Engine

| Test Case ID | Req ID        | Test Scope & Category       | Description & Input                                               | Expected Result                                                | Severity     | Repo     | Step   | Current Status          |
| :----------- | :------------ | :-------------------------- | :---------------------------------------------------------------- | :------------------------------------------------------------- | :----------- | :------- | :----- | :---------------------- |
| `TC-PAY-001` | `REQ-PAY-001` | Financial / Math            | Quote calculation across per-person and per-group items           | Result strictly in integer paise (`totalMinor`), zero floats   | **Critical** | Platform | Step 3 | **PASSED** (Unit Suite) |
| `TC-PAY-002` | `REQ-PAY-002` | Security / Demo Mode        | Demo checkout execution in production environment                 | Refused unless `ROLE_ADMIN` session + ephemeral cookie         | High         | Platform | Step 3 | **PASSED** (Unit Suite) |
| `TC-PAY-003` | `REQ-PAY-003` | Integration / Orders        | `POST /api/v1/checkout/orders` calls Razorpay `/v1/orders`        | Razorpay order created; Payment record initialized `INITIATED` | High         | Platform | Step 3 | `PLANNED`               |
| `TC-PAY-004` | `REQ-PAY-004` | Fault / Timeout             | Razorpay order creation socket timeout (>8000ms)                  | Status marked `INITIATED_UNCERTAIN`; blind retries blocked     | High         | Platform | Step 3 | `PLANNED`               |
| `TC-PAY-005` | `REQ-PAY-005` | Security / Webhook          | Webhook with tampered or invalid HMAC signature                   | Request rejected with 400 Bad Request; zero DB changes         | **Critical** | Platform | Step 4 | `PLANNED`               |
| `TC-PAY-006` | `REQ-PAY-005` | Security / Timing           | Constant-time HMAC check via `crypto.timingSafeEqual`             | Eliminates timing side-channel attacks on signature            | High         | Platform | Step 4 | `PLANNED`               |
| `TC-PAY-007` | `REQ-PAY-006` | Idempotency / Webhook       | Identical Razorpay webhook sent twice with same `eventId`         | Second delivery recognized as duplicate; 200 OK returned       | **Critical** | Platform | Step 4 | `PLANNED`               |
| `TC-PAY-008` | `REQ-PAY-007` | Edge / Late Payment         | Payment captured after 5-minute hold expired and slot filled      | Status `EXPIRED_UNFULFILLED`; queued for automated refund      | **Critical** | Platform | Step 4 | `PLANNED`               |
| `TC-PAY-009` | `REQ-PAY-008` | State / Refund              | Refund lifecycle transitions: `PENDING` $\rightarrow$ `PROCESSED` | Monotonic state transitions; cannot re-refund captured sum     | **Critical** | Platform | Step 4 | `PLANNED`               |
| `TC-PAY-010` | `REQ-PAY-009` | Security / Crypto           | Voucher payload signed with KMS Ed25519 private key               | Bearer QR contains valid compact signature with `kid`          | **Critical** | Platform | Step 5 | `PLANNED`               |
| `TC-PAY-011` | `REQ-PAY-010` | Functional / Butler         | Payment confirmation response generation                          | Deep-link contains pre-filled WhatsApp activation URL          | Medium       | Platform | Step 5 | **PASSED** (Unit Suite) |
| `TC-PAY-012` | `REQ-PAY-001` | Financial / Roundoff        | Multi-line quotes with odd paise distributions                    | Integer summation guaranteed equal to sum of parts             | **Critical** | Platform | Step 3 | `PLANNED`               |
| `TC-PAY-013` | `REQ-PAY-003` | Concurrency / Duplicate Pay | Rapid consecutive calls to `/checkout/orders` for same hold       | Second call rejected or returns existing order                 | High         | Platform | Step 3 | `PLANNED`               |
| `TC-PAY-014` | `REQ-PAY-004` | Fault / Gateway Crash       | Gateway responds with HTTP 500/502 during order creation          | Handled gracefully without corrupting hold booking             | High         | Platform | Step 3 | `PLANNED`               |
| `TC-PAY-015` | `REQ-PAY-004` | State / Uncertain Recovery  | Outbox reconciler queries gateway for `INITIATED_UNCERTAIN`       | Resolves order status or marks payment failed                  | High         | Platform | Step 3 | `PLANNED`               |
| `TC-PAY-016` | `REQ-PAY-006` | Concurrency / Dual Webhook  | Concurrent delivery of identical webhook event ID                 | PostgreSQL unique constraint catches duplicate atomically      | **Critical** | Platform | Step 4 | `PLANNED`               |
| `TC-PAY-017` | `REQ-PAY-005` | Security / Header Missing   | Webhook received without `X-Razorpay-Signature`                   | Rejected immediately with 400 Bad Request                      | High         | Platform | Step 4 | `PLANNED`               |
| `TC-PAY-018` | `REQ-PAY-007` | Edge / Partial Resale       | Late capture arrives when only partial seats remain               | Rejected for safety; full amount queued for refund             | **Critical** | Platform | Step 4 | `PLANNED`               |
| `TC-PAY-019` | `REQ-PAY-008` | Fault / Refund Retry        | Gateway refund API times out during refund task                   | Task status remains `RETRY_PENDING` with exponential backoff   | High         | Platform | Step 4 | `PLANNED`               |

---

### Module 4: Simple Host Front-Desk Check-in

| Test Case ID  | Req ID         | Test Scope & Category | Description & Input                                 | Expected Result                                                                 | Severity     | Repo | Step   | Current Status |
| :------------ | :------------- | :-------------------- | :-------------------------------------------------- | :------------------------------------------------------------------------------ | :----------- | :--- | :----- | :------------- |
| `TC-HOST-001` | `REQ-HOST-001` | Access / UI           | Front-desk staff accesses `/host/check-in`          | Responsive check-in dashboard loaded with scanner & search                      | High         | Host | Step 6 | `PLANNED`      |
| `TC-HOST-002` | `REQ-HOST-002` | Usability / Code      | Staff enters 6-character booking reference manually | Guest party details and voucher status displayed                                | High         | Host | Step 6 | `PLANNED`      |
| `TC-HOST-003` | `REQ-HOST-002` | Security / Rate Limit | 5 consecutive failed code lookups within 1 minute   | Rate limiter blocks client IP for 15 minutes; audit logged                      | High         | Host | Step 6 | `PLANNED`      |
| `TC-HOST-004` | `REQ-HOST-003` | State Transition      | Staff taps "Confirm Check-in" on valid voucher      | `VoucherStatus` $\rightarrow$ `REDEEMED`, `Attendance` $\rightarrow$ `ATTENDED` | **Critical** | Host | Step 6 | `PLANNED`      |
| `TC-HOST-005` | `REQ-HOST-003` | Negative / Duplicate  | Staff taps check-in on already redeemed voucher     | Immediate rejection with "Already Redeemed at [Timestamp]"                      | High         | Host | Step 6 | `PLANNED`      |

---

### Module 5: CRM Onboarding & Account Bridge

| Test Case ID | Req ID        | Test Scope & Category    | Description & Input                                     | Expected Result                                          | Severity     | Repo     | Step   | Current Status |
| :----------- | :------------ | :----------------------- | :------------------------------------------------------ | :------------------------------------------------------- | :----------- | :------- | :----- | :------------- |
| `TC-CRM-001` | `REQ-CRM-001` | Integration / Ingress    | CRM webhook triggers on partner reaching Stage 5        | Platform receives signed payload; creates PartnerAccount | High         | Platform | Step 6 | `PLANNED`      |
| `TC-CRM-002` | `REQ-CRM-002` | Idempotency / Upsert     | Repeated CRM activation webhook with same `partnerCode` | Upserts existing account without duplicate host records  | High         | Platform | Step 6 | `PLANNED`      |
| `TC-CRM-003` | `REQ-CRM-003` | Security / Revocation    | CRM sends Stage 9 (Terminated/Suspended) webhook        | Host status set to `SUSPENDED`; active sessions revoked  | **Critical** | Platform | Step 6 | `PLANNED`      |
| `TC-CRM-004` | `REQ-CRM-001` | Security / Bad Signature | CRM webhook with invalid HMAC signature                 | Rejected with 401/403 Forbidden; zero DB modifications   | **Critical** | Platform | Step 6 | `PLANNED`      |
| `TC-CRM-005` | `REQ-CRM-001` | Validation / Malformed   | CRM webhook missing mandatory tax or bank details       | Rejected with 400 Bad Request; error logged              | High         | Platform | Step 6 | `PLANNED`      |
| `TC-CRM-006` | `REQ-CRM-002` | Concurrency / Dual Ping  | Two simultaneous CRM activation pings for new partner   | Unique index on `partnerCode` prevents duplicate record  | High         | Platform | Step 6 | `PLANNED`      |
| `TC-CRM-007` | `REQ-CRM-003` | Fault / Retry Recovery   | CRM webhook delivery fails; CRM retries with backoff    | Platform accepts retry without side-effect duplication   | High         | Platform | Step 6 | `PLANNED`      |

---

### Module 6: Listing Inventory & Content

| Test Case ID | Req ID         | Test Scope & Category | Description & Input                                 | Expected Result                                         | Severity | Repo     | Step       | Current Status                         |
| :----------- | :------------- | :-------------------- | :-------------------------------------------------- | :------------------------------------------------------ | :------- | :------- | :--------- | :------------------------------------- |
| `TC-LST-001` | `REQ-HOST-004` | Functional / Editor   | Host edits title, summary, and rules in Web Editor  | Listing updates saved as `DRAFT` in database            | Medium   | Host     | Step 6     | **PASSED** (Unit Mock)                 |
| `TC-LST-002` | `REQ-HOST-005` | Media / Upload        | Host uploads photo gallery to Cloudflare R2 / S3    | Images resized, signed URLs generated, CDN paths stored | Medium   | Host     | Step 6     | **PASSED** (Unit Mock / R2 Unverified) |
| `TC-LST-003` | `REQ-HOST-006` | State Transition      | Host attempts to set status directly to `PUBLISHED` | Blocked; listing requires admin operations review       | High     | Platform | Step 1 / 6 | **PASSED** (Unit Suite)                |

---

### Module 7: Live Calendar & Slot Scheduler

| Test Case ID | Req ID         | Test Scope & Category  | Description & Input                                         | Expected Result                                         | Severity     | Repo     | Step   | Current Status          |
| :----------- | :------------- | :--------------------- | :---------------------------------------------------------- | :------------------------------------------------------ | :----------- | :------- | :----- | :---------------------- |
| `TC-CAL-001` | `REQ-HOST-007` | Functional / Batch     | Host generates recurring weekly slots (e.g. 10 AM, 2 PM)    | Batch slots created atomically with unique start times  | High         | Host     | Step 6 | **PASSED** (Unit Suite) |
| `TC-CAL-002` | `REQ-HOST-007` | Negative / Duplicate   | Host creates slot with identical `(experienceId, startsAt)` | Unique constraint violation translated to ConflictError | High         | Platform | Step 1 | **PASSED** (Unit Suite) |
| `TC-CAL-003` | `REQ-HOST-008` | Concurrency / Blackout | Host toggles 1-tap emergency blackout on active slot        | Slot status updated to `CLOSED`; future holds blocked   | **Critical** | Host     | Step 6 | `PLANNED`               |

---

### Module 8: Real-Time Booking Roster

| Test Case ID | Req ID         | Test Scope & Category | Description & Input                                | Expected Result                                         | Severity     | Repo | Step   | Current Status |
| :----------- | :------------- | :-------------------- | :------------------------------------------------- | :------------------------------------------------------ | :----------- | :--- | :----- | :------------- |
| `TC-ROS-001` | `REQ-HOST-009` | Functional / Manifest | Host loads roster for tomorrow's 10:00 AM slot     | Displays confirmed parties, guest counts, dietary notes | High         | Host | Step 6 | `PLANNED`      |
| `TC-ROS-002` | `REQ-HOST-009` | Multi-Tenant / Leak   | Host A attempts to load manifest for Host B's slot | Request rejected with 404/403; zero cross-tenant leak   | **Critical** | Host | Step 6 | `PLANNED`      |

---

### Module 9: Mobile Camera QR Scanner & Vouchers

| Test Case ID | Req ID         | Test Scope & Category  | Description & Input                                         | Expected Result                                               | Severity     | Repo | Step   | Current Status |
| :----------- | :------------- | :--------------------- | :---------------------------------------------------------- | :------------------------------------------------------------ | :----------- | :--- | :----- | :------------- |
| `TC-SCN-001` | `REQ-HOST-010` | Functional / Stream    | Door attendant opens scanner on iOS Safari / Chrome Android | Camera video stream acquires; QR decoded in real time         | High         | Host | Step 6 | `PLANNED`      |
| `TC-SCN-002` | `REQ-HOST-010` | Security / Door PIN    | Attendant inputs 4-digit Door PIN                           | Authenticates with 8-hour shift token; scoped to staff role   | High         | Host | Step 6 | `PLANNED`      |
| `TC-SCN-003` | `REQ-HOST-010` | Security / Lockout     | 5 incorrect Door PIN attempts                               | Account locked for 30 minutes; audit alert generated          | High         | Host | Step 6 | `PLANNED`      |
| `TC-SCN-004` | `REQ-HOST-011` | Security / Replay      | Scanner receives duplicated QR code (already burned)        | Instant rejection with red screen: `VOUCHER_ALREADY_REDEEMED` | **Critical** | Host | Step 6 | `PLANNED`      |
| `TC-SCN-005` | `REQ-HOST-011` | Security / Tamper      | Scanner receives QR with tampered payload or bad signature  | Immediate rejection: `INVALID_CRYPTOGRAPHIC_SIGNATURE`        | **Critical** | Host | Step 6 | `PLANNED`      |
| `TC-SCN-006` | `REQ-HOST-011` | Offline / Verification | Valid Ed25519 QR presented while scanner offline            | Signature verified against pre-cached public key              | High         | Host | Step 6 | `PLANNED`      |
| `TC-SCN-007` | `REQ-HOST-011` | Temporal / Expired QR  | QR code presented after slot start + validity window        | Rejected with `VOUCHER_EXPIRED` alert                         | High         | Host | Step 6 | `PLANNED`      |
| `TC-SCN-008` | `REQ-HOST-010` | Hardware / Device Bind | Scanner shift token used from unapproved IP/device          | Rejected; requires manager authorization                      | Medium       | Host | Step 6 | `PLANNED`      |

---

### Module 10: Financial Settlement & Payouts

| Test Case ID | Req ID        | Test Scope & Category   | Description & Input                                        | Expected Result                                             | Severity     | Repo     | Step       | Current Status |
| :----------- | :------------ | :---------------------- | :--------------------------------------------------------- | :---------------------------------------------------------- | :----------- | :------- | :--------- | :------------- |
| `TC-SET-001` | `REQ-OPS-001` | Financial / Ingestion   | Booking confirmed and attended                             | Financial ledger entry recorded with host commission bps    | High         | Platform | Step 7     | `PLANNED`      |
| `TC-SET-002` | `REQ-OPS-002` | Operations / CSV        | Generate weekly settlement CSV batch export                | Valid CSV with NEFT bank details, gross, net, fee breakdown | **Critical** | Host     | Step 7     | `PLANNED`      |
| `TC-SET-003` | `REQ-OPS-003` | Integration / Route     | Razorpay Route automated split transfer                    | FORMALLY DEFERRED to Phase 2.5 post-pilot                   | Low          | Platform | Post-Pilot | `DEFERRED`     |
| `TC-SET-004` | `REQ-OPS-001` | Financial / Math        | Multi-booking commission math reconciliation               | Gross minus commission equals exact net payout in paise     | **Critical** | Platform | Step 7     | `PLANNED`      |
| `TC-SET-005` | `REQ-OPS-002` | Operations / Duplicate  | Exporting same weekly settlement batch twice               | Idempotent generation; prevents duplicate payout files      | High         | Host     | Step 7     | `PLANNED`      |
| `TC-SET-006` | `REQ-OPS-002` | Security / Injection    | Experience title with commas, quotes, or CSV control chars | Appropriately escaped; prevents CSV formula injection       | High         | Host     | Step 7     | `PLANNED`      |
| `TC-SET-007` | `REQ-OPS-002` | Operations / Refund Adj | Settlement includes refunded booking from prior week       | Net payout adjusted downwards by refund amount              | High         | Host     | Step 7     | `PLANNED`      |

---

### Cross-Cutting Security & Multi-Tenancy

| Test Case ID | Req ID        | Test Scope & Category   | Description & Input                                      | Expected Result                                             | Severity     | Repo     | Step      | Current Status |
| :----------- | :------------ | :---------------------- | :------------------------------------------------------- | :---------------------------------------------------------- | :----------- | :------- | :-------- | :------------- |
| `TC-SEC-001` | `REQ-SEC-001` | Security / Tenancy      | API request with manipulated `partnerId` or `hostId`     | Cross-tenant access rejected; all queries scoped to tenant  | **Critical** | Both     | All Steps | `PLANNED`      |
| `TC-SEC-002` | `REQ-SEC-002` | Security / RBAC         | `HOST_DOOR_STAFF` attempts to access financial payouts   | Blocked with 403 Forbidden; accessible only to `HOST_OWNER` | **Critical** | Host     | Step 6    | `PLANNED`      |
| `TC-SEC-003` | `REQ-SEC-001` | Security / Cross-Read   | Host A requests booking roster for Host B's slot         | Returns 404 Not Found or 403 Forbidden                      | **Critical** | Host     | Step 6    | `PLANNED`      |
| `TC-SEC-004` | `REQ-SEC-001` | Security / Cross-Write  | Host A attempts to update slot capacity on Host B's slot | Rejected with 403 Forbidden; zero state change              | **Critical** | Host     | Step 6    | `PLANNED`      |
| `TC-SEC-005` | `REQ-SEC-002` | Security / Expired Auth | API request presented with expired session cookie        | Rejected with 401 Unauthorized                              | High         | Both     | All Steps | `PLANNED`      |
| `TC-SEC-006` | `REQ-SEC-002` | Security / Escalation   | Traveller session attempts to access `/api/v1/host/*`    | Rejected with 403 Forbidden                                 | **Critical** | Platform | All Steps | `PLANNED`      |

---

## E. Sprint/Step-Wise Roadmap Allocation & Ownership

To maintain architectural decoupling, module ownership is partitioned across the seven sequential execution steps:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SEVEN-STEP EXECUTION ROADMAP ALLOCATION                         │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [Step 1: Schema & Migrations] (Sprint 1) ─────────────► STATUS: SCHEMA VALIDATED
   - Scope: Prisma models, ENUMs, SQL DDL migrations, relational integrity.
   - Verification Gate: Code syntax & AST models validated; live migration execution UNVERIFIED / EVIDENCE REQUIRED.

 [Step 2: Capacity Engine & Slot Mutex] (Sprint 2) ────► STATUS: VERIFIED (PostgreSQL 16 Concurrency Passed)
   - Scope: Row lock mutex, dynamic active hold formula, 5-minute TTL, ledger isolation.
   - Minimal API Adapter: POST /api/v1/checkout/reserve (Strictly hold creation; no payment processing).
   - Verification Gate: 35 capacity unit tests PASSED; 12 reserve-route tests PASSED; 10 PG concurrency scenarios PASSED; 9/9 bulk integration suites PASSED.

 [Step 3: Decoupled Checkout API & Orders] (Sprint 3) ─► STATUS: PLANNED
   - Scope: POST /api/v1/checkout/orders, Razorpay order creation, payment record initialization.
   - Verification Gate: Order timeout handling, 8-second gateway fail-safe.

 [Step 4: Webhook Ingress & Idempotency] (Sprint 4) ────► STATUS: PLANNED
   - Scope: Constant-time HMAC verification, PaymentEvent deduplication, late capture auto-refund.
   - Verification Gate: Zero duplicate payment processing under repeated webhook delivery.

 [Step 5: Ed25519 Vouchers & Butler] (Sprint 5) ───────► STATUS: PLANNED
   - Scope: KMS Ed25519 signing, QR code generation, WhatsApp concierge deep links.
   - Verification Gate: Tamper-proof offline decodable vouchers with valid kid headers.

 [Step 6: Host SaaS & Mobile Scanner] (Sprint 6) ──────► STATUS: PLANNED
   - Scope: Front-desk scanner, Door PIN rate limits, real-time booking roster, CRM bridge.
   - Verification Gate: Camera stream QR reading in under 500ms; zero replay vulnerability.

 [Step 7: Weekly Settlement CSV] (Sprint 7) ───────────► STATUS: PLANNED
   - Scope: Host settlement ledger, corporate banking NEFT CSV export batch.
   - Verification Gate: 100% mathematical reconciliation between captured funds, commission, and payouts.
```

---

## F. Test Design Techniques

To ensure comprehensive defect detection, tests are structured using ten formal testing techniques:

1. **Equivalence Partitioning:** Segmenting guest counts into valid partitions ($1 \le \text{guests} \le \text{maxGuests}$) and invalid partitions ($\le 0$, float, $> \text{maxGuests}$).
2. **Boundary Value Analysis (BVA):** Testing exact limits: 0 seats, 1 seat, exactly remaining capacity, 1 seat over capacity, maximum integer values.
3. **State Transition Testing:** Validating monotonic state machines (e.g. `BookingStatus`: `DRAFT` $\rightarrow$ `HELD` $\rightarrow$ `CONFIRMED`; never transitioning into illegal states).
4. **Concurrency & Race Condition Testing:** Firing simultaneous asynchronous requests against scarce inventory slices to trigger potential race hazards.
5. **Fault Injection:** Artificially dropping database connections, injecting network timeouts (>8000ms), and simulating transaction aborts.
6. **Negative & Abuse Testing:** Parameter tampering, client-supplied `userId` injection, CSRF origin mismatch, and invalid cryptographic signatures.
7. **Temporal & Clock Drift Testing:** Testing active holds at $T+299\text{s}$ (active) versus $T+300\text{s}$ (expired).
8. **Regression Testing:** Automated verification that new commits introduce zero breakage in pre-existing domain logic.
9. **Exploratory Testing:** Scenario-driven manual verification of unusual mobile browser and network behaviors.
10. **Idempotency Testing:** Replaying identical payloads multiple times to guarantee single-execution semantics.

---

## G. Severity Classification & Escalation Rules

| Severity     | Definition & Examples                                                                                                                      | Release Gate Impact                                                          | Escalation SLA                                                                       |
| :----------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **CRITICAL** | Overbooking; capacity invariant violation; financial miscalculation; unauthorized cross-tenant data access; cryptographic voucher forgery. | **HARD RELEASE BLOCKER.** Zero critical defects permitted in any deployment. | Immediate halt of release pipeline. Requires Principal Architect & Tech Lead review. |
| **HIGH**     | Major feature breakdown; booking/payment state corruption; authorization bypass within tenant; failure of primary error recovery path.     | **RELEASE BLOCKER.** Must be resolved before pilot deployment.               | 4-hour remediation SLA.                                                              |
| **MEDIUM**   | Partial feature defect with reasonable operational workaround; non-critical input validation flaw; slow API response under non-peak load.  | Permitted with approved release exception and documented issue tracking.     | 24-hour remediation SLA.                                                             |
| **LOW**      | Cosmetic defect; minor UI padding/text alignment issue; non-blocking usability improvement.                                                | Non-blocking. Scheduled in normal sprint maintenance.                        | Standard sprint backlog.                                                             |

---

## H. Test Data, Database Isolation & Clock Synchronization Strategy

### 1. Dedicated Test Database Environment

- Automated integration and concurrency tests strictly require a dedicated PostgreSQL database containing `test` in its name (`lavivenzia_test`).
- Configured via `TEST_DATABASE_URL=postgresql://lavivenzia:lavivenzia_local_dev@localhost:5432/lavivenzia_test`.
- The test harness (`tests/integration/setup.ts`) strictly refuses to run against any database whose name does not contain `test`.
- Canonical database port across `.env.example`, `docker-compose.yml`, `scripts/verify-database.ts`, and `scripts/db-test-setup.ts` is strictly **5432**.

### 2. Isolation & Contamination Prevention

- **User Domain Namespacing:** Every test fixture user email is generated with unique domain `@integration.test` (`testEmail(prefix)`).
- **Teardown Cleanup:** Tests delete created rows in `afterEach` or within the scenario cleanup block. Cascading foreign keys clean dependent records.
- **Worker Isolation:** `vitest.integration.config.mts` sets `fileParallelism: false` to prevent concurrent test files from truncating each other's fixtures.
- **Deterministic Clocks:** Time-dependent unit tests use injectable clock functions (`() => now`) to guarantee deterministic evaluation independent of local wall-clock drift.

### 3. Clock Consistency & Monitoring Reality Audit

In distributed booking architectures, temporal alignment between application runtimes (Node.js) and the persistence tier (PostgreSQL) is critical for hold expiration:

#### Existing Application Clock Implementation

- `BookingCapacityEngine` constructor accepts an injectable clock dependency `now?: () => Date` (defaulting to system `new Date()`).
- At the start of hold creation, `const now = this.#now()` captures the reference timestamp.
- The 5-minute hold instant is computed as `heldUntil = new Date(now.getTime() + this.#holdDurationMs)` (+300,000ms).
- This ensures that within any single application execution, hold duration math is consistent.

#### Existing Database Query Clock Behavior

- In `PrismaBookingCapacityRepository.getActiveHeldSeats(slotId, now)`, the repository does **not** evaluate PostgreSQL `NOW()`.
- It passes the application's `now: Date` timestamp as a parameterized argument to Prisma:
  ```typescript
  where: {
    slotId,
    status: "HELD",
    heldUntil: { gt: now },
  }
  ```
- _SQL Executed:_ `SELECT SUM("guest_count") FROM "bookings" WHERE "slot_id" = $1 AND "status" = 'HELD' AND "held_until" > $2`.
- This ensures the application server clock is the sole authority for query-time dynamic hold evaluation.

#### Actual Configured Infrastructure Monitoring (Current State)

- **Current Repository State:** There is **no active NTP telemetry, chrony configuration, or CloudWatch alarm infrastructure** present in this repository.
- Local execution runs via Docker Compose without automated clock synchronization daemons.

#### Proposed Production Monitoring (Future Staging/Production Deployment)

- When deployed to AWS ECS/App Runner and RDS PostgreSQL (`ap-south-1`), hosts should configure NTP synchronization against the local hypervisor clock (`169.254.169.123`).
- **Proposed Operational Alarms:** CloudWatch Metric Filters should track host clock offset via `chrony` tracking and alert the DevOps on-call engineer if clock drift exceeds $\Delta t > 500\text{ms}$.

#### Deterministic Unit Test Proofs

Verified in [`tests/unit/booking-capacity-engine.test.ts`](file:///d:/Desktop/lavivenzia-platform/tests/unit/booking-capacity-engine.test.ts):

- Boundary precision: Hold is active at $T+299\text{s}$ (299,000ms) and expired at $T+300\text{s}$ (300,000ms).
- Staggered progressive expiry across $T+60\text{s}$, $T+180\text{s}$, and $T+300\text{s}$.
- Timezone equivalence: Identical evaluation across UTC (`2026-11-10T10:00:00.000Z`) and IST (`2026-11-10T15:30:00.000+05:30`).

---

## I. Minimal Capacity API Specification: `POST /api/v1/checkout/reserve`

> [!NOTE]
> **Step 2 Scope Boundary:** `POST /api/v1/checkout/reserve` is a minimal capacity API adapter that exposes the `BookingCapacityEngine` to callers with authentication and CSRF guards. It is strictly responsible for hold reservations and dynamic capacity validation. It does **not** process monetary transactions, invoke Razorpay APIs, or create payment records (which belong strictly to Step 3).

```http
POST /api/v1/checkout/reserve HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Origin: http://localhost:3000
Cookie: lv_session=<session_token>

{
  "slotId": "8b9487c6-2c93-4e42-998e-4a64860b21a8",
  "guests": 2,
  "customerPhone": "+919876543210",
  "specialRequests": "Vegetarian preferences."
}
```

#### Verification Matrix

- **Authentication:** Enforced by `requirePrincipal()`. Absence of valid session returns `401 Unauthorized` (`UNAUTHENTICATED`).
- **CSRF Protection:** Enforced by `assertSameOrigin(env.APP_URL)`. Mismatched origin returns `403 Forbidden` (`FORBIDDEN`).
- **Validation:** Zod schema validates UUID format for `slotId`, integer $\ge 1$ for `guests`. Violations return `400 Bad Request` (`VALIDATION_FAILED`).
- **Tampering Resistance:** Client-supplied `userId`, `status`, `reservedCount`, or `heldUntil` are strictly ignored; server binds strictly to the authenticated caller session.
- **Capacity Conflict:** If requested guests exceed available capacity, returns `409 Conflict` (`CONFLICT`).
- **Database Side Effects:** Atomically inserts one `Booking` row with status `HELD` and one child `BookingItem`. Never mutates `ExperienceSlot.reservedCount`.
- **Response Format:** Returns HTTP 201 on success. Error responses return standard platform `ErrorResponseBody` JSON (`{ error: { code, message, correlationId } }`).

---

## J. Concurrency & Stress Testing Protocol

### The 10 Authoritative Concurrency Scenarios

Authored in [`tests/integration/booking-capacity-concurrency.test.ts`](file:///d:/Desktop/lavivenzia-platform/tests/integration/booking-capacity-concurrency.test.ts):

| Scenario        | Title & Objective                                   | Concurrency Mechanism                         | Real PG Target                          | Persisted State Assertions                                                 | Expected Result                            | Execution Status         |
| :-------------- | :-------------------------------------------------- | :-------------------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------- | :----------------------------------------- | :----------------------- |
| **Scenario 1**  | Capacity 5, 10 concurrent requests for 1 seat       | `Promise.allSettled(10)`                      | Yes (`PrismaBookingCapacityRepository`) | 5 accepted bookings, 5 rejected; active held = 5; `slot.reservedCount = 0` | 5 accepted, 5 rejected; 0 oversold         | `PASSED (PostgreSQL 16)` |
| **Scenario 2**  | Capacity 10, 2 concurrent requests for 6 seats      | `Promise.allSettled(2)`                       | Yes                                     | Exactly 1 accepted, 1 rejected with `ConflictError`; active held = 6       | 1 accepted, 1 rejected; 0 oversold         | `PASSED (PostgreSQL 16)` |
| **Scenario 3**  | Capacity 20, 20 concurrent requests for 1 seat      | `Promise.allSettled(20)`                      | Yes                                     | All 20 accepted; active held = 20; available capacity = 0                  | 20 accepted, 0 rejected                    | `PASSED (PostgreSQL 16)` |
| **Scenario 4**  | Capacity 10, 20 concurrent requests for 2 seats     | `Promise.allSettled(20)`                      | Yes                                     | Exactly 5 accepted ($5 \times 2 = 10$), 15 rejected; active held = 10      | 5 accepted, 15 rejected                    | `PASSED (PostgreSQL 16)` |
| **Scenario 5**  | Capacity 10, 100 concurrent requests for 1 seat     | `Promise.allSettled(100)`                     | Yes                                     | Exactly 10 accepted, 90 rejected; zero lock starvation or leak             | 10 accepted, 90 rejected                   | `PASSED (PostgreSQL 16)` |
| **Scenario 6**  | Independent slots concurrent reservation            | `Promise.allSettled(10)` across Slot A & B    | Yes                                     | 5 accepted on Slot A, 5 accepted on Slot B; non-blocking                   | 10 accepted, 0 rejected                    | `PASSED (PostgreSQL 16)` |
| **Scenario 7**  | Transaction failure rollback                        | Capacity conflict inside transaction          | Yes                                     | Zero partial records in `bookings` or `booking_items`                      | Clean rollback; 0 orphan records           | `PASSED (PostgreSQL 16)` |
| **Scenario 8**  | Expired hold dynamic exclusion                      | Pre-inserted expired hold (`heldUntil < now`) | Yes                                     | New request for full capacity succeeds immediately without cron            | Expired hold ignored; full capacity booked | `PASSED (PostgreSQL 16)` |
| **Scenario 9**  | Multiple active hold aggregation                    | Sequential active holds summing across users  | Yes                                     | Sum reflects 2 confirmed + 5 held = 7 taken; remaining 3 booked            | Math holds across confirmed + held         | `PASSED (PostgreSQL 16)` |
| **Scenario 10** | Repeated Reservation Requests — Capacity Exhaustion | Capacity-boundary check (discrete holds)      | Yes                                     | First request succeeds; second fails when capacity exhausts                | Second request rejected with 409           | `PASSED (PostgreSQL 16)` |

### Integration Suite Execution Record (Stage 6)

The full integration test suite was executed against the live PostgreSQL 16 container (`lavivenzia-postgres`, database `lavivenzia_test`):

- **Command:** `npm run test:integration` (`vitest run --config vitest.integration.config.mts`)
- **Execution Timestamp:** 2026-11-10 23:13:05 IST
- **Result:** 9 passed / 9 passed (100% test files)
- **Total Tests:** 209 passed / 209 passed (100% assertions)
- **Duration:** 74.01s
- **Exit Code:** 0

| Test File                                                | Test Count |  Status  | Duration | Scope & Domain                                                       |
| :------------------------------------------------------- | :--------: | :------: | :------: | :------------------------------------------------------------------- |
| `tests/integration/auth-flows.test.ts`                   |     43     | `PASSED` |  7.02s   | Traveller/Host auth, OTP challenge, sessions, role authorization     |
| `tests/integration/discovery.test.ts`                    |     42     | `PASSED` |  22.33s  | Listing visibility, geo filters, category, pricing sort              |
| `tests/integration/operations-review.test.ts`            |     34     | `PASSED` |  19.02s  | Listing submission, approval, rejection, state transitions           |
| `tests/integration/host-inventory.test.ts`               |     41     | `PASSED` |  15.85s  | Host profile, experience drafts, slot calendar management            |
| `tests/integration/booking-capacity-concurrency.test.ts` |     10     | `PASSED` |  2.74s   | Multi-client row mutex, hold TTL, stress (100 concurrent), rollbacks |
| `tests/integration/schema.test.ts`                       |     14     | `PASSED` |  0.73s   | PostgreSQL schema integrity, tables, foreign keys, extensions        |
| `tests/integration/email-delivery.test.ts`               |     7      | `PASSED` |  0.64s   | Email outbox delivery & provider transport integration               |
| `tests/integration/rbac-seed.test.ts`                    |     13     | `PASSED` |  0.20s   | Role-permission assignment seeding and integrity                     |
| `tests/integration/queue.test.ts`                        |     5      | `PASSED` |  0.19s   | Background task queue persistence and retry handling                 |

### Integration Suite Execution Record (Stage 6)

The full integration test suite was executed against the live PostgreSQL 16 container (`lavivenzia-postgres`, database `lavivenzia_test`):

- **Command:** `npm run test:integration` (`vitest run --config vitest.integration.config.mts`)
- **Execution Timestamp:** 2026-11-10 23:13:05 IST
- **Result:** 9 passed / 9 passed (100% test files)
- **Total Tests:** 209 passed / 209 passed (100% assertions)
- **Duration:** 74.01s
- **Exit Code:** 0

| Test File                                                | Test Count |  Status  | Duration | Scope & Domain                                                       |
| :------------------------------------------------------- | :--------: | :------: | :------: | :------------------------------------------------------------------- |
| `tests/integration/auth-flows.test.ts`                   |     43     | `PASSED` |  7.02s   | Traveller/Host auth, OTP challenge, sessions, role authorization     |
| `tests/integration/discovery.test.ts`                    |     42     | `PASSED` |  22.33s  | Listing visibility, geo filters, category, pricing sort              |
| `tests/integration/operations-review.test.ts`            |     34     | `PASSED` |  19.02s  | Listing submission, approval, rejection, state transitions           |
| `tests/integration/host-inventory.test.ts`               |     41     | `PASSED` |  15.85s  | Host profile, experience drafts, slot calendar management            |
| `tests/integration/booking-capacity-concurrency.test.ts` |     10     | `PASSED` |  2.74s   | Multi-client row mutex, hold TTL, stress (100 concurrent), rollbacks |
| `tests/integration/schema.test.ts`                       |     14     | `PASSED` |  0.73s   | PostgreSQL schema integrity, tables, foreign keys, extensions        |
| `tests/integration/email-delivery.test.ts`               |     7      | `PASSED` |  0.64s   | Email outbox delivery & provider transport integration               |
| `tests/integration/rbac-seed.test.ts`                    |     13     | `PASSED` |  0.20s   | Role-permission assignment seeding and integrity                     |
| `tests/integration/queue.test.ts`                        |     5      | `PASSED` |  0.19s   | Background task queue persistence and retry handling                 |

---

## K. Security & Authorization Verification

### 1. Multi-Tenant Scoping (`REQ-SEC-001`)

- Every database query for listings, slots, bookings, and manifests in `lavivenzia-host` must include `WHERE host_id = :authenticatedHostId`.
- Planned test: Attempt to query or update another host's `ExperienceSlot` using an authenticated session belonging to Host A $\rightarrow$ returns `404 Not Found`.

### 2. Host RBAC Hierarchy (`REQ-SEC-002`)

- **`HOST_OWNER`:** Full access to listings, calendar, financial bank accounts, and payouts.
- **`HOST_DOOR_STAFF`:** Least-privilege access restricted strictly to `/host/check-in` scanner. Attempting to call `/host/settlement` or `/api/v1/host/payouts` returns `403 Forbidden`.

---

## L. Customer Journey E2E Testing & Edge Scenario Audit

### 1. Primary Customer Journeys

| Journey ID    | Title & Scope                       | Implementation Status | E2E Test Authored | E2E Test Executed | Verification Status  | Notes                                                                   |
| :------------ | :---------------------------------- | :-------------------: | :---------------: | :---------------: | :------------------: | :---------------------------------------------------------------------- |
| **Journey 1** | Discovery to Confirmed Hold         |     `IMPLEMENTED`     |       `NO`        |       `NO`        | `PARTIALLY_VERIFIED` | Unit tests pass on route and domain; browser E2E test pending.          |
| **Journey 2** | Capacity Exhaustion Feedback        |     `IMPLEMENTED`     |       `NO`        |       `NO`        | `PARTIALLY_VERIFIED` | 409 Conflict return verified in route unit test; modal UI test pending. |
| **Journey 3** | Expired Hold Inventory Re-attempt   |     `IMPLEMENTED`     |       `NO`        |       `NO`        | `PARTIALLY_VERIFIED` | Dynamic hold query exclusion unit-tested; browser E2E test pending.     |
| **Journey 4** | Payment Auth & Webhook Confirmation |       `PLANNED`       |       `NO`        |       `NO`        |     `UNVERIFIED`     | Scheduled for Step 3 and Step 4 roadmap implementation.                 |
| **Journey 5** | Venue Check-in via Mobile Scanner   |       `PLANNED`       |       `NO`        |       `NO`        |     `UNVERIFIED`     | Scheduled for Step 5 and Step 6 roadmap implementation.                 |

---

### 2. Implementation Audit of Nine Real-World Edge Scenarios

Every described edge behavior is audited below against actual codebase implementation, automated test coverage, or identified as a planned acceptance criterion:

| Scenario                                   | Behavior Description                                                              | Implementation Reality                                                                                                                                 | Automated Test Coverage                                                             | Verification Status    |
| :----------------------------------------- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- | :--------------------- |
| **1. Double-Click on "Reserve"**           | Client UI disables button; concurrent server requests serialized under row lock.  | **Partially Implemented:** Domain row lock serializes requests. Client button disable is in UI component.                                              | Unit tested in `booking-capacity-engine.test.ts`. Browser click test absent.        | `PARTIALLY_VERIFIED`   |
| **2. Browser Refresh during Active Hold**  | Hold persists in PostgreSQL; UI restores booking context from session.            | **Planned Acceptance Criterion:** DB hold persists via `heldUntil`. Frontend session/cookie rehydration context is not yet implemented (Step 3 scope). | None (Frontend context rehydration absent).                                         | `UNVERIFIED / PLANNED` |
| **3. Back Navigation during Checkout**     | Hold persists until 5-minute TTL; selecting new slot creates a separate hold.     | **Planned Acceptance Criterion:** Hold TTL exists in DB. Frontend navigation state machine is not yet implemented.                                     | None.                                                                               | `UNVERIFIED / PLANNED` |
| **4. Slow Network Response (>3000ms)**     | Client displays spinner; client aborts/prompts user after 8000ms timeout.         | **Planned Acceptance Criterion:** Client-side 8000ms AbortController is not yet wired to reserve button (Step 3 scope).                                | None.                                                                               | `UNVERIFIED / PLANNED` |
| **5. Network Disconnect & Retry**          | Retry creates second hold or fails with 409 if capacity full; guidance shown.     | **Unverified Operational Hazard:** No client idempotency key is currently implemented on `/checkout/reserve`; retry creates discrete hold.             | None.                                                                               | `UNVERIFIED / PLANNED` |
| **6. Hold Expiry during Checkout Modal**   | Dynamic release frees seats; late capture on sold-out slot initiates auto-refund. | **Partially Implemented:** Dynamic query release is implemented. Late capture refund task (`REQ-PAY-007`) is Step 4 scope.                             | Domain hold release unit-tested. Refund handler unexecuted.                         | `PARTIALLY_VERIFIED`   |
| **7. Slot Full during Reservation**        | Subsequent request receives immediate 409 Conflict with remaining seat feedback.  | **Implemented in Code:** `BookingCapacityEngine` calculates capacity under lock and throws `ConflictError`.                                            | Unit tested in `booking-capacity-engine.test.ts` & `booking-reserve-route.test.ts`. | `UNIT_VERIFIED`        |
| **8. API Rate Limiting on Reserve**        | Consecutive requests rate-limited to block automated seat squatting/spam.         | **Planned Acceptance Criterion:** `rate_limit_counters` table exists in PostgreSQL, but is **NOT** wired into `/checkout/reserve`.                     | None for reserve route.                                                             | `UNVERIFIED / PLANNED` |
| **9. Structured Customer Error Messaging** | Returns structured JSON error with human-readable guidance and correlation ID.    | **Implemented in Code:** Uses platform standard `ErrorResponseBody` (`{ error: { code, message, correlationId } }`), NOT RFC 7807.                     | Unit tested in `booking-reserve-route.test.ts`.                                     | `UNIT_VERIFIED`        |

---

## M. Failure Injection & Recovery Testing

| Fault Injected                    | Target Component | Expected Behavior                                         | Recovery Action                                   | Status                                                                              |
| :-------------------------------- | :--------------- | :-------------------------------------------------------- | :------------------------------------------------ | :---------------------------------------------------------------------------------- |
| **PostgreSQL Outage**             | Main Platform    | Route catches connection error; returns 502/503           | Fallback activates; reconnect via pool            | `PARTIALLY_VERIFIED (Offline catalog fallback verified; live reconnect unverified)` |
| **Transaction Timeout**           | Capacity Engine  | PostgreSQL terminates query after timeout; locks released | Transaction rolls back; 409 returned              | `UNVERIFIED / PENDING (Requires live PostgreSQL timeout injection)`                 |
| **Dropped Socket during Order**   | Razorpay Client  | Payment state set to `INITIATED_UNCERTAIN`                | Outbox reconciliation poller checks gateway       | Planned (Step 3)                                                                    |
| **Duplicate Webhook Delivery**    | Webhook Handler  | Unique index on `eventId` catches P2002 conflict          | Returns 200 OK without double processing          | Planned (Step 4)                                                                    |
| **Late Capture on Sold-out Slot** | Webhook Handler  | Slot sold out after hold expiry; capture arrives          | Booking set to `EXPIRED_UNFULFILLED`; auto-refund | Planned (Step 4)                                                                    |

---

## N. Performance & Load Thresholds (Provisional)

| Metric                          | Target Threshold     | Scope                          | Condition                  |
| :------------------------------ | :------------------- | :----------------------------- | :------------------------- |
| **Availability Lookup Latency** | $p95 < 150\text{ms}$ | `GET /experiences/:slug/slots` | 50 concurrent requests     |
| **Hold Reservation Latency**    | $p95 < 350\text{ms}$ | `POST /checkout/reserve`       | 20 concurrent transactions |
| **Row Lock Hold Duration**      | $< 50\text{ms}$      | PostgreSQL `FOR UPDATE`        | Inside active transaction  |
| **Scanner QR Decoding Time**    | $< 400\text{ms}$     | Mobile HTML5 Camera            | Standard 4G connection     |

---

## O. Automated CI Execution Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 AUTOMATED CI PIPELINE                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [Stage 1: Prettier Format Check] ───────────► `npm run format:check`
  [Stage 2: ESLint Static Analysis] ──────────► `npm run lint`
  [Stage 3: TypeScript Typecheck] ────────────► `npm run typecheck` (`tsc --noEmit`)
  [Stage 4: Complete Unit Test Suite] ────────► `npm run test` (All 49 unit test files)
  [Stage 5: PostgreSQL Database Migrations] ──► `npm run db:migrate:deploy` (Clean DB)
  [Stage 6: Concurrency Integration Tests] ───► `npm run test:integration` (PostgreSQL)
  [Stage 7: Production Build Verification] ───► `npm run build`
```

---

## P. Requirement-to-Test Traceability Matrix (All 37 Requirements)

### Status Taxonomy & Verification Semantics

To ensure absolute engineering precision, status values are defined and applied independently across four dimensions:

1. **Requirement Implementation Status:**
   - `NOT_IMPLEMENTED`: Completely absent from current codebase.
   - `PARTIALLY_IMPLEMENTED`: Initial adapter or mock exists; production database, gateway, or live cloud services pending.
   - `SOURCE_VERIFIED`: Pre-existing code verified in repository AST (Phase 1 discovery).
   - `IMPLEMENTED`: Production-grade code, ports, adapters, and domain engines fully authored in current sprint.
   - `DEFERRED`: Formally postponed to Phase 2.5 or post-pilot expansion.
2. **Test Implementation Status:**
   - `PLANNED`: Test design documented in test plan; automated code not yet authored.
   - `AUTHORED`: Test cases formally coded in `tests/unit/` or `tests/integration/`.
3. **Test Execution Status:**
   - `PASSED`: All associated required tests have passed.
   - `MIXED`: Associated tests include both passed cases and blocked/failed cases.
   - `PARTIALLY_EXECUTED`: Some associated tests have run; others remain unexecuted or planned.
   - `BLOCKED`: Execution is prevented by an external dependency (e.g. Docker daemon in sandbox).
   - `FAILED`: One or more required tests failed.
   - `UNEXECUTED`: Automated test code not yet run or scheduled for future sprint.
   - `NOT_APPLICABLE`: Requirement deferred; automated test execution omitted.
4. **Acceptance Criteria (AC) Verification Status:**
   - `UNIT_VERIFIED`: Relevant unit tests passed with 100% assertions satisfied.
   - `PARTIALLY_VERIFIED`: Unit tests passed, but required integration, live database, or E2E evidence is pending.
   - `VERIFIED`: All applicable acceptance criteria have been demonstrated on an integration or production-equivalent test harness.
   - `UNVERIFIED`: Sufficient empirical evidence is not yet available.

---

### Authoritative 37-Requirement Traceability Matrix

| Req ID           | Module & Domain     | Test Case IDs                                                       | Repo     | Step       |     Req Impl Status     | Test Impl Status |   Test Exec Status   | AC Verification Status | Evidence Reference                                                     |
| :--------------- | :------------------ | :------------------------------------------------------------------ | :------- | :--------- | :---------------------: | :--------------: | :------------------: | :--------------------: | :--------------------------------------------------------------------- |
| **REQ-MAIN-001** | Mod 1: Catalogue    | `TC-CAT-001`, `TC-CAT-002`                                          | Platform | Discovery  |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |  `PARTIALLY_VERIFIED`  | `tests/unit/discovery-filters.test.ts` (Live PG catalog pending)       |
| **REQ-MAIN-002** | Mod 1: Catalogue    | `TC-CAT-003`, `TC-CAT-004`                                          | Platform | Discovery  |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |    `UNIT_VERIFIED`     | `tests/unit/booking-pricing.test.ts`                                   |
| **REQ-MAIN-003** | Mod 1: Catalogue    | `TC-CAT-005`                                                        | Platform | Discovery  |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |    `UNIT_VERIFIED`     | `tests/unit/discovery-offline-fallback.test.ts`                        |
| **REQ-MAIN-004** | Mod 1: Catalogue    | `TC-CAT-006`, `TC-CAT-007`                                          | Platform | Discovery  |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |    `UNIT_VERIFIED`     | `tests/unit/discovery-geo.test.ts`                                     |
| **REQ-MVP-001**  | Mod 2: Capacity     | `TC-CAP-001`                                                        | Platform | Step 2     |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |  `PARTIALLY_VERIFIED`  | `tests/unit/booking-flow.test.ts` (UI integration pending)             |
| **REQ-MVP-002**  | Mod 2: Capacity     | `TC-CAP-002`, `TC-CAP-003`, `TC-CAP-011`–`TC-CAP-013`, `TC-CAP-019` | Platform | Step 2     |      `IMPLEMENTED`      |    `AUTHORED`    |       `PASSED`       |       `VERIFIED`       | `tests/unit/booking-capacity-engine.test.ts` & Live PG hold verified   |
| **REQ-MVP-003**  | Mod 2: Capacity     | `TC-CAP-004`–`TC-CAP-007`, `TC-CAP-010`, `TC-CAP-014`–`TC-CAP-018`  | Platform | Step 2     |      `IMPLEMENTED`      |    `AUTHORED`    |       `PASSED`       |       `VERIFIED`       | `tests/unit/booking-capacity-engine.test.ts` & PG 10 Concurrency Tests |
| **REQ-MVP-004**  | Mod 2: Capacity     | `TC-CAP-008`, `TC-CAP-009`                                          | Platform | Step 2     |      `IMPLEMENTED`      |    `AUTHORED`    |       `PASSED`       |       `VERIFIED`       | Unit boundary passed; Live PG Scenario 8 hold exclusion PASSED         |
| **REQ-PAY-001**  | Mod 3: Checkout     | `TC-PAY-001`, `TC-PAY-012`                                          | Platform | Step 3     |    `SOURCE_VERIFIED`    |    `AUTHORED`    | `PARTIALLY_EXECUTED` |    `UNIT_VERIFIED`     | `tests/unit/booking-pricing.test.ts` (TC-PAY-012 planned)              |
| **REQ-PAY-002**  | Mod 3: Checkout     | `TC-PAY-002`                                                        | Platform | Step 3     |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |  `PARTIALLY_VERIFIED`  | `tests/unit/booking-checkout.test.ts` (Admin prod gate pending)        |
| **REQ-PAY-003**  | Mod 3: Checkout     | `TC-PAY-003`, `TC-PAY-013`                                          | Platform | Step 3     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 3 Roadmap                                                         |
| **REQ-PAY-004**  | Mod 3: Checkout     | `TC-PAY-004`, `TC-PAY-014`, `TC-PAY-015`                            | Platform | Step 3     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 3 Roadmap                                                         |
| **REQ-PAY-005**  | Mod 3: Checkout     | `TC-PAY-005`, `TC-PAY-006`, `TC-PAY-017`                            | Platform | Step 4     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 4 Roadmap                                                         |
| **REQ-PAY-006**  | Mod 3: Checkout     | `TC-PAY-007`, `TC-PAY-016`                                          | Platform | Step 4     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 4 Roadmap                                                         |
| **REQ-PAY-007**  | Mod 3: Checkout     | `TC-PAY-008`, `TC-PAY-018`                                          | Platform | Step 4     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 4 Roadmap                                                         |
| **REQ-PAY-008**  | Mod 3: Checkout     | `TC-PAY-009`, `TC-PAY-019`                                          | Platform | Step 4     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 4 Roadmap                                                         |
| **REQ-PAY-009**  | Mod 3: Checkout     | `TC-PAY-010`                                                        | Platform | Step 5     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 5 Roadmap                                                         |
| **REQ-PAY-010**  | Mod 3: Checkout     | `TC-PAY-011`                                                        | Platform | Step 5     |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |    `UNIT_VERIFIED`     | `tests/unit/trips.test.ts`                                             |
| **REQ-HOST-001** | Mod 4: Host Portal  | `TC-HOST-001`                                                       | Host     | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-HOST-002** | Mod 4: Host Portal  | `TC-HOST-002`, `TC-HOST-003`                                        | Host     | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-HOST-003** | Mod 4: Host Portal  | `TC-HOST-004`, `TC-HOST-005`                                        | Host     | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-CRM-001**  | Mod 5: Provisioning | `TC-CRM-001`, `TC-CRM-004`, `TC-CRM-005`                            | Platform | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-CRM-002**  | Mod 5: Provisioning | `TC-CRM-002`, `TC-CRM-006`, `TC-CRM-007`                            | Platform | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-CRM-003**  | Mod 5: Provisioning | `TC-CRM-003`                                                        | Platform | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-HOST-004** | Mod 6: Listings     | `TC-LST-001`                                                        | Host     | Step 6     |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |  `PARTIALLY_VERIFIED`  | `tests/unit/host-profile.test.ts` (Portal editor pending)              |
| **REQ-HOST-005** | Mod 6: Listings     | `TC-LST-002`                                                        | Host     | Step 6     | `PARTIALLY_IMPLEMENTED` |    `AUTHORED`    |       `PASSED`       |  `PARTIALLY_VERIFIED`  | `tests/unit/storage-and-format.test.ts` (Live R2 sync UNVERIFIED)      |
| **REQ-HOST-006** | Mod 6: Listings     | `TC-LST-003`                                                        | Host     | Step 1 / 6 |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |  `PARTIALLY_VERIFIED`  | `tests/unit/experience-lifecycle.test.ts` (Review workflow pending)    |
| **REQ-HOST-007** | Mod 7: Calendar     | `TC-CAL-001`, `TC-CAL-002`                                          | Host     | Step 1 / 6 |    `SOURCE_VERIFIED`    |    `AUTHORED`    |       `PASSED`       |  `PARTIALLY_VERIFIED`  | `tests/unit/availability-service.test.ts` (Host UI pending)            |
| **REQ-HOST-008** | Mod 7: Calendar     | `TC-CAL-003`                                                        | Host     | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-HOST-009** | Mod 8: Manifest     | `TC-ROS-001`, `TC-ROS-002`                                          | Host     | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-HOST-010** | Mod 9: Scanner      | `TC-SCN-001`–`TC-SCN-003`, `TC-SCN-008`                             | Host     | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-HOST-011** | Mod 9: Scanner      | `TC-SCN-004`–`TC-SCN-007`                                           | Host     | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-SEC-001**  | Cross-Cutting       | `TC-SEC-001`, `TC-SEC-003`, `TC-SEC-004`                            | Both     | All Steps  |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | All Steps Roadmap                                                      |
| **REQ-SEC-002**  | Cross-Cutting       | `TC-SEC-002`, `TC-SEC-005`, `TC-SEC-006`                            | Host     | Step 6     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 6 Roadmap                                                         |
| **REQ-OPS-001**  | Mod 10: Settlement  | `TC-SET-001`, `TC-SET-004`                                          | Platform | Step 7     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 7 Roadmap                                                         |
| **REQ-OPS-002**  | Mod 10: Settlement  | `TC-SET-002`, `TC-SET-005`–`TC-SET-007`                             | Host     | Step 7     |        `PLANNED`        |    `PLANNED`     |     `UNEXECUTED`     |      `UNVERIFIED`      | Step 7 Roadmap                                                         |
| **REQ-OPS-003**  | Mod 10: Settlement  | `TC-SET-003`                                                        | Platform | Post-Pilot |       `DEFERRED`        |    `PLANNED`     |   `NOT_APPLICABLE`   |      `UNVERIFIED`      | Post-Pilot Deferral                                                    |

---

## Q. Release-Readiness Checklist

- [x] **Sprint 1 Database Migrations on Live PostgreSQL:** VERIFIED (All 7 migrations applied to PostgreSQL 16.15; verified via `npm run db:verify` covering extensions, tables, foreign keys, indexes, and constraints).
- [x] **Capacity Engine Unit Test Gate:** 35/35 unit tests passed (`tests/unit/booking-capacity-engine.test.ts`).
- [x] **API Route Unit Test Gate:** 12/12 route unit tests passed (`tests/unit/booking-reserve-route.test.ts`).
- [x] **Regression Unit Suite Gate:** 49/49 test files passed (909/909 tests with safe test timeout).
- [x] **TypeScript Strict Typing:** 0 compilation errors (`tsc --noEmit`).
- [x] **Prettier Code Style:** All Sprint 2 files 100% formatted.
- [x] **Live PostgreSQL 16 Concurrency Gate:** VERIFIED (10/10 scenarios passed in `tests/integration/booking-capacity-concurrency.test.ts` against Docker PostgreSQL 16 container `lavivenzia-postgres`).
- [x] **Full Integration Test Suite Gate:** VERIFIED (9/9 test files passed, 209/209 tests passed in 74.01s, exit code 0 against live PostgreSQL 16 container `lavivenzia-postgres`).
- [ ] **Step 3 Razorpay Checkout:** Scheduled for Sprint 3.
- [ ] **Step 4 Webhook Deduplication:** Scheduled for Sprint 4.
- [ ] **Step 5 Ed25519 Voucher Signing:** Scheduled for Sprint 5.
- [ ] **Step 6 Host Portal & Mobile Scanner:** Scheduled for Sprint 6.
- [ ] **Step 7 Settlement CSV Export:** Scheduled for Sprint 7.
