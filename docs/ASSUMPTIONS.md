# Working Assumptions

Tejas confirmed on 2026-08-19 that pending business-model decisions must not
block development. This register is the mechanism that makes that safe: every
assumption made in place of a founder decision is recorded here, kept
configurable, and kept cheap to reverse.

**Rules this register enforces:**

1. No pending business decision is hard-coded. Where a value is needed, it comes
   from configuration or from a single named constant — never from a literal
   scattered through the code.
2. No pending business decision is baked into the database schema. If a decision
   determines column structure, the columns are not written yet.
3. Every assumption has a named reversal cost. If reversing it would require a
   data migration, it is not an acceptable assumption and the work waits.

**Status values:** `ASSUMED` (working default in place) · `DEFERRED` (nothing
built, waiting) · `CONFIRMED` (founder decided — move the detail into the
relevant spec and close the row).

---

## A-001 — RBAC role-to-permission mapping

- **Status:** ASSUMED
- **Owner:** Founder / operations
- **Where:** `src/modules/auth/permissions.ts`, seeded by `prisma/seed.ts`

Six roles from `REQUIREMENTS.md` §2, with a permission set derived from the
launch scope in `PROJECT.md` §4. Notable choices, none confirmed:

- **Host inherits all traveller permissions.** Hosts book experiences too, and a
  single superset role avoids a "do they also have a traveller account" branch
  in every downstream check.
- **`operations` and `finance` both get `audit:read`.** Both investigate
  incidents; neither can write.
- **Money-moving permissions** (`refund:issue`, `payout:approve`,
  `commission:configure`) are held only by `finance` and `super_admin`.
- **`role:grant` is super_admin only.**
- **`super_admin` is computed as every permission**, not enumerated, so a new
  permission cannot be omitted from it by accident.

**Reversal cost: trivial.** Permissions are rows, not code paths. The seed
reconciles system roles against the definition — adding what is missing and
removing what is no longer defined — so changing the mapping means editing
`ROLE_DEFINITIONS` and re-running `npm run db:seed`. No migration.

---

## A-002 — Session lifetimes

- **Status:** ASSUMED
- **Owner:** Founder / security
- **Where:** `SESSION_LIFETIMES` in `src/modules/auth/session.ts`

Traveller 30 days sliding, host 7 days, admin 8h absolute with a 30m idle
timeout (ADR-0005). Chosen as a defensible security posture, not from a stated
requirement.

**Reversal cost: trivial.** One constant. Existing sessions age out naturally.

---

## A-003 — Platform fee

- **Status:** DEFERRED — nothing built
- **Owner:** Founder
- **Where:** nowhere yet, by design

The wireframe board shows a "Platform Fee" of ₹200 on a ₹4,998 subtotal
(roughly 4%). **No requirement defines it, and it is not implemented anywhere.**

When it is built, the rate must be an effective-dated configuration row, never a
constant, and it must be **snapshotted onto each booking at confirmation** —
changing the fee must never alter historical bookings.

**Reversal cost if assumed wrongly: high.** A fee baked into a booking total
with no snapshot cannot be corrected retrospectively without recomputing
financial records. This is why nothing is built.

---

## A-004 — Cancellation and refund policy

- **Status:** DEFERRED — nothing built
- **Owner:** Founder
- **Where:** nowhere yet, by design

Unresolved: whether policies are per-listing or platform-wide, the time-to-start
tiers, and who absorbs the platform fee on a refund.

The refund schema depends on all three, so no refund tables exist. `ADR-0010`
records the design constraints that will bind whenever it is built.

**Reversal cost if assumed wrongly: high.** Refund rules determine the shape of
the refund and ledger tables, and the data they hold is financial. Guessing here
means migrating money records later.

---

## A-005 — GST / TCS structure

- **Status:** DEFERRED — nothing built
- **Owner:** Founder + chartered accountant
- **Where:** nowhere yet, by design

Whether La Vivenzia invoices as a supplier or as an e-commerce operator
collecting TCS determines the invoice and tax schema: place of supply, HSN/SAC
codes, the CGST/SGST/IGST split, and the invoice numbering series.

This needs professional tax advice, not an engineering judgement, and it has
external lead time. **Starting that conversation is the single most
time-sensitive item in this register.**

**Reversal cost if assumed wrongly: very high.** Invoice numbering must be
gapless and sequential per financial year. Reissuing invoices under a corrected
structure is a compliance problem, not a migration.

---

## A-006 — Embeddings provider

- **Status:** DEFERRED — boundary built, no provider selected
- **Owner:** Founder
- **Where:** `src/ports/embeddings.ts`, `src/adapters/embeddings/index.ts`

