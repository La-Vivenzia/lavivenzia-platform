# Approved UI reference — inventory

**Source folder:** `public/uirefrence/` (spelling as found on disk — see §4)
**Inspected:** 2026-09-08. All three images opened and examined; colours sampled
programmatically from the pixels rather than estimated by eye.
**Status:** inventory complete; **step 1 of §6 implemented** on 2026-09-08 — the token
layer, typography and the two components the references show most distinctly. Steps 2–4
remain open. What was changed is listed in §7.

---

## 1. Inventory

| #   | Filename                                     | Screen / component                                                                    | Theme               | Form factor                            | Size        |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------- | -------------------------------------- | ----------- |
| R1  | `ChatGPT Image Sep 6, 2026, 12_12_52 PM.png` | Traveller **app home screen**                                                         | **Dark**            | Mobile (iPhone frame, status bar 9:41) | 870 × 1808  |
| R2  | `ChatGPT Image Sep 6, 2026, 12_13_04 PM.png` | Same home screen, pixel-for-pixel counterpart                                         | **Light**           | Mobile                                 | 870 × 1808  |
| R3  | `ChatGPT Image Sep 6, 2026, 12_16_33 PM.png` | **Marketing landing page** — "A Glimpse of the Journey", split light/dark, two phones | Both (split canvas) | Desktop                                | 1225 × 1284 |

R1 and R2 are the **same screen in two themes** — identical layout, spacing and content.
That pairing is the most useful thing in the set: it defines the light/dark token mapping
directly, with no interpretation needed.

R3 is a _marketing_ page, not an app screen. It contains a real desktop nav
(Home · About · App Preview · Contact + "Get Early Access") and a feature rail
(Curated Stays · Unique Experiences · Personalized Planning · Explore Destinations ·
AI Genie · Your Journey, Always).

---

## 2. Extracted palette (sampled, not estimated)

| Role                     | Value     | Where sampled                                          |
| ------------------------ | --------- | ------------------------------------------------------ |
| Dark page ground         | `#091511` | R1 body, 12.2% of all pixels                           |
| Dark card surface        | `#0B1713` | R1 card behind "Amalfi Coast"                          |
| Light page ground        | `#F7F3EE` | R2 body, 8.2% of all pixels                            |
| Light card surface       | `#FAF9F6` | R2 card                                                |
| Light chip / tag         | `#EFE7DB` | R2 "FEATURED" chip                                     |
| **Gold accent**          | `#C7A56B` | R1 circular arrow button                               |
| **Signature deep green** | `#1C382A` | R2 primary button **and** active nav icon — consistent |

### 2.1 The important colour finding

**The dark ground is not neutral.** `#091511` has its green channel highest
(R 09 · G 21 · B 17). The current system's `--color-ink` is `#17140f`, which is warm
_brown_-black (R 23 · G 20 · B 15) — the opposite bias.

**And `#1C382A` is an entirely new colour.** There is no green anywhere in the current
token layer. It is not an accent in the references either — it is the light theme's
**primary action colour**, used for the search submit button and the active tab.

So this is not a palette tweak. It is a hue rotation of the neutral axis plus a new primary.

### 2.2 Delta against the current tokens

| Token today              | Today                | Reference             | Change                 |
| ------------------------ | -------------------- | --------------------- | ---------------------- |
| `--color-ink`            | `#17140f` warm black | `#091511` green-black | **Hue shift**          |
| `--color-surface`        | `#fffdfa`            | `#FAF9F6`             | Slightly warmer/darker |
| `--color-surface-sunken` | `#f3eee5`            | `#F7F3EE`             | Close                  |
| `--color-gold-light`     | `#c9a84c`            | `#C7A56B`             | Softer, less saturated |
| —                        | _(none)_             | `#1C382A`             | **New primary**        |

Good news for the migration: colours live only in `src/app/globals.css`, so the token
change itself is one file. The structural changes in §3 are the real work.

---

## 3. What the references show that the product does not have

This is the finding that has to be settled before implementation, so it is stated plainly
rather than buried.

**The references depict a product materially different from what is built.** Reading the
screens left to right, they show:

