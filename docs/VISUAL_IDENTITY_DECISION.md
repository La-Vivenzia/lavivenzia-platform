# Visual Identity — Decision Document

**Date:** 2026-10-20 · **Decided:** 2026-10-20
**Purpose:** Compare the founder-approved identity now in production code with
the proposed 2026-10-16 direction, so the founders can decide between them on
evidence.
**Status:** ✅ **DECIDED — Option A.** No code, token, asset or infrastructure
has been changed.

---

## DECISION — Option A, forest green and ivory (founder-approved, 2026-10-20)

**La Vivenzia remains a forest-green-and-ivory brand, refined through
luxury-editorial design rather than replaced by an ink-led identity.**

The founders selected Option A. The comparison in §1–§7 below is **retained
unchanged as the evidence behind that decision** — it is the record of what was
weighed, not a live proposal.

| Subject            | Approved outcome                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Primary identity   | **Forest green + ivory**                                                                           |
| Green              | **Remains the primary brand colour and the green-based neutral axis.** Not demoted to an accent    |
| Ivory              | **`#F3EFE7` retained** — the value already implemented as `--lv-bg`                                |
| Dark neutral       | **`#16261E` retained** (implemented as `--lv-heading`). Obsidian `#171715` is **rejected**         |
| Gold               | **Preserved**, including the existing logo artwork and its brand treatment                         |
| Tagline            | **"Experience Every Journey Through Its Soul" retained.** "THE WORLD, CONSIDERED." is **rejected** |
| Terracotta, bronze | **Not introduced.** No unapproved colour values enter the system                                   |

**Retained from the proposed direction**, because none of it required the
palette change: generous whitespace, editorial typography, authentic travel
photography, restrained motion, accessibility discipline, and consistent design
tokens. These live in `DESIGN.md` §B and are unaffected by this decision.

**Unchanged pending separate review:** the green/blue palette toggle and
dark-mode behaviour. The founders did not review these, so they stay exactly as
they are.

**Consequence for the codebase: none required.** Option A is what the code
already implements. No re-skin, no asset re-cut, no token migration. The only
change this decision invites is the accessibility correction in §7.1, which is a
defect fix rather than a brand change.

---

## 0. The decision in one page

The proposed direction is **not a repaint of the existing one.** It changes what
the identity is built on.

|                 | Approved (in code today)                                | Proposed (2026-10-16)                                             |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Organising idea | A **green** house — the neutral axis itself is pine     | A **neutral** house — ivory and near-black, with colour as accent |
| Green's role    | Primary, CTA, borders, panels, **and the neutral axis** | "A restrained supporting accent"                                  |
| Tagline         | "Experience Every Journey Through Its Soul"             | "THE WORLD, CONSIDERED."                                          |
| Provenance      | Ported from founder-approved references (ADR-0015)      | Supplied as a written brief                                       |

**Three measured facts that should shape the decision:**

1. **The grounds are effectively identical.** `#f3efe7` → `#F5F2EA` is a
   **1.03:1** contrast ratio, a 2.3% luminance shift. Nobody will see it. The
   ivory is not the change.
2. **The ink change is a hue change, not a legibility change.** `#16261e` →
   `#171715` is **1.14:1** between them; both land 14–16:1 on the ground. What
   changes is that green stops leading the neutral.
3. **The current system has two live WCAG AA failures** (§7). A migration is an
   opportunity to fix them. Staying put is not a reason to leave them.

**The real question is not "which palette."** It is: _is La Vivenzia a green
brand with ivory, or an ivory-and-ink brand with green as an accent?_ Everything
else follows.

---

## 1. Colour palettes — exact values

### 1.1 Approved, as implemented

Source of truth: `src/app/globals.css`. Four combinations ship: light/dark ×
green/blue. Green is the default; blue is a second approved skin reached by
`?palette=blue` and **toggled in the header UI** (`PaletteToggle`, mounted in
`DesktopHeader` and `MobileHeader`).

**Green · light** (`:root`)

