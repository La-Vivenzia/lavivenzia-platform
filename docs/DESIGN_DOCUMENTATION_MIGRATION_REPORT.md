# Design Documentation Migration Report

**Date:** 2026-10-20
**Task:** Documentation governance — align brand identity, design language and
visual QA requirements across the repository
**Scope:** Documentation only. No application code, schema, API, infrastructure
or configuration was modified. Nothing was staged, committed, pushed or
deployed.

> **Outcome recorded 2026-10-20 — this report's escalation is closed.**
> The founders selected the existing **forest-green-and-ivory** identity. The
> direction described below was **rejected**; §A stands and no token changed.
> Conflicts C-1 through C-5 in §8 are all resolved in favour of the implemented
> system. This report is retained **unaltered** as the record of how the
> conflict was found and escalated — see `docs/VISUAL_IDENTITY_DECISION.md` for
> the decision itself.

---

## 1. Headline finding — the supplied brand direction was NOT applied

A brand direction was supplied on 2026-10-16:

> "THE WORLD, CONSIDERED." / "Journeys composed around you."
> Ivory `#F5F2EA` · Obsidian `#171715` · Stone `#D8D1C3`
> Forest, terracotta and bronze as restrained supporting accents.

**It contradicts the approved, implemented identity on three points, two of
them structural.** It has been recorded in full and escalated, not applied.

| Subject                                                          | Approved system (§A, 2026-09-08)                                                                          | Supplied direction                                    | Verdict                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| Neutral axis                                                     | Deep pine. Heading ink `#16261e` — green channel leads                                                    | "Obsidian `#171715`" — effectively neutral grey-black | **CONFLICT**                              |
| Role of green                                                    | `#1f4d3a` is the **primary** and carries the neutral axis                                                 | Forest demoted to "a restrained supporting accent"    | **CONFLICT**                              |
| Brand line                                                       | `brand.tagline` = "Experience Every Journey Through Its Soul", rendered in `Footer`, `Logo`, `MobileHome` | "THE WORLD, CONSIDERED."                              | **CONFLICT**                              |
| Page ground                                                      | `#f3efe7`                                                                                                 | "Ivory `#F5F2EA`"                                     | Near-identical — cosmetic, not structural |
| Third neutral                                                    | `--lv-bg-soft #ece5d8`, `--lv-surface-3 #eae1d2`                                                          | "Stone `#D8D1C3`"                                     | Compatible role, different value          |
| Typography                                                       | Cinzel (display) + Sora (UI)                                                                              | "Editorial serif + contemporary grotesk"              | **No conflict** — already satisfied       |
| Territory, personality, experience principles, anti-patterns, QA | Not previously documented                                                                                 | Supplied                                              | **No conflict — adopted in §B**           |

### Why it was not applied

`DESIGN.md` §A.2 states, in terms:

> The neutral axis is green, not brown. […] Anything that "corrects" these
> toward neutral grey breaks the identity.

`#171715` is precisely that correction. And §A's values were not chosen on
taste — they were **ported from references the founders approved**
(`public/uirefrence/`, ADR-0015), which is why the product matches those
references exactly rather than approximately.

The supplied direction arrives with no recorded founder approval. Applying it
would:

1. Invert the identity — green falls from primary and neutral axis to a
   decorative accent.
2. Overwrite a founder-approved system on the authority of a documentation task.
3. Require a re-skin of nine traveller screens and two consoles.

The task brief's own rule governs: _"resolve it only when the approved design
direction clearly supersedes the older one. Otherwise, document the conflict for
review."_ It does not clearly supersede. **Escalated for a founder decision.**

---

## 2. Canonical source of truth

**`DESIGN.md`** — repository root.

`docs/DESIGN_SYSTEM.md` was **deliberately not created.** `DESIGN.md` already
declares itself "Launch Design Source of Truth", runs to 1,358 lines, and
already covered every area the brief lists. Creating a second canonical document
would have split authority between two files — the specific failure mode this
task exists to prevent.

Structure after this task:

| Part                     | Status                                  | Contents                                                     |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| Approval block           | Current                                 | What is settled, what is open, **the unresolved conflict**   |
| §1–§3                    | Current                                 | Purpose, Brand DNA, Visual Direction                         |
| §4–§6                    | **Marked superseded**                   | Pre-approval palette and faces — historical                  |
| §7–§15                   | Current                                 | Layout, spacing, borders, radius, buttons, cards, navigation |
| **§A** (2026-09-08)      | **Authoritative for values**            | The approved, implemented system                             |
| **§B** (2026-10-20, new) | **Authoritative for expression and QA** | Brand expression, experience principles, visual governance   |

Values live in `src/app/globals.css`. §A is for reading, not for copying into
components.

---

## 3. Documents inspected