Anthropic offers no embeddings endpoint, so pgvector needs a second vendor
(ADR-0007). None is chosen.

What exists: the `vector` extension is installed, the port is defined, and the
adapter throws `NotImplementedError`. It deliberately does not default to a
provider. `EMBEDDINGS_PROVIDER` and `EMBEDDINGS_API_KEY` exist as empty
configuration.

**No vector column exists and none may be added until this is decided** — the
model fixes the dimension.

**Reversal cost if assumed wrongly: high.** Changing the dimension after data
exists means re-embedding the entire catalogue and rewriting the column.

---

## A-007 — Design tokens

- **Status:** CONFIRMED — resolved by ADR-0012
- **Owner:** Founder / design
- **Where:** `src/app/globals.css`

The numeric token layer now exists: palette, radius scale, elevation, container
width and the type pairing. `DESIGN.md` described these in prose only, which is
why no UI could be built without inventing values inside components.

ADR-0012 records the one substantive deviation — light working surfaces with
dark anchors, in place of the all-dark direction in `DESIGN.md` §3 — and the
reasoning for it. Colours live only in `globals.css`, so revisiting the decision
is a token change rather than a rebuild.

## A-008 — Local development database image

- **Status:** ASSUMED
- **Owner:** Engineering
- **Where:** `docker/postgres/Dockerfile`, `docker-compose.yml`

PostgreSQL 16, built from `postgis/postgis:16-3.4` with `postgresql-16-pgvector`
added, because no published image carries both extensions.

The major version is pinned to match the intended RDS engine. Local uses
`--lc-collate=C` for deterministic index ordering; **RDS must be provisioned
with the same collation**, or sorted queries can return different results in
each environment.

**Reversal cost: trivial locally** (`docker compose down -v` and rebuild).
**Non-trivial on RDS** — collation cannot be changed in place after data exists,
so it must be set correctly at provisioning time.

---

## A-009 — Editing a published listing

- **Status:** ASSUMED (conservative default)
- **Owner:** Founder / operations
- **Where:** `src/modules/experiences/lifecycle.ts` → `canEditContent`

`FR-07` names the listing states but does not say what happens when a host wants
to change a listing that is already live. Two answers are defensible and they
are a product decision rather than an engineering one:

1. **Allow the edit, and return the listing to review.** Moderation stays
   intact, but a typo correction takes a live listing offline.
2. **Allow the edit freely.** Convenient, and it means the listing a traveller
   books is not the one anybody approved.

The conservative reading is in place: a host may edit only in `DRAFT` and
`REJECTED`. A published listing must be archived, or suspended by operations,
before it can be changed.

Nothing is blocked by this today — no listing can reach `PUBLISHED` until the
operations console exists — so the decision can wait for that milestone.

**Reversal cost: trivial.** One entry in the transition table and, for option 1,
one line in `performAction`. No schema change either way.

---

## A-010 — Experience category taxonomy

- **Status:** ASSUMED
- **Owner:** Founder / content
- **Where:** `src/modules/experiences/categories.ts`, seeded by `prisma/seed.ts`

No document defines the categories. Eight are in place, derived from the launch
scope in `PROJECT.md` §4 and the editorial positioning in `DESIGN.md` §2:
culinary, heritage, wellness, adventure, wildlife, arts, voyages, celebrations.

They are needed because a listing cannot be submitted without one, and inventing
a single placeholder category would have been worse than proposing a real set.

**Reversal cost: trivial.** Categories are rows, the seed reconciles them, and a
retired category deactivates rather than deleting — `ON DELETE SET NULL` means a
listing loses its category rather than disappearing. Renaming, reordering or
replacing the whole taxonomy is an edit and a reseed.

---

## A-011 — Host KYC document collection

- **Status:** DEFERRED — nothing built
- **Owner:** Founder / legal
- **Where:** nothing; `hosts.verification_status` models the workflow only

`FR-05` requires a verification and KYC workflow. The **status** lifecycle is
built (draft → pending → verified/rejected). **No identity documents are
collected or stored.**

That is deliberate. Storing identity documents raises questions this project has
not answered: what is collected, encryption at rest, who may view it, how long
it is retained, and what the deletion obligation is. Building a document upload
before those are settled would create a personal-data liability that is
expensive to unwind.

**Reversal cost: low now, high if guessed wrong.** Adding a documents table
later is additive. Collecting documents under the wrong retention policy is a
data-protection problem, not a migration.

---

## Review

Revisit this register at the start of every phase, and whenever a founder
decision lands. A `CONFIRMED` row should not stay here: move the detail into the
owning specification and delete the row, so this file only ever lists live
uncertainty.