| Role                   | Token               | Hex                    |
| ---------------------- | ------------------- | ---------------------- |
| Page ground            | `--lv-bg`           | `#f3efe7`              |
| Editorial band         | `--lv-bg-soft`      | `#ece5d8`              |
| Card surface           | `--lv-surface`      | `#fcfaf6`              |
| Chips, wells           | `--lv-surface-2`    | `#eae1d2`              |
| Pressed chip           | `--lv-surface-3`    | `#e2d8c6`              |
| Border                 | `--lv-border`       | `rgb(31 77 58 / 0.12)` |
| Heading                | `--lv-heading`      | `#16261e`              |
| Body                   | `--lv-fg`           | `#1a1a1a`              |
| Muted                  | `--lv-fg-muted`     | `#6b6660`              |
| Subtle                 | `--lv-fg-subtle`    | `#8c8579`              |
| **Primary**            | `--lv-primary`      | `#1f4d3a`              |
| Primary soft           | `--lv-primary-soft` | `#6b846f`              |
| **Accent (logo gold)** | `--lv-accent`       | `#d4af37`              |
| Gold for text          | `--lv-accent-ink`   | `#9a7a2e`              |
| CTA                    | `--lv-cta`          | `#1f4d3a`              |
| CTA hover              | `--lv-cta-hover`    | `#163a2b`              |
| CTA label              | `--lv-cta-fg`       | `#f6f3ec`              |
| Focus ring             | `--lv-ring`         | `#1f4d3a`              |
| Panel                  | `--lv-panel`        | `#1f4d3a`              |

**Green · dark** (`:root.dark`)

| Role         | Hex                                                   |
| ------------ | ----------------------------------------------------- |
| Page ground  | `#0d1611`                                             |
| Card surface | `#15221a`                                             |
| Heading      | `#f5f1e8`                                             |
| Body         | `#f3efe7`                                             |
| Primary      | `#2c6b4f`                                             |
| Accent gold  | `#d4af37`                                             |
| **CTA**      | `#cba94e` — _gold on pine; the CTA inverts by ground_ |
| Panel        | `#132b1e`                                             |

**Blue · light / dark** (`[data-palette="blue"]`) — same ivory ground
`#f3efe7`; primary `#1b3b66` light, `#2f5c8f` dark; dark ground `#0a1524`.

**Console vocabulary** — a second, deliberate set of **49 `--color-*` tokens**
serving the host and admin consoles (`--color-canvas #f3efe7`,
`--color-ink #0d1611`, `--color-gold #9a7a2e`, …). §A.6 records why the two
vocabularies are not merged.

**Totals: 105 `--lv-*` declarations + 49 `--color-*` declarations.**

### 1.2 Proposed

| Role given        | Name       | Hex                   |
| ----------------- | ---------- | --------------------- |
| Ground            | Ivory      | `#F5F2EA`             |
| Ink               | Obsidian   | `#171715`             |
| Secondary neutral | Stone      | `#D8D1C3`             |
| Accent            | Forest     | **no value supplied** |
| Accent            | Terracotta | **no value supplied** |
| Accent            | Bronze     | **no value supplied** |

**Three accent colours are named without values.** They are not invented here.
Until specified, the proposal cannot be implemented — there is no CTA colour, no
focus ring, no link colour, and no error/success hue.

**The proposal is also silent on:** dark mode (though Obsidian maps naturally to
a dark ground), the green/blue palette axis that currently ships and is
user-toggleable, the 49 console tokens, and the gold that the logo is made of.

---

## 2. Colour roles compared

| Role                  | Approved                                                                           | Proposed                               | Assessment                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Neutral axis**      | Green-leaning. `#16261e` ink, borders are `rgb(31 77 58 / …)` — green at low alpha | Neutral. `#171715`                     | **The substantive change.** Borders, shadows and ink currently carry green; they would become achromatic |
| **Primary**           | `#1f4d3a` — CTA, ring, panel                                                       | Forest, "restrained supporting accent" | **Demotion.** Needs a replacement primary; none supplied                                                 |
| **Secondary surface** | `#ece5d8` / `#eae1d2`                                                              | Stone `#D8D1C3`                        | Compatible role, darker value. **Stone on Ivory is 1.36:1 — dividers and surfaces only, never text**     |
| **Accent**            | Gold `#d4af37` — it is the logo                                                    | Bronze (unspecified)                   | If gold goes, **the logo assets must be re-cut**                                                         |
| **CTA**               | Inverts by ground: green on ivory, gold on pine                                    | Unspecified                            | A gap, not a difference                                                                                  |