| Document                                                                         | Classification                       | Outcome                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `DESIGN.md`                                                                      | **Canonical**                        | Updated — §B added, conflict notice, supersession markers   |
| `CLAUDE.md`                                                                      | Canonical (engineering constitution) | Updated — §3 design governance                              |
| `PROJECT_STATE.md`                                                               | Canonical (living state)             | Updated — design evidence states, open decisions            |
| `DEVELOPMENT_WORKFLOW.md`                                                        | Canonical (process)                  | Updated — visual acceptance in Definition of Done           |
| `docs/UI-REFERENCE-INVENTORY.md`                                                 | **Historical**                       | Unchanged — migration record                                |
| `docs/adr/0015-approved-identity-ported-not-reinterpreted.md`                    | **Historical / decision**            | Unchanged                                                   |
| `docs/adr/0012-light-console-surfaces.md`                                        | **Historical / decision**            | Unchanged                                                   |
| `docs/SAAS_DEVELOPMENT_AUDIT.md`, `docs/SAAS_AUDIT_SUMMARY.md`                   | **Historical / audit**               | Unchanged                                                   |
| `docs/PHASE-5.1-AUDIT.md`                                                        | **Historical / audit**               | Unchanged                                                   |
| `REQUIREMENTS.md`, `PROJECT.md`, `SYSTEM_DESIGN.md`, `WIREFRAME.md`, `README.md` | Supporting                           | Unchanged — no conflicting design instruction found         |
| `docs/ASSUMPTIONS.md`, `AUTHENTICATION.md`, `DATABASE.md`, `EMAIL.md`            | Supporting, non-design               | Unchanged                                                   |
| `docs/LA-VIVENZIA-TWENTY-GAP-ANALYSIS.md`                                        | **CRM — out of scope**               | Unchanged, and explicitly not treated as SaaS documentation |

---

## 4. Documents updated, and why

### `DESIGN.md` (+236 lines)

1. **Approval block** — added the unresolved brand conflict, with a direct
   instruction that §A remains the source of truth until resolved.
2. **§4 Color System** — marked **superseded by §A.2**, historical only. Its two
   principles (centralised tokens, no arbitrary colours) explicitly still hold.
3. **§6 Typography** — marked **partly superseded by §A.3**: the pairing
   principle holds, the named faces do not.
4. **§B added** (B.0–B.12): the conflict; design territory and personality;
   brand lines (unresolved); the DISCOVER → UNDERSTAND → CURATE → PERSONALISE →
   BUILD → EXPERIENCE progression mapped to real routes with unbuilt stages
   marked **Not implemented**; AI as private concierge; one system across three
   densities; photography and art direction; iconography; motion; accessibility
   and contrast; the five states; explicit anti-patterns; visual acceptance
   criteria.

**No colour, radius, spacing or typeface value was introduced, altered or
invented.** Undocumented decisions are marked **REQUIRES VERIFICATION** rather
than filled in.

### `CLAUDE.md`

§3 "Reuse the Design System" extended to name `DESIGN.md` as canonical, forbid
restyling on taste, forbid a second design system per product area, require
visual verification, and flag the unresolved conflict. Kept short deliberately —
it points at the design system rather than duplicating it.

### `PROJECT_STATE.md`

Added "Design state, separated by evidence" distinguishing **direction
documented** / **tokens implemented** / **components implemented** / **visually
verified**, with the last recorded as **No**. Listed outstanding design work.
Added two items to the open-decisions list: resolve the brand conflict, and
visually verify the identity.

Unrelated project state, phase information and milestone records were left
untouched.

### `DEVELOPMENT_WORKFLOW.md`

One line added to Definition of Done requiring UI work to meet §B.12, noting
that the check is manual because no visual regression infrastructure exists.

---

## 5. Documents deliberately left unchanged

- **Audit reports** (`SAAS_DEVELOPMENT_AUDIT.md`, `SAAS_AUDIT_SUMMARY.md`,
  `PHASE-5.1-AUDIT.md`) — historical findings. Rewriting them to look healthier
  would destroy their value.
- **`docs/UI-REFERENCE-INVENTORY.md`** — contains `#17140f`, `#c9a84c`,
  `#faf7f2` and Montserrat, but as a **migration record** ("all gone"), not as
  active instruction. Correctly historical.
- **ADRs** — decision records are immutable by convention.
- **`REQUIREMENTS.md`, `WIREFRAME.md`, `SYSTEM_DESIGN.md`, `PROJECT.md`** —
  inspected; no conflicting design instruction found. Nothing to reconcile.
- **`docs/LA-VIVENZIA-TWENTY-GAP-ANALYSIS.md`** — CRM, a different product.

---

## 6. Implementation evidence

Assessed without changing anything, using the brief's categories:

