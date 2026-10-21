# Phase 5.1 — gap matrix against the master strategy

The audit that Phase 5.1 was built from. Every requirement in official Phases 0
through 5, what the repository actually had on 2026-09-01, and what was done.

Kept as a document rather than discarded, because the interesting column is the
last one: several rows read "complete" only because the work was done ahead of
its official phase, and a reader comparing the roadmap to the codebase needs to
know that rather than rediscover it.

Legend: **Complete** · **Partial** · **Missing** · **Deferred** (a decision is
outstanding) · **Early** (built before its official phase).

---

## Phase 0 — Architecture & Project Foundation

| Requirement           | Before                                                     | Verdict  | Action     |
| --------------------- | ---------------------------------------------------------- | -------- | ---------- |
| Repository foundation | Git, Node 22, Next 16, TS 5.9.3 pinned, Tailwind 4         | Complete | None       |
| Environment strategy  | Zod, split build-safe vs runtime invariants (ADR-0009)     | Complete | None       |
| Secrets handling      | No secrets in source; redaction by path in the logger      | Complete | None       |
| Git / CI              | Two jobs: verify gate; migrations + seed + integration     | Complete | None       |
| Testing               | Unit suite runs with **no environment variables at all**   | Complete | None       |
| Error handling        | One `AppError` hierarchy (ADR-0006)                        | Complete | None       |
| Logging               | pino, correlation IDs via `AsyncLocalStorage`              | Complete | None       |
| Database / migrations | Prisma 7 + pg adapter; five migrations; drift check in CI  | Complete | None       |
| Worker / background   | pg-boss verified against a live database (ADR-0001)        | Complete | None       |
| Architecture docs     | SYSTEM_DESIGN, 14 ADRs, enforced module boundary           | Complete | Updated §6 |
| PROJECT_STATE         | Present, but phase-numbered from conversation, not roadmap | Partial  | Rewritten  |
| Database docs         | Present; no coverage of trigram or spatial reads           | Partial  | Extended   |

**Nothing in Phase 0 was rebuilt.** The two Partial rows were documentation
drift, not missing infrastructure.

---

## Phase 1 — Design System & UI Foundation

| Requirement         | Before                                         | Verdict  | Action |
| ------------------- | ---------------------------------------------- | -------- | ------ |
| Design tokens       | `globals.css` `@theme` layer (ADR-0012)        | Complete | None   |
| Typography scale    | Display/body pairing, defined sizes            | Complete | None   |
| Spacing             | Tailwind scale, container width token          | Complete | None   |
| Colours             | Full palette, semantic aliases                 | Complete | None   |
| Borders / radii     | Radius scale, line tokens                      | Complete | None   |
| Semantic colours    | Status, danger, warning, success               | Complete | None   |
| Elevation           | Shadow scale                                   | Complete | None   |
| Breakpoints         | Tailwind defaults, used consistently           | Complete | None   |
| Interaction states  | Hover, focus-visible, disabled on all controls | Complete | None   |
| Reusable components | Button, Field, Alert, EmptyState, Skeleton, …  | Complete | None   |

**Technically coherent; brand-pending.** The token layer is real and centralised,
which is the Phase 1 requirement. What has _not_ happened is founder approval of
the new moodboard, so the current palette and typography are a working system
rather than the final identity.

Phase 5.1 deliberately changed nothing visual. The architecture for replacing it
is already in place and unchanged: colours exist only in `globals.css`, every
listing renders through one `ExperienceCard`, and every console screen sits in
one shell — so a visual pass is a token and component change, not a rebuild.
Recorded in PROJECT_STATE under "Replacing the design system".

---

## Phase 2 — Public Website & Discovery