---

## 3. Tagline

|                 | Value                                                                   | Where it lives                                                                                                             |
| --------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Implemented** | "Experience Every Journey Through Its Soul"                             | `src/data/` → `brand.tagline`, rendered by `Footer.tsx`, `MobileHome.tsx`, and used as the logo's `alt` text in `Logo.tsx` |
| **Proposed**    | "THE WORLD, CONSIDERED." + support line "Journeys composed around you." | —                                                                                                                          |

**Assessment.** The proposed line is tighter and better suited to the editorial
territory; the existing line is longer and reads closer to marketing copy. This
is a brand judgement, not a technical one — but note it is a **three-surface
code change plus alt text**, which is small.

**Pre-existing defect, independent of the decision:**
`src/components/ui/wordmark.tsx` records that the supplied lockup artwork has a
**misspelled tagline** ("Joumey", "Th1ough"), which is why only the pin is used
and never the full lockup. **Whichever line wins, the artwork must be re-cut** —
ideally as SVG, which would also fix the baked-in glow that makes the current
asset dark-surface-only.

---

## 4. Typography and layout

### Typography — **no conflict**

|           | Approved                     | Proposed               |
| --------- | ---------------------------- | ---------------------- |
| Display   | **Cinzel** (serif, capitals) | "Editorial serif"      |
| UI / body | **Sora** (grotesk)           | "Contemporary grotesk" |

The implemented pairing already satisfies the proposal. Loaded via `next/font`
in `layout.tsx`, self-hosted at build time. **No font change is required, and
none should be made without licence review.**

### Layout — **largely no conflict**

Generous whitespace, editorial composition, fine rules and a clear hierarchy are
already in `DESIGN.md` §7–§15 and implemented. Two points worth noting:

- **Shape.** The approved system is emphatic: `--radius-pill 999px` on every
  button and chip, consoles included — §A.4 calls it "the strongest shape signal
  in the approved design." The proposal's "quiet luxury" territory often implies
  squarer geometry. **If the proposal intends a shape change, it must say so**;
  it currently does not, and pills would survive the palette change untouched.
- **Intentional asymmetry** is called for by the proposal and is only partly
  realised today.

---

## 5. What it would look like, by surface

### Traveller experience — highest visual impact

Today the traveller surfaces read as a **green house**: pine panels, green CTAs
on ivory, gold accents, green-tinted borders, and a dark mode that is deep pine
with gold calls to action.

Under the proposal they become **ivory and near-black with restrained accent
colour**. Concretely:

- `Hero` / `DesktopHero` — the scrim and overlay type lose their green cast.
- CTAs change from `#1f4d3a` green to an unspecified accent. **This is the
  single most visible change in the product.**
- `ExperienceCard`, `DestinationCard` — green-tinted borders become achromatic;
  the gold "from ₹…" accent depends on whether gold survives.
- Dark mode flips from deep pine `#0d1611` to Obsidian `#171715` — the mode
  people will describe as "it lost its colour."
- `PaletteToggle` — **the green/blue switch in the header stops making sense**
  if green is demoted. Either it is removed or the proposal must define what the
  second skin becomes.

### Host console — moderate impact

`src/components/host/shell.tsx` plus `/host`, `/host/profile`,
`/host/experiences`, `/host/experiences/[id]`, `/host/experiences/[id]/preview`,
`/become-a-host`. These run on the 49 `--color-*` console tokens, whose
`--color-ink` and `--color-gold` would both shift. Status badges and the
verification lifecycle rely on colour and must be re-checked against §B.9 (colour
must never carry status alone).