| #   | Category                            | Finding                                                                                                                         | Evidence                                                                                                                                             |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Design direction documented**     | **Yes**                                                                                                                         | `DESIGN.md` §A + §B                                                                                                                                  |
| 2   | **Design tokens implemented**       | **Yes**                                                                                                                         | `globals.css:59–83` — `--lv-bg #f3efe7`, `--lv-heading #16261e`, `--lv-primary #1f4d3a`, `--lv-accent #d4af37`, CTA inversion present                |
| 3   | **Shared components implemented**   | **Yes**                                                                                                                         | `SiteShell`, `DesktopHeader`/`MobileHeader`, `Footer`, `BottomNavigation`, `ProfileButton`, `PageHeader`, one `Button`, `feedback.tsx`, `status.tsx` |
| 4   | **Page-level design implemented**   | **Yes, per record — not independently confirmed**                                                                               | Nine traveller screens + two consoles documented in the 2026-09-08 milestone. This task did not render them                                          |
| 5   | **Visually verified**               | **NO**                                                                                                                          | The application was **not opened**. No browser inspection was performed in this task                                                                 |
| 6   | **Not implemented**                 | The 2026-10-16 direction; personalisation, itinerary and in-trip stages of §B.3; automated contrast checking; visual regression | —                                                                                                                                                    |
| 7   | **Unknown / insufficient evidence** | Responsive behaviour at real breakpoints; `prefers-reduced-motion`; host media standards                                        | No test infrastructure exists to establish them                                                                                                      |

### Typography and theming, confirmed

- Cinzel + Sora loaded via `next/font` in `src/app/layout.tsx` — self-hosted at
  build time, no external request.
- Two axes (light/dark × green/blue) stamped before first paint by
  `themeInitScript` in `src/lib/theme-init.ts`.

### Design QA infrastructure — the significant gap

| Capability                                                       | Status                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Token-bypass guard                                               | **Partial** — `tests/unit/button-variants.test.ts`, buttons only |
| Visual regression (Playwright / Percy / Chromatic / screenshots) | **None**                                                         |
| Responsive / breakpoint tests                                    | **None**                                                         |
| Automated contrast checking                                      | **None**                                                         |
| Any test asserting a colour value                                | **None**                                                         |

Items 1–8 of §B.12 are therefore manual, and only item 4 has automated backing.

---

## 7. UI verification still required

None of the following was performed in this task:

1. Open each traveller screen and both consoles and inspect them.
2. Verify all four mode × palette combinations render correctly.
3. Verify 390 / 768 / 1024 / 1440 on real devices or a device emulator.
4. Verify loading, empty, error, success and disabled states on every
   data-bearing surface.
5. Verify focus order and visible focus by keyboard, in all four combinations.
6. Verify contrast against WCAG AA, especially gold-on-light
   (`--lv-accent-ink` exists because `--lv-accent` fails).
7. Verify `prefers-reduced-motion` is honoured.
8. Verify image cropping holds at the narrowest breakpoint.

**Documentation describing a design is not evidence that the application
implements it.** This repository's own history is the argument: four consecutive
milestones produced defects found only by opening the running product.

---

## 8. Conflicts requiring human review

| #       | Conflict                                                                                                                         | Severity   | Needed                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| **C-1** | Neutral axis — green (§A) vs "Obsidian `#171715`"                                                                                | **High**   | Founder decision. Adopting the latter inverts the identity and triggers a full re-skin |
| **C-2** | Role of green — primary (§A) vs supporting accent                                                                                | **High**   | Same decision as C-1; they stand or fall together                                      |
| **C-3** | Brand line — "Experience Every Journey Through Its Soul" (implemented in 3 surfaces + logo alt text) vs "THE WORLD, CONSIDERED." | **Medium** | Founder decision. A copy change in code, but a brand decision in substance             |
| **C-4** | Page ground `#f3efe7` vs `#F5F2EA`; `Stone #D8D1C3` vs existing soft neutrals                                                    | **Low**    | Only meaningful if C-1 is resolved in favour of the new direction                      |
| **C-5** | Supplied accents "terracotta, bronze" have no token and no approved spec                                                         | **Low**    | Do not invent. Needs a specification before any token exists                           |

**Unresolved and deliberately not invented:** host media standards (resolution,
aspect ratios, compression) — §B.6 marks these REQUIRES VERIFICATION.

---

## 9. Git status — before and after

**Before**

```
branch main · HEAD aeff6d7 · level with origin/main
79 untracked · 36 modified · 1 renamed  = 116 paths   (1 pre-existing staged entry)
```

**After**

```
branch main · HEAD aeff6d7 · level with origin/main
79 untracked · 38 modified · 1 renamed  = 118 paths   (+ this report = 119)
```

**Delta — exactly two newly-modified files, both Markdown:**

```
+ M CLAUDE.md
+ M DEVELOPMENT_WORKFLOW.md
```

`DESIGN.md` and `PROJECT_STATE.md` were **already modified before this task** and
remain modified; this task added to them without discarding the pre-existing
uncommitted changes.

**Safety confirmations:**

- `HEAD` unchanged (`aeff6d7`). Branch unchanged (`main`).
- Nothing staged, committed, pushed, reset, stashed, cleaned or reverted.
- The one pre-existing staged entry (`src/app/sign-out/route.ts`) was left as it
  was found.
- `find src prisma tests public .github -mmin -120` returned **nothing** — no
  application code, schema, test, asset or CI file was touched.
- No infrastructure, deployment, AWS or Cloudflare action was taken.
- No secret value was read or printed.
- No existing user work was overwritten; all edits were additive or were
  supersession markers that preserve the original text.