| In the reference                                                      | Status in the platform                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **"AI Genie"** — a full AI planning surface, twice on the home screen | Not built. Official **Phase 8**. Embeddings provider unresolved (ADR-0007, A-006)                       |
| **"Stays"** — accommodation as a first-class category                 | **No Stay entity exists.** The schema has Experiences only                                              |
| **"Trips"** tab — saved itineraries                                   | Not built. Official **Phase 9**                                                                         |
| **"Curated for You"** — personalised recommendations                  | Requires traveller preferences, deferred in Phase 3                                                     |
| **Wishlist hearts** on every card                                     | Deferred (Phase 3)                                                                                      |
| **Amalfi Coast · Kyoto · Bali**                                       | Platform is **India-only** — autocomplete is region-locked to `in`, price filtering assumes INR (A-014) |
| **Bottom tab bar**, native app shell, iPhone status bar               | The platform is a responsive **web** app with a top header. No tab bar exists                           |
| **Notification bell + avatar** in the header                          | Neither exists                                                                                          |

Roughly **six of the eight** things on that home screen are features that do not exist.
The two that do — search and a card grid — are already built.

I am flagging this rather than building it because implementing the screen as drawn would
mean creating UI for AI planning, accommodation and itineraries that have no backend. That
is fabrication, and it conflicts directly with `CLAUDE.md` §7 ("AI must not invent …
inventory") and with the roadmap in `PROJECT_STATE.md`.

### 3.1 What this does resolve

The long-standing blocker is now closed. `DESIGN.md`, `PROJECT_STATE.md` and A-007 have all
recorded "the moodboard has not been approved by the founders" since August. **These images
are that approval.** The visual direction is now decided:

- Deep green-black and warm ivory grounds, gold accent, deep green primary
- Display serif for headings, humanist sans for body — matching the existing pairing
- Generous vertical rhythm, large rounded cards, pill search, circular icon buttons

Those documents should be updated once the implementation path is chosen.

---

## 4. Two corrections to the brief

**The folder is `public/uirefrence`, not `public/ui-reference`.** Missing hyphen, and
"reference" is misspelled. The brief said not to assume filenames, which was the right
instruction — the assumed path does not exist.

**Therefore the browser URL in the brief will 404.** It is not
`http://localhost:3000/ui-reference/…` but:

```
http://localhost:3001/uirefrence/ChatGPT%20Image%20Sep%206,%202026,%2012_12_52%20PM.png
```

Two differences: the folder spelling, and **port 3001** — port 3000 is occupied by the
separate `lavivenziademo` app on this machine.

Worth renaming the folder to `ui-reference` and the files to something meaningful
(`home-dark.png`, `home-light.png`, `landing-desktop.png`). I have not done so: the brief
said not to modify the reference images, and renaming is a modification.

---

## 5. The demo is a reference _implementation_, not a mock

The brief points at `https://lavivenziademo.vercel.app` for responsive and interaction
behaviour. That app also exists locally at `C:\Users\kpvlo\Downloads\lavivenziademo`, and
**the three reference images sit at its root** — the demo is where they came from.

This is the most useful discovery of the inspection: there is no need to reverse-engineer
pixels. There is real React and CSS to align to.

**Stack:** Next.js 15, React 19, Tailwind 4, single route.

**Components already built there:**
`MobileHome` · `DesktopHome` · `MobileHeader` · `DesktopHeader` · `DesktopHero` · `Hero` ·
`SearchBar` · `CategoryNavigation` · `CuratedSection` · `ExperienceCard` ·
`DestinationCard` · `PopularDestinations` · `AIGenieSection` · `AIGenieFeature` ·
`BottomNavigation` · `FavouriteButton` · `Footer` · `Logo` · `SectionHeader` · `Reveal` ·
`ThemeProvider` · `ThemeToggle` · `PaletteToggle` · `icons`

### 5.1 Its token system — the authoritative source

The demo carries a proper semantic layer under a `--lv-*` prefix, on **two independent
axes**: mode (light/dark, via a `.dark` class on `<html>`) and palette (**green/blue**, via
`data-palette`). Four combinations, no conditional JSX.

**The blue palette is a finding in its own right** — the approved direction is not
single-palette. The images only show green.

| Token                | Green · Light   | Green · Dark                         |
| -------------------- | --------------- | ------------------------------------ |
| `--lv-bg`            | `#f3efe7`       | `#0d1611`                            |
| `--lv-surface`       | `#fcfaf6`       | `#15221a`                            |
| `--lv-surface-2`     | `#eae1d2`       | `#1e2c22`                            |
| `--lv-heading`       | `#16261e`       | `#f5f1e8`                            |
| `--lv-primary`       | `#1f4d3a`       | `#2c6b4f`                            |
| `--lv-accent` (gold) | `#d4af37`       | `#d4af37` — constant, it is the logo |
| `--lv-cta`           | `#1f4d3a` green | `#cba94e` gold                       |

Note the CTA inversion: **the primary action is green in light mode and gold in dark.** That
is a deliberate decision, visible in R1 vs R2 (gold arrow button on dark, green on light),
and it is exactly the kind of thing that would have been lost by copying a screenshot.

The values I sampled from the PNGs (`#091511`, `#1C382A`, `#C7A56B`) are the _rendered_
colours after image compression and the phone-frame overlay. **The CSS values above are
canonical — use those, not my samples.**

### 5.2 Typography

|         | Demo       | Platform today               |
| ------- | ---------- | ---------------------------- |
| Display | **Cinzel** | **Cinzel** ✓ already matches |
| Body    | **Sora**   | Montserrat                   |

Only the body face differs.

### 5.3 What this changes about the approach

Porting a proven token layer and adapting real components is a different, much lower-risk
job than recreating a design from images. It also means light/dark and the green/blue
palette come along for free rather than being reverse-engineered later.

---

## 6. Recommended sequencing

Ordered so that nothing is built twice, and nothing depends on a feature that does not exist.

1. **Re-theme the token layer** to the sampled palette — `globals.css` only. Every existing
   screen picks it up. Highest value, lowest risk, no new components.
2. **Build the marketing landing page** from R3. It is genuinely buildable today: it sells
   the vision without claiming the features are live, which is exactly what a pre-launch
   marketing page is for.
3. **Restyle the existing traveller screens** — home, browse, experience detail — to match
   the reference's card, chip, search and typography treatment. Real components, real data.
4. **Defer the app-shell screen (R1/R2) as drawn** until AI Genie, Stays and Trips exist.
   Build the _shell_ — header with bell and avatar, bottom navigation — only if the
   founders want a mobile-app posture on the web product; that is a product decision, not
   a styling one.

---

_No code was changed. No reference image was modified, renamed or deleted._

---

## 7. What was implemented on 2026-09-08

Step 1 of the sequencing above, plus the two components the references define most clearly.
`verify:full` passed after the change: 409 unit + 199 integration tests, exit 0.

| File                                      | Change                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/globals.css`                     | Whole token layer repointed to the approved palette. **Token names unchanged** — only values — so every existing screen took the new look without being edited. Added `--color-heading`, `--color-primary*`, `--radius-card`, `--radius-pill`. Lines re-tinted green. Shadows widened. |
| `src/app/layout.tsx`                      | Body face Montserrat → **Sora**. Cinzel was already correct.                                                                                                                                                                                                                           |
| `src/components/ui/button.tsx`            | `primary` variant `bg-ink` → `bg-primary` (deep green).                                                                                                                                                                                                                                |
| `src/components/site/search-form.tsx`     | Rebuilt as a pill field with an inline magnifier and a circular gold submit, replacing the underlined input with an attached rectangular button.                                                                                                                                       |
| `src/components/site/experience-card.tsx` | Contained card: `rounded-card`, border, raised surface, clipped photograph, padded body, category as a pill chip, headings on `--color-heading`.                                                                                                                                       |

**Verified live, not assumed.** The served stylesheet was fetched and inspected: `#0d1611`,
`#f3efe7`, `#1f4d3a`, `#d4af37`, `#fcfaf6`, `1.125rem`, `999px` and Sora are all present;
`#17140f`, `#c9a84c`, `#faf7f2` and Montserrat are all gone. Tailwind 4 emits a `@theme`
token only when a utility consumes it, so the new tokens appearing in the output is itself
proof the components are using them.

### Deliberately not done

**The radius scale was extended, not replaced.** `--radius-xs/sm/md/lg` still exist and the
consoles still use them. The references show only traveller screens; rounding an operations
data table to 18px on that evidence would be extrapolating past the approved direction,
which the brief forbids.

**No console screen was restyled beyond what the tokens gave it for free.** There is no
approved reference for the host or operations console, so there is nothing to compare
against.