### Admin / operations console — moderate impact, highest risk of harm

`src/components/ops/shell.tsx`, `ops/filters.tsx`, plus `/ops`,
`/ops/experiences`, `/ops/experiences/[id]`, `/ops/hosts`, `/ops/hosts/[id]`.

ADR-0012 is directly relevant and should not be overturned casually: the
decision to use **light working surfaces with dark anchors** came from watching
an operator read a review queue for an hour on a near-black background. A move
toward Obsidian must not quietly reverse that. **Densest screens, longest
dwell time, most fatigue risk.**

---

## 6. Exact change surface

**The token architecture holds.** Only **5 files** in the entire repository
contain a literal hex, and 4 are legitimate:

| File                                           | Hex use                                              | Action                                            |
| ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| `src/app/globals.css`                          | The token source — 105 `--lv-*` + 49 `--color-*`     | **The main edit.** A re-skin is concentrated here |
| `src/app/layout.tsx`                           | `theme-color` meta `#f3efe7` / `#0d1611`             | 2 values                                          |
| `src/components/ThemeProvider.tsx`             | Per-palette ground map                               | 4 values                                          |
| `src/components/PaletteToggle.tsx`             | Swatches `#2f7355` / `#2f5c8f`                       | 2 values — or the component is removed            |
| `src/modules/notifications/email-templates.ts` | 4 inline values — **email cannot use CSS variables** | 4 values, must be hand-kept in sync               |

**No component carries its own colour.** `tests/unit/button-variants.test.ts`
enforces this for buttons.

**Assets that bake colour in and would need re-cutting:**

| Asset                         | Size   |
| ----------------------------- | ------ |
| `public/logo-lavivenzia.png`  | 247 KB |
| `public/logo-mark.png`        | 69 KB  |
| `public/brand/mark.png`       | 67 KB  |
| `src/app/icon.png`            | 227 KB |
| `src/app/opengraph-image.jpg` | 174 KB |
| `src/app/twitter-image.jpg`   | 174 KB |

**Screens affected: all 21.** **Components affected: 49** — through tokens, not
individually.

**Honest scale.** If gold and the pill shape survive and only the neutral axis
and primary change, this is **one CSS file, four small files, six assets, and a
full visual re-verification**. It is not a rebuild. The expensive part is not
the edit — it is proving nothing broke across 21 screens × 4 theme combinations,
with no automated help.

---

## 7. Risks, accessibility, regression

### Accessibility — measured, not asserted

**Existing system, green · light, against `#f3efe7`:**

| Token                 | Hex       | Ratio    | Verdict                               |
| --------------------- | --------- | -------- | ------------------------------------- |
| `--lv-fg`             | `#1a1a1a` | 15.18    | PASS                                  |
| `--lv-heading`        | `#16261e` | 13.77    | PASS                                  |
| `--lv-primary`        | `#1f4d3a` | 8.40     | PASS                                  |
| `--lv-fg-muted`       | `#6b6660` | 4.96     | PASS                                  |
| **`--lv-accent-ink`** | `#9a7a2e` | **3.52** | **FAIL AA**                           |
| **`--lv-fg-subtle`**  | `#8c8579` | **3.19** | **FAIL AA**                           |
| `--lv-accent` (gold)  | `#d4af37` | 1.83     | FAIL — decorative only, as documented |

> **Two live AA failures exist today.** `--lv-accent-ink` is commented in
> `globals.css` as "gold that still passes contrast on a pale ground." **It does
> not** — it measures 3.52:1 against a 4.5:1 requirement. `--lv-fg-subtle` also
> fails. This is a defect in the current system regardless of which direction
> wins, and the migration is the natural moment to fix it.

**Proposed system:**

| Pair               | Ratio    | Verdict                                           |
| ------------------ | -------- | ------------------------------------------------- |
| Obsidian on Ivory  | 16.05    | PASS                                              |
| Ivory on Obsidian  | 16.05    | PASS                                              |
| Stone on Obsidian  | 11.82    | PASS                                              |
| **Stone on Ivory** | **1.36** | **FAIL — surfaces and dividers only, never text** |