| Requirement              | Before                                  | Verdict      | Action                                          |
| ------------------------ | --------------------------------------- | ------------ | ----------------------------------------------- |
| Homepage                 | Built (early — official Phase 2)        | Complete     | Interest rail now links to category pages       |
| Destination pages        | `/destinations`, `/destinations/[slug]` | Complete     | Cover query made O(cities) not O(catalogue)     |
| City pages               | Same as destinations (A-013)            | Complete     | None                                            |
| Experience listing pages | `/experiences` with filters             | Complete     | Location filter and two sort orders added       |
| Experience detail pages  | `/experiences/[slug]`                   | Complete     | Location panel added                            |
| **Category pages**       | Only a `?category=` query parameter     | **Missing**  | **Built `/categories` and `/categories/[key]`** |
| Curated collection pages | None                                    | **Deferred** | See below                                       |
| Search interface         | Homepage box and filter form            | Complete     | Location control added                          |
| Navigation               | Header with two links                   | Partial      | Categories added to header and footer           |
| Footer                   | Built                                   | Complete     | Categories added                                |
| Responsive mobile        | Built and checked                       | Complete     | New controls follow the same grid               |

**Curated collections are deferred, not skipped.** A collection is editorial —
a title, a rationale, a hand-picked order, usually a piece of writing. Building
the table now means either seeding invented copy or shipping empty rows, which is
the same reasoning that keeps destinations derived (A-013). The engineering is
small when the content decision lands: a collection is a saved filter plus
editorial copy, and `/categories/[key]` is already that shape minus the copy.

---

## Phase 3 — Authentication & User Profiles

| Requirement                | Before                                          | Verdict          | Action                                                              |
| -------------------------- | ----------------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| Traveller authentication   | Backend complete and tested; **no way in**      | **Partial**      | **Built `/sign-in` traveller path and `/join`**                     |
| Social login               | None                                            | Deferred         | Google OAuth is its own flow; not launch-blocking                   |
| Traveller profile          | None                                            | Deferred         | No `TravellerProfile` table; nothing to show yet                    |
| Traveller preferences      | None                                            | Deferred         | Meaningful once there is something to personalise                   |
| Wishlist                   | None                                            | Deferred         | Phase 3 in the roadmap; needs a product decision on anonymous saves |
| Saved itineraries          | None                                            | Deferred         | Phase 9                                                             |
| Booking history foundation | None                                            | Deferred         | **Correctly** — no bookings exist to have a history of              |
| Host registration          | `/become-a-host`, password + role               | Complete (early) | None                                                                |
| Host verification / KYC    | Status lifecycle built; documents not collected | Partial          | Documents blocked on A-011 (encryption at rest, retention)          |
| RBAC                       | 6 roles, 38 permissions, 82 grants (ADR-0005)   | Complete (early) | None                                                                |
| Admin authentication       | Password + mandatory TOTP, QR enrolment         | Complete (early) | None                                                                |
| Consent / privacy prefs    | None                                            | Deferred         | Needs the privacy policy that does not exist yet                    |

**The traveller gap was the significant finding of this audit.** Every endpoint
existed — register as a traveller, request a code, verify it, issue a session —
and each was covered by integration tests. No page called any of them.
`/sign-in` collected a password, which a traveller does not have, so the header
link was a dead end, and an already-signed-in traveller was redirected into a
host console they cannot enter.

This is the same class of defect as the soft 404 and the invisible hero button
earlier in this project: **correct components, unreachable product.** No
rendering test can see it. `tests/unit/route-structure.test.ts` now asserts
reachability rather than rendering, which is the property that was missing.

---

## Phase 4 — Host & Inventory Management

| Requirement                   | Before                                  | Verdict  | Action                                          |
| ----------------------------- | --------------------------------------- | -------- | ----------------------------------------------- |
| Host onboarding               | Profile, completeness, submission       | Complete | None                                            |
| Experience creation / editing | Full editor, draft lifecycle            | Complete | None                                            |
| Media management              | Magic-byte validated uploads (ADR-0013) | Complete | None                                            |
| Location management           | Address, city, region, lat/lng          | Complete | Coordinates now actually drive search           |
| Pricing                       | `base_price_minor`, currency, unit      | Complete | Deliberately no fee, tax or commission          |
| Capacity, duration            | Min/max guests, duration minutes        | Complete | None                                            |
| Age / group rules             | Guest range and free-text notes         | Partial  | A structured age policy is a product decision   |
| Availability foundation       | None                                    | Deferred | Phase 6 — availability is what booking books    |
| Inclusions / exclusions       | String arrays, rendered verbatim        | Complete | None                                            |
| Meeting points                | Address only                            | Deferred | A precise meeting point belongs after a booking |
| Policies / cancellation       | None                                    | Deferred | Blocked on A-004                                |
| Booking cut-offs              | None                                    | Deferred | Phase 6                                         |
| Draft → review → published    | Full lifecycle with a decision table    | Complete | None                                            |
| Duplicate / quality checks    | Readiness assessment before submission  | Partial  | Duplicate detection needs a product rule        |

