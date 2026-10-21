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

- **Status:** CLOSED — the founders approved the identity on 2026-09-08
- **Owner:** Founder / design
- **Where:** `src/app/globals.css`

The numeric token layer now exists: palette, radius scale, elevation, container
width and the type pairing. `DESIGN.md` described these in prose only, which is
why no UI could be built without inventing values inside components.

ADR-0012 records the one substantive deviation — light working surfaces with
dark anchors, in place of the all-dark direction in `DESIGN.md` §3 — and it
still holds; the anchor simply changed hue.

**The identity is now approved and implemented** (`DESIGN.md` §A,
`docs/UI-REFERENCE-INVENTORY.md`). The bet this row recorded paid off exactly as
intended: because colour lived only in `globals.css`, adopting the approved
palette across nine traveller screens and two consoles was a token change, not a
rebuild. This row can be deleted at the next review.

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

**This is now live rather than hypothetical.** The operations console exists and
listings do reach `PUBLISHED`, so a host with a live listing genuinely cannot
correct a typo without archiving it. Worth settling before traveller discovery
ships: a traveller-visible listing a host can silently change is a different
product from one that cannot.

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

## A-012 — Multi-factor reset for a locked-out operator

- **Status:** DEFERRED — nothing built
- **Owner:** Founder / operations
- **Where:** nothing; `beginMfaEnrolment` refuses a second enrolment

An operations account requires TOTP, and `beginMfaEnrolment` refuses to issue a
second secret. That is deliberate — re-enrolment on a live session is exactly
how an attacker who has stolen one would swap the second factor — but it means
an operator who loses their authenticator cannot get back in.

Resetting one is an audited admin action, and who may perform it is a policy
question rather than an engineering one: another super admin, two of them, or
an out-of-band identity check. Until that is answered the recovery is a
database intervention by someone with credentials.

**Reversal cost: low.** Adding a reset is additive — one service method, one
permission, one audit action. Choosing the wrong policy is the expensive part,
which is why it is not being guessed.

---

## A-013 — Destinations are derived, not stored

- **Status:** ASSUMED — working default in place
- **Owner:** Founder / content
- **Where:** `src/adapters/persistence/prisma/discovery-repositories.ts`

`REQUIREMENTS.md` §5 lists `Destination` among the core entities and there is a
`destination:manage` permission for content admins, but no destination table
exists. Rather than invent one, destinations are **derived** from the distinct
`experiences.city` values that currently have something published, with the slug
computed by `slugify(city)`.

That is deliberate. A destination entity is mostly editorial — a description, a
hero image, a curated order, perhaps a guide — and every one of those is content
somebody has to write. Creating the table now would mean either seeding invented
copy or shipping a table of empty rows.

Two consequences worth knowing:

- A destination exists only while it has published listings, so there is no
  empty destination page to land on.
- City names are not globally unique. Two cities sharing a name would collapse
  into one destination. Harmless India-first; it needs the real entity before
  the platform is multi-country.

**Reversal cost: low.** Adding a `Destination` table later is additive, and the
slug shape can be preserved so existing links keep working. Nothing depends on
destinations being derived except the two queries that derive them.

---

## A-014 — Price filtering assumes a single currency

- **Status:** ASSUMED — working default in place
- **Owner:** Founder
- **Where:** `src/modules/discovery/service.ts` → `optionalPrice`

The discovery price filter reads the query string as major units and converts to
minor units using INR. Listings carry their own `currency`, so a catalogue with
more than one would be filtered against a number that means different things per
row.

Correct while the platform is India-only. What the right behaviour is for a
multi-currency catalogue — convert at a rate, filter per currency, or ask the
traveller which currency they are thinking in — is a product decision.

**Reversal cost: low.** One function, and the filter is not persisted anywhere.

---

## A-015 — Coordinate precision and location privacy

- **Status:** ASSUMED — working default in place
- **Owner:** Founder / legal
- **Where:** `src/modules/discovery/geo.ts`

A traveller who uses "Use my location" hands the browser a device position, and
that position then travels in the query string of a URL they can share or
bookmark. Coordinates are rounded to six decimal places — roughly 11 cm, and
what `Decimal(9,6)` stores anyway — before they are used or echoed back.

The rounding is deliberate on two counts. Beyond six places the extra digits are
noise, and an un-rounded GPS fix is a high-entropy identifier: pasting one into
a shared link discloses a person more precisely than the search needed.

What is **not** decided: whether device coordinates should appear in a shareable
URL at all, how long they may sit in access logs, and whether a coarser grid
(three decimal places, ~110 m) should be used for the shareable form while the
precise value is used only for the query. Those are privacy-policy questions
with a legal dimension, not engineering ones.

**Reversal cost: low.** One constant and one function, and no coordinate from a
device is persisted anywhere.

---

## A-016 — Search relevance weights

- **Status:** ASSUMED — working default in place
- **Owner:** Founder / content
- **Where:** `src/adapters/persistence/prisma/discovery-repositories.ts`

Keyword results are ranked by trigram similarity, weighted by where the match
occurred: title 1.0, summary 0.6, city 0.5, host name 0.4, plus 0.5 when the
term appears verbatim in the title. The fuzzy-match threshold is 0.4.

These are a ranking heuristic, not a business rule, and they are recorded here
only so that nobody mistakes them for one. Changing them changes result order
and nothing else — no pricing, no visibility, no policy. They were chosen so
that a title match outranks a host-name match, and validated against the
integration suite rather than against traveller behaviour, which does not exist
yet.

**Reversal cost: none.** Five constants in one object.

What would replace them: search analytics (FR-19), once there is click-through
data to tune against. Until then, tuning them further would be guessing with
extra steps.

---

## Review

Revisit this register at the start of every phase, and whenever a founder
decision lands. A `CONFIRMED` row should not stay here: move the detail into the
owning specification and delete the row, so this file only ever lists live
uncertainty.