The proposed core pairing is **excellent** on contrast — better than the
incumbent at the extremes. Its risk sits entirely in the three unspecified
accents, which is where contrast failures normally appear.

**Carry-over check:** existing green `#1f4d3a` scores **8.61:1 on Ivory** — it
survives as an accent. Gold `#d4af37` scores **1.88:1** — it would remain
decorative-only, exactly as now.

### 7.1 Proposed accessibility fix (Option A compatible) — NOT YET APPLIED

The two AA failures are defects in the shipped system and survive the Option A
decision. **They are not brand colours.** `--lv-accent-ink` and `--lv-fg-subtle`
are _derived working values_ whose stated job is to be readable — `globals.css`
comments `--lv-accent-ink` as "gold that still passes contrast on a pale
ground", which it does not. Correcting them restores the intent rather than
changing the identity.

**Both carry real content, not decoration.** Verified by usage:

| Token             | Used in                | Examples                                                                                                                                            |
| ----------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--lv-accent-ink` | **8 component files**  | A link in `categories/[key]`; eyebrow labels in `PageHeader`, `SectionHeader`, `AuthScreen`, `not-found`; a button hover ground in `AIGenieFeature` |
| `--lv-fg-subtle`  | **15 component files** | Instructional body copy in `join-form.tsx` (12–13px); an interactive link in `sign-in-screen.tsx`; metadata labels at 10–11px                       |

At 10–13px these are **normal text** under WCAG, requiring **4.5:1** — not the
3:1 large-text allowance.

**Proposal — hue and saturation held exactly; only lightness changes.** This is
why the fix is compatible with Option A: the colours stay in the same family and
move only far enough to be legible.

| Combination   | Token             | Current   | Ratio   | Proposed      | Ratio       | Change                                               |
| ------------- | ----------------- | --------- | ------- | ------------- | ----------- | ---------------------------------------------------- |
| green · light | `--lv-fg-subtle`  | `#8c8579` | 3.19 ❌ | **`#716b61`** | **4.60** ✅ | hue 37.9° and sat 8% unchanged; lightness 51% → 41%  |
| green · light | `--lv-accent-ink` | `#9a7a2e` | 3.52 ❌ | **`#826727`** | **4.67** ✅ | hue 42.2° and sat 54% unchanged; lightness 39% → 33% |
| blue · light  | `--lv-fg-subtle`  | `#8290a2` | 2.83 ❌ | **`#606e81`** | **4.53** ✅ | hue and sat unchanged                                |
| blue · light  | `--lv-accent-ink` | `#93732a` | 3.87 ❌ | **`#836625`** | **4.70** ✅ | hue and sat unchanged                                |

**Both dark palettes already pass and need no change:**

| Combination  | Token             | Current   | Ratio   |
| ------------ | ----------------- | --------- | ------- |
| green · dark | `--lv-fg-subtle`  | `#7c8a7b` | 5.07 ✅ |
| green · dark | `--lv-accent-ink` | `#d9bb5c` | 9.84 ✅ |
| blue · dark  | `--lv-fg-subtle`  | `#7a8ca3` | 5.33 ✅ |
| blue · dark  | `--lv-accent-ink` | `#d9bb5c` | 9.79 ✅ |

**Scope: four values, all in light mode, all in `globals.css`.**

**Not changed, and not proposed for change:** `--lv-accent` `#d4af37` stays
exactly as it is. It is the logo gold, it is decorative by design, and §A
already documents that it is not for text — that is precisely why
`--lv-accent-ink` exists.

**Status: proposal only.** No token was edited. Applying it needs approval and
then a visual pass, because `--lv-accent-ink` also serves a button hover ground
in `AIGenieFeature` where the change will be visible rather than merely
legible.

### Risks