**No booking was implemented,** as instructed. Every deferred row above is either
a Phase 6 dependency or blocked on a founder decision recorded in
`docs/ASSUMPTIONS.md`.

---

## Phase 5 — Search, Maps & Location (the official phase)

| Requirement                | Before                                              | Verdict      | Action                                                  |
| -------------------------- | --------------------------------------------------- | ------------ | ------------------------------------------------------- |
| Keyword search             | `contains` over four columns, unranked              | **Partial**  | Trigram matching with misspelling tolerance             |
| Structured filters         | Category, destination, price, duration              | Complete     | None                                                    |
| Sorting                    | Four orders, none relevance- or distance-based      | **Partial**  | Added `relevance` and `distance`; both imply themselves |
| Location search            | None                                                | **Missing**  | Built, with autocomplete                                |
| Autocomplete               | None                                                | **Missing**  | Built, debounced and rate limited                       |
| Geocoding                  | Port defined; adapter threw `NotImplementedError`   | **Missing**  | Google Places adapter, plus a catalogue provider        |
| Nearby discovery           | None. `geo` column existed and **no query read it** | **Missing**  | `ST_DWithin` on the GiST-indexed column                 |
| Distance-based results     | None                                                | **Missing**  | `ST_Distance` in metres, surfaced on cards              |
| Google Maps integration    | Stub                                                | **Missing**  | Real adapter behind the existing port                   |
| Relevance ranking          | None                                                | **Missing**  | Weighted `word_similarity` (A-016)                      |
| Semantic search foundation | `EmbeddingsPort` only                               | **Deferred** | Unchanged — see below                                   |
| Embeddings                 | Adapter refuses to guess a provider                 | **Deferred** | Unchanged                                               |
| Vector retrieval           | No vector column                                    | **Deferred** | Unchanged                                               |

**This is where nearly all the real gap was.** PostGIS had been enabled in the
first migration (ADR-0008) precisely so that nearby discovery would not require
a retrofit, the `geo` column was generated and GiST-indexed correctly — and no
query had ever read it. `pg_trgm` was installed and unused. The foundation was
laid and never built on.

**Semantic retrieval stayed deferred deliberately.** The embeddings provider is
unresolved (ADR-0007, A-006) and the chosen model fixes the pgvector dimension,
so no vector column may be added. The abstraction that the instruction asks for
already exists as `src/ports/embeddings.ts`; writing a further composition layer
against an unknown dimension would be speculation, and `PROJECT.md` §3 forbids
building before the requirement exists. ADR-0014 records exactly where the
semantic arm attaches — two functions in one repository file — so the deferral
costs a small, known amount of work rather than a redesign.

---

## Defects found by walking the product

Three, none visible to the test suite before it was extended:

1. **A fractional SQL parameter typed as an integer.** The relevance weights
   reached PostgreSQL as integer parameters and every keyword search failed with
   `22P02 invalid input syntax for type integer: "0.5"`. Found by the new
   integration tests. Fixed with explicit `::real` casts.

2. **A `"use client"` module exporting a plain array.** `/experiences` returned
   HTTP 500 with `RADIUS_CHOICES_KM.filter is not a function`: across the RSC
   boundary a non-component export arrives as a client-reference proxy, not an
   array. Type-checked, linted and unit-tested clean; only a real request found
   it. The constant moved into the domain, and
   `tests/unit/client-boundary.test.ts` now fails on the shape.

3. **A sort control that described itself incorrectly.** With a location and no
   explicit sort, results were ordered nearest-first while the control read
   "Best match". The label now asks `resolveSort` rather than restating the rule.

A performance defect was also fixed rather than found by failure: destination
covers selected _every_ published listing in the listed cities and picked one per
city in JavaScript. `DISTINCT ON` now returns one row per city.