| #   | Risk                                                                                                                                         | Severity   | Mitigation                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| R-1 | **Overwriting a founder-approved identity.** ADR-0015 records the current system as _ported_ from approved references, matching them exactly | **High**   | Needs explicit re-approval, recorded as a new ADR superseding 0015     |
| R-2 | **Three accents have no values** — no CTA, ring, link or status colour                                                                       | **High**   | Blocker. Specify before any work starts                                |
| R-3 | **Logo is gold.** Demoting gold orphans six assets                                                                                           | **High**   | Re-cut as SVG; fixes the misspelling and glow defects at the same time |
| R-4 | **No visual regression infrastructure.** 21 screens × 4 combinations = 84 states, all verified by eye                                        | **High**   | Build regression coverage _before_ the re-skin, not after              |
| R-5 | **ADR-0012 reversal.** A move toward Obsidian could undo the light-console decision taken from real operator observation                     | **Medium** | Keep consoles light; restrict Obsidian to ink and dark mode            |
| R-6 | **The palette axis becomes incoherent** — the header's green/blue toggle is meaningless if green is an accent                                | **Medium** | Decide: remove the toggle, or redefine the second skin                 |
| R-7 | **Email templates drift** — 4 hand-maintained values outside the token system                                                                | **Low**    | Update in the same change; add to the checklist                        |
| R-8 | **Partial migration** — a half-applied palette is worse than either                                                                          | **Medium** | Single atomic change to `globals.css`; never screen-by-screen          |

### Visual regression checks required

Per `DESIGN.md` §B.12, and none of it automated today:

1. All **21 screens** in all **4 combinations** (light/dark × green/blue, or
   whatever replaces the palette axis) = **84 states**.
2. Breakpoints 390 / 768 / 1024 / 1440 on real devices.
3. Every state from §B.10 — loading, empty, error, success, disabled.
4. Focus visibility in all combinations.
5. Contrast re-run across the full token set — including the two failures above.
6. Scrims and overlay type over photography, where ground and image interact.
7. Email rendering in real clients (templates sit outside the token system).
8. Logo and favicon on both grounds.

---

## 8. Decisions — resolved and outstanding

**Resolved by the founders on 2026-10-20 (Option A):**

| #   | Decision                                                         | Outcome                                                                     |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| D-1 | Green brand, or ivory-and-ink with green as accent?              | ✅ **Green brand.** Green remains primary and the neutral axis              |
| D-2 | Does the 2026-10-16 direction supersede the approved references? | ✅ **No.** ADR-0015 stands; `public/uirefrence/` remains the standard       |
| D-3 | Hex values for forest, terracotta, bronze                        | ✅ **Moot.** Not introduced; no unapproved values enter the system          |
| D-4 | Does gold survive?                                               | ✅ **Yes.** Logo artwork and its brand treatment preserved; no asset re-cut |
| D-5 | Which tagline?                                                   | ✅ **"Experience Every Journey Through Its Soul"** retained                 |

**Correspondingly, the conflicts in §8 of the migration report are closed:**
C-1 (neutral axis), C-2 (role of green), C-3 (tagline), C-4 (ground and Stone)
and C-5 (unspecified accents) are all resolved in favour of the implemented
system. Their evidence is retained above.

**Still open — not covered by this decision:**

| #    | Question                                                          | Why it is still open                                                             |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| D-6  | The green/blue palette axis and its header toggle                 | Explicitly deferred: "keep unchanged until requirements are explicitly reviewed" |
| D-7  | Do consoles follow the traveller surfaces, or does ADR-0012 hold? | Not reviewed. ADR-0012 stands by default                                         |
| D-8  | Shape language — pills stay, or move squarer?                     | Not raised. §A.4 pills stand by default                                          |
| D-9  | Fund visual regression infrastructure?                            | Not decided. R-4 remains live and is now the largest design risk                 |
| D-10 | Apply the §7.1 accessibility fix?                                 | **Proposed, awaiting approval.** Four light-mode values                          |

**Newly surfaced, needs a decision:** `<title>` renders as **"La Vivenzia —
Journeys Designed Around You"**, a third brand line alongside the retained
tagline. Observed in the running application on 2026-10-20. Not changed.

**Not invented, as instructed:** no values exist for terracotta, bronze, focus
rings beyond `--lv-ring`, link colours, or status colours. Where the system
needs one it uses an existing token; nothing was fabricated to fill a gap.

---

## 9. What happens next

**Option A is what the code already implements, so there is no migration.** The
re-skin sequence previously drafted here is void — retained below only as the
record of what Option B would have cost.

**Actual remaining work, in order:**

**1 — Visual verification (highest priority, no approval needed).**
The identity has been implemented since 2026-09-08 and **has never been
inspected in a browser**. On 2026-10-20 the application was run: it boots,
serves all routes, queries the database, and ships the full four-combination
token set — but it was not seen, because the browser extension would not
connect. 21 screens × 4 combinations = 84 states remain unverified.

**2 — Decide the §7.1 accessibility fix (D-10).**
Four light-mode values. A defect correction, not a brand change.

**3 — Visual regression infrastructure (D-9).**
Still absent. With the identity now settled for the foreseeable future, this
stops being migration insurance and becomes ordinary quality tooling.

**4 — Close the remaining open questions** — D-6, D-7, D-8, and the `<title>`
line — none of which blocks anything today.

---

## 9b. Void — the Option B migration sequence

_Retained as historical evidence of what the rejected direction would have
required. **Do not execute.**_

### (void) Recommended migration sequence

Only if D-1 and D-2 resolve in favour of the new direction. **Nothing below has
been started.**

**Phase 0 — Specify (blocking).**
Obtain D-3, D-4, D-6, D-7. Record the outcome as an ADR superseding 0015.
Produce a complete token map — every one of the 105 `--lv-*` and 49 `--color-*`
declarations given a new value or confirmed unchanged. _No code._

**Phase 1 — Make the change checkable (strongly recommended).**
Add visual regression coverage and an automated contrast check **before**
touching a token, so the re-skin is measured rather than eyeballed. This is the
one step that converts R-4 from a high risk into a routine one.

**Phase 2 — Fix the known defects first, under the current palette.**
Correct `--lv-accent-ink` and `--lv-fg-subtle` to pass AA. Doing this before the
re-skin keeps the two concerns separable: if something regresses later, it is
clear which change caused it.

**Phase 3 — Re-skin, atomically.**
One commit to `globals.css`, plus the four small files and the email template
values. Never screen-by-screen (R-8). Both vocabularies in the same change, or
the consoles and the public site visibly diverge.

**Phase 4 — Re-cut the assets.**
Six files, as SVG where possible. Fixes the misspelled tagline and the baked-in
glow at the same time.

**Phase 5 — Verify.**
The full §B.12 pass: 84 states, four breakpoints, every state, focus, contrast,
scrims, email clients. **Then** update `DESIGN.md` §A to describe the new system
and mark the old one superseded — documentation last, so it describes what
shipped rather than what was intended.

**Sequencing note.** Phases 1 and 2 are independent of D-3 and can start as soon
as D-1 is settled. Phase 3 cannot start without D-3. Phases 4 and 5 are strictly
sequential behind 3.

---

## 10. Evidence used

- `src/app/globals.css` — all token values, read directly
- `src/app/layout.tsx`, `ThemeProvider.tsx`, `PaletteToggle.tsx`,
  `modules/notifications/email-templates.ts` — the only other files with literal hex
- `DESIGN.md` §A (approved system), §B.0 (conflict record)
- `docs/adr/0015-approved-identity-ported-not-reinterpreted.md` — provenance
- `docs/adr/0012-light-console-surfaces.md` — the console-ground decision
- `docs/UI-REFERENCE-INVENTORY.md` — the previous migration's record
- `public/uirefrence/` — the founder-approved references
- `src/components/ui/wordmark.tsx` — the artwork defects
- Contrast ratios computed from the token values using the WCAG 2.x relative
  luminance formula. **These are calculations, not measurements from a running
  browser** — the application was not opened for this document.

**Not established:** whether the implemented identity currently renders
correctly, since no browser verification has been performed on this repository.
