# La Vivenzia — Design System

Version: 1.0
Status: Launch Design Source of Truth

---

## Approval status — read first

**The visual identity is now approved and implemented.** The references live in
`public/uirefrence/` and the system was ported from the demo that produced them,
rather than reinterpreted from the screenshots — so the product matches them
exactly rather than approximately. See `docs/UI-REFERENCE-INVENTORY.md`.

This section previously read "not approved… treat as a working placeholder".
That is no longer true, and the sections below it describing the old palette are
superseded by §A.

Two things follow.

**What is settled.** ADR-0012 records the one substantive deviation from §3 of
this document — light working surfaces with dark anchors, rather than an all-dark
product — and why. That decision came from watching an operator read a review
queue for an hour on a near-black background. It is implemented and holds.

**What is now settled.** The palette, the typeface pairing (Cinzel + Sora), the
shape language, and the logo lockup — `public/logo-lavivenzia.png` and
`logo-mark.png`, which carry transparency and need no per-theme variant.

**Still open:** photography direction. The catalogue's own listing photographs
are what the site renders, so this is a content question for hosts rather than a
design one.

**Settled 2026-10-20 — the identity question is closed.** A brand direction
supplied on 2026-10-16 ("THE WORLD, CONSIDERED.", an Ivory / Obsidian / Stone
palette, forest demoted to a supporting accent) was weighed against §A and
**rejected by the founders**.

**La Vivenzia remains a forest-green-and-ivory brand**, refined through
luxury-editorial design rather than replaced by an ink-led identity. Green
remains the primary colour and the neutral axis; ivory `#F3EFE7` and the
green-based dark neutral `#16261E` are retained; gold and the logo artwork are
preserved; the tagline stays "Experience Every Journey Through Its Soul"; and no
terracotta or bronze value enters the system.

**§A is the source of truth and requires no change.** The decision and the
evidence behind it are in `docs/VISUAL_IDENTITY_DECISION.md`; §B.0 records what
was rejected and why.

**One defect survives the decision** and is a correction rather than a brand
change: `--lv-accent-ink` and `--lv-fg-subtle` fail WCAG AA in both light
palettes. A fix holding hue and saturation exactly is proposed in
`VISUAL_IDENTITY_DECISION.md` §7.1 and **has not been applied**.

**The architecture is ready for the replacement.** Colours exist only in
`globals.css`; every listing renders through one `ExperienceCard`; every console
screen sits in one shell; every button is one component with six variants. A
visual pass is a token and component change rather than a rebuild — and it gets
more expensive with every screen added before it happens. See PROJECT_STATE.md →
"Replacing the design system".

---

## 1. Purpose

This document defines the visual and interaction language for La Vivenzia.

The supplied La Vivenzia moodboard is the primary visual reference. The product must feel like a premium luxury travel and experiential marketplace, not a generic SaaS product, generic booking engine, or futuristic AI interface.

The design language must remain consistent across:

- Traveller web experience
- Discovery and search
- Experience detail
- Booking and checkout
- AI Concierge
- Itinerary builder
- Traveller account
- Host dashboard
- Host onboarding
- Admin / operations
- Responsive mobile experience

---

# 2. Brand DNA

## Core Attributes

- Luxury
- Timeless
- Exclusive
- Experiential
- Elegant
- Refined
- Cinematic
- Trustworthy
- Human
- Modern
- Curated

## Brand Feeling

The interface should feel like:

> A luxury travel publication combined with a highly curated experience marketplace.

It should communicate quality before the user reads every word.

The product should never feel cheap, noisy, generic, or overly technical.

---

# 3. Visual Direction

## Primary Visual Language

The visual language is built around:

- Deep black backgrounds
- Charcoal surfaces
- Warm metallic gold accents
- Warm cream / ivory typography
- Refined serif display typography
- Clean sans-serif interface typography
- Thin borders
- Editorial composition
- Cinematic photography
- Generous negative space
- Fine-line icons
- Restrained motion

## Visual Keywords

```text
Dark
Luxury
Editorial
Cinematic
Timeless
Curated
Elegant
Minimal
Exclusive
Warm
```

---

# 4. Color System

> **Superseded by §A.2 (2026-09-08).** The values in this section are the
> pre-approval palette and are kept for historical context only. They are not
> what the product uses. For live values read `src/app/globals.css`; for the
> approved roles read §A.2. The two principles immediately below still hold.

Use centralized design tokens.

Do not introduce arbitrary colors inside individual components.

## Core Palette

| Token            | Direction          | Usage                             |
| ---------------- | ------------------ | --------------------------------- |
| `--lv-black`     | Near black         | Primary page background           |
| `--lv-charcoal`  | Deep charcoal      | Secondary surfaces                |
| `--lv-surface`   | Dark neutral       | Cards, panels, drawers            |
| `--lv-gold`      | Warm metallic gold | Primary accent                    |
| `--lv-gold-dark` | Antique gold       | Secondary accent                  |
| `--lv-brown`     | Deep brown         | Editorial/heritage accents        |
| `--lv-burgundy`  | Deep burgundy      | Very selective atmospheric accent |
| `--lv-cream`     | Warm ivory         | Primary text                      |
| `--lv-muted`     | Warm muted gray    | Secondary text                    |
| `--lv-border`    | Subtle gold/gray   | Borders and separators            |

Reference palette from the moodboard should be preserved approximately rather than replaced by a bright digital palette.

## Recommended Starting Tokens

```css
:root {
  --lv-black: #0d0d0d;
  --lv-charcoal: #1a1a1a;
  --lv-surface: #202020;

  --lv-gold: #c9a84c;
  --lv-gold-light: #d4af37;
  --lv-gold-dark: #88680b;

  --lv-brown: #5a2e17;
  --lv-burgundy: #480e16;

  --lv-cream: #f5ecd9;
  --lv-white: #f5f5f5;
  --lv-muted: #a8a39a;

  --lv-border: rgba(201, 168, 76, 0.35);
  --lv-border-subtle: rgba(245, 236, 217, 0.12);
}
```

These values are starting tokens. Keep them centralized so the brand can be tuned globally.

---

# 5. Color Usage Rules

## Gold

Gold is the signature accent.

Use it for:

- Primary CTAs
- Active states
- Important labels
- Fine borders
- Icons
- Dividers
- Selected states
- Ratings
- Small decorative elements
- Brand marks

Do not cover entire interfaces in gold.

Gold should feel valuable because it is used selectively.

## Cream

Use cream for:

- Main headings
- Important body copy
- High-priority information
- Navigation when active
- Critical booking information

## Muted Text

Use muted warm gray for:

- Secondary descriptions
- Metadata
- Helper text
- Timestamps
- Supporting information

## Burgundy / Brown

Use only for:

- Editorial atmosphere
- Heritage sections
- Photography treatments
- Special luxury accents

They must never overpower the black + gold foundation.

---

# 6. Typography

> **Partly superseded by §A.3 (2026-09-08).** The pairing principle below is
> correct and still governs. The specific faces are not: the approved pairing is
> **Cinzel + Sora**, and Sora replaced Montserrat on 2026-09-08. Read §A.3 for
> the faces and `src/app/layout.tsx` for how they load.

The moodboard establishes an editorial serif + modern sans-serif pairing.

## Display Typeface

Use a typeface similar to **Cinzel** for:

- Hero headlines
- Major section headings
- Brand statements
- Editorial headings
- Important luxury messaging

Characteristics:

- Elegant
- High contrast
- Uppercase-friendly
- Classical
- Premium

## Interface Typeface

Use a typeface similar to **Montserrat** for:

- Navigation
- Body copy
- Buttons
- Forms
- Filters
- Labels
- Tables
- Dashboard content
- Metadata

## Typography Hierarchy

```text
Display / Hero
↓
H1
↓
H2
↓
H3
↓
Body
↓
Small
↓
Caption / Metadata
```

## Rules

- Do not use decorative fonts for utility information.
- Do not use the display serif for dense tables.
- Do not use excessive font weights.
- Maintain generous line height.
- Use uppercase selectively for labels and luxury microcopy.

---

# 7. Layout System

## General

La Vivenzia uses a premium editorial layout.

Prioritize:

- Large visual areas
- Strong horizontal alignment
- Clear content hierarchy
- Generous whitespace
- Thin separators
- Controlled density
- Balanced image/text compositions

## Container

Use a consistent maximum content width.

Example:

```css
--container-max: 1440px;
--container-padding: clamp(20px, 4vw, 64px);
```

## Grid

Use a consistent grid system.

Suggested:

- 12-column desktop grid
- 8-column tablet grid
- 4-column mobile grid

Do not create arbitrary grid systems for individual pages.

---

# 8. Spacing

Use a centralized spacing scale.

Example:

```text
4
8
12
16
24
32
40
48
64
80
96
120
```

Luxury does not mean empty for the sake of being empty. Spacing must establish hierarchy and breathing room.

---

# 9. Borders

Borders are important to the La Vivenzia visual identity.

Use:

- Thin gold borders for premium/high-value controls
- Subtle charcoal borders for structural separation
- Low-opacity cream borders when gold would be excessive

Avoid:

- Thick borders
- Bright white borders
- Heavy card outlines

---

# 10. Corner Radius

Use restrained rounding.

Preferred:

- Small radius for controls
- Small-to-medium radius for cards
- Larger radius only where it improves usability on mobile

Avoid:

- Huge pill-shaped cards
- Excessive rounded SaaS components
- Every component having the same exaggerated radius

---

# 11. Buttons

## Primary Button

Characteristics:

- Warm gold background
- Dark text
- Strong readable label
- Compact premium proportions
- Subtle hover transition

Example:

```text
┌──────────────────────────┐
│     EXPLORE EXPERIENCES  │
└──────────────────────────┘
```

## Secondary Button

Characteristics:

- Transparent/dark background
- Thin gold border
- Cream/gold text

## Text Button

Use for:

- Secondary navigation
- View details
- Editorial actions

## Button States

Every button must support:

- Default
- Hover
- Focus
- Active
- Disabled
- Loading

---

# 12. Cards

Cards should feel like premium editorial content blocks.

## Experience Card

Should support:

- Cinematic image
- Experience title
- Location
- Rating
- Price
- Category
- Wishlist
- Optional featured badge

Example structure:

```text
┌──────────────────────────────┐
│                              │
│          IMAGE               │
│                         ♡    │
│                              │
├──────────────────────────────┤
│ EXPERIENCE TITLE             │
│ Location                     │
│ ★ 4.8                        │
│ From ₹X,XXX / person         │
└──────────────────────────────┘
```

## Card Rules

- Image is important.
- Text hierarchy must be clear.
- Gold should be used as an accent, not decoration everywhere.
- Do not overcrowd cards.

---

# 13. Navigation

## Desktop Header

The header should feel understated and premium.

Suggested structure:

```text
LA VIVENZIA

Experiences
Destinations
Become a Host
Concierge
About

Search
Wishlist
Account
```

Use:

- Dark background
- Fine separator
- Cream text
- Gold active state
- Minimal icons

## Mobile Navigation

Use a premium bottom navigation:

```text
Home
Search
Bookings
Wishlist
Profile
```

Keep labels concise and icons consistent.

---

# 14. Search Experience

Search should be one of the strongest product interactions.

The search interface should feel editorial and premium rather than like a generic marketplace filter panel.

Core controls:

- Natural-language search
- Destination
- Date
- Guests
- Category
- Budget
- Mood
- Group type
- Map

Search results should visually prioritize:

1. Image
2. Experience
3. Location
4. Rating
5. Price
6. Relevant metadata

---

# 15. Experience Detail Page

The experience detail page should feel like a luxury editorial story.

Hierarchy:

```text
Hero imagery
↓
Experience title
↓
Location + rating
↓
Short description
↓
Highlights
↓
Booking card
↓
Detailed description
↓
Inclusions / exclusions
↓
Meeting point / map
↓
Policies
↓
Reviews
↓
Similar experiences
```

The booking action must remain obvious without visually overpowering the editorial experience.

---

# 16. Booking UX

Booking is a high-trust interaction.

Always make these visible:

- Date
- Time/slot
- Guests
- Availability
- Price
- Fees
- Total
- Cancellation policy
- Payment state

Do not hide important financial information behind decorative UI.

## Booking Flow

```text
Experience
↓
Date + Guests
↓
Booking Summary
↓
Payment
↓
Verification
↓
Confirmation
↓
Voucher
```

---

# 17. Payment UI

Payment screens should be calm and trustworthy.

Use:

- Dark background
- Clear price summary
- Strong total amount
- Simple payment method selection
- Gold primary CTA
- Security/trust indicator

Avoid unnecessary visual decoration on payment screens.

The user should immediately understand:

```text
What am I buying?
When?
For whom?
How much?
How do I pay?
```

---

# 18. Confirmation UI

Confirmation should feel celebratory but sophisticated.

Use:

- Gold confirmation mark
- Clear booking status
- Booking ID
- Experience
- Date
- Guests
- Total paid
- View booking
- Voucher

Avoid confetti, excessive animation, or childish celebration graphics.

---

# 19. AI Concierge Design

AI features must NOT look like a generic chatbot.

La Vivenzia's AI should feel like a **Luxury Digital Concierge**.

Use:

- Editorial prompts
- Natural-language discovery
- Curated recommendation cards
- Explanation of why something matches
- Refine controls
- Itinerary builder
- Save actions

Example:

```text
WHAT ARE YOU IN THE MOOD FOR?

"Luxury monsoon retreat near Pune
for two under ₹20,000."

[ DISCOVER ]

Curated for you

[ Experience ]
Why it matches:
• Romantic
• Monsoon
• Near Pune
• Within budget
```

The AI interface must use the same typography, gold accents, cards, imagery and spacing as normal discovery.

---

# 20. Itinerary Builder

The itinerary builder should feel like a premium private travel planner.

Show:

- Dates
- Destination
- Experiences
- Stay
- Timeline
- Travel time
- Route
- Budget
- Notes

Actions:

- Edit
- Regenerate
- Add experience
- Remove
- Save
- Share

Do not make the itinerary builder look like a project-management application.

---

# 21. Traveller Account

The account area should remain premium and simple.

Sections:

- Profile
- Preferences
- Wishlist
- Saved itineraries
- Upcoming bookings
- Booking history
- Reviews
- Communication preferences

---

# 22. Host Dashboard

Host and admin interfaces can be more information-dense, but they must remain visually connected to the brand.

Use:

- Black/charcoal foundation
- Gold highlights
- Cream typography
- Fine borders
- Structured tables
- Clear KPI cards

Host navigation:

```text
Dashboard
Experiences
Availability
Bookings
Guests
Revenue
Reviews
Profile
Verification
```

---

# 23. Admin Dashboard

Admin UI should prioritize clarity and operational efficiency.

Sections:

- Overview
- Users
- Hosts
- Experience approvals
- Bookings
- Finance
- Refunds
- Moderation
- Analytics
- Audit logs

The admin interface may use higher information density than traveller pages.

However, it must still use the same:

- Color system
- Typography
- Buttons
- Borders
- Icons
- Spacing
- Component language

---

# 24. Forms

All forms must include:

- Visible labels
- Required indicators
- Validation
- Helpful error messages
- Loading states
- Disabled states
- Success states

Forms should feel structured and premium, not like raw HTML forms.

---

# 25. Tables

Tables are primarily for host/admin experiences.

Rules:

- Clear header hierarchy
- Compact but readable rows
- Subtle separators
- Gold for active/important states
- Consistent status badges
- Avoid excessive decoration

---

# 26. Icons

Use a consistent fine-line icon family.

Preferred semantic icons:

- Search
- Location
- Calendar
- Users
- Heart
- Share
- User
- Star
- Diamond
- Crown
- Shield
- Concierge
- Arrow
- Check
- Menu

Icons should remain visually subordinate to typography and imagery.

Do not mix unrelated icon styles.

---

# 27. Imagery Direction

Imagery is a major part of the La Vivenzia identity.

Preferred subjects:

- Luxury hotels
- Heritage architecture
- Private villas
- Fine dining
- Mountains
- Lakes
- Yachts
- Private travel
- Cinematic destinations
- Authentic local experiences
- Elegant human moments

Photography should feel:

- Cinematic
- Warm
- Rich
- Authentic
- Premium
- Atmospheric

Avoid generic corporate stock photography.

---

# 28. Texture & Decorative Language

Subtle textures may be used for:

- Hero backgrounds
- Editorial panels
- Brand sections
- Heritage content

Preferred texture direction:

- Leather
- Fine paper
- Dark stone
- Subtle fabric
- Architectural surfaces

Texture must remain subtle.

It must never reduce readability.

---

# 29. Motion

Motion should be restrained and luxurious.

Preferred:

- Slow image transitions
- Gentle fade
- Subtle slide
- Soft hover elevation
- Gold accent transitions
- Smooth page transitions

Avoid:

- Bouncy animations
- Excessive parallax
- Flashing effects
- Neon transitions
- Game-like interactions

Suggested timing:

```text
Micro interaction: 150–200ms
Standard transition: 200–300ms
Editorial transition: 400–700ms
```

---

# 30. Responsive Design

La Vivenzia is mobile-first.

Do not simply shrink desktop layouts.

On mobile:

- Recompose sections
- Prioritize imagery
- Stack content logically
- Keep booking CTA accessible
- Use bottom navigation
- Convert filters into drawers
- Convert complex tables into cards where appropriate
- Maintain typography hierarchy

Core mobile flows must work:

- Search
- Experience detail
- Booking
- Payment
- Confirmation
- Wishlist
- Itinerary
- Profile

---

# 31. Accessibility

Luxury design must not come at the cost of usability.

Requirements:

- Strong text contrast
- Visible focus states
- Keyboard navigation
- Semantic HTML
- Accessible form labels
- Clear validation messages
- Appropriate touch targets
- Reduced-motion consideration

Gold text must not be used where contrast becomes insufficient.

---

# 32. Loading / Empty / Error States

Every asynchronous interface must define:

### Loading

Use refined skeletons that match the dark theme.

### Empty

Use simple editorial messaging and a clear next action.

### Error

Explain what happened and provide recovery.

### Disabled

Maintain readable contrast and clear state.

Never leave blank screens while data loads.

---

# 33. Design Anti-Patterns

Never introduce:

- Bright blue/purple SaaS gradients
- Neon interfaces
- Generic AI chat windows
- White dashboard layouts
- Excessive glassmorphism
- Huge pill buttons
- Cartoon illustrations
- Random colors
- Random typography
- Excessive rounded cards
- Inconsistent icon families
- Heavy shadows
- Visually noisy dashboards
- Generic startup hero sections

---

# 34. Component Architecture

Create reusable components.

Suggested structure:

```text
components/
├── ui/
│   ├── Button
│   ├── Input
│   ├── Select
│   ├── Badge
│   ├── Modal
│   ├── Drawer
│   ├── Tabs
│   └── Toast
│
├── layout/
│   ├── Header
│   ├── Footer
│   ├── MobileNav
│   └── Container
│
├── discovery/
│   ├── SearchBar
│   ├── FilterPanel
│   ├── ExperienceCard
│   ├── DestinationCard
│   └── MapPanel
│
├── booking/
│   ├── BookingCard
│   ├── AvailabilityPicker
│   ├── GuestSelector
│   ├── PriceSummary
│   └── Confirmation
│
├── concierge/
│   ├── ConciergePrompt
│   ├── RecommendationCard
│   └── ItineraryBuilder
│
├── host/
│   ├── HostSidebar
│   ├── ListingForm
│   ├── AvailabilityCalendar
│   └── RevenueCard
│
└── admin/
    ├── AdminSidebar
    ├── DataTable
    ├── ApprovalCard
    └── AuditLog
```

Before creating a component, check whether an existing component can be reused or extended.

---

# 35. Design Token Rule

Never hardcode recurring design values.

Bad:

```css
color: #c9a84c;
border-radius: 13px;
```

inside dozens of components.

Preferred:

```css
color: var(--lv-gold);
border-radius: var(--lv-radius-sm);
```

The design system must be adjustable globally.

---

# 36. UI Consistency Rule

Every new screen must answer:

1. Does it use the La Vivenzia color system?
2. Does it use the correct typography?
3. Does it reuse existing components?
4. Does it follow the spacing scale?
5. Does it follow the border language?
6. Does it work on mobile?
7. Does it include loading/empty/error states?
8. Does it feel premium and editorial?
9. Does it look like La Vivenzia rather than a generic SaaS product?

If the answer is no, revise the design.

---

# 37. Design Hierarchy

When design decisions conflict, prioritize in this order:

```text
1. Usability
2. Brand consistency
3. Content hierarchy
4. Accessibility
5. Visual luxury
6. Decorative detail
```

Decoration must never compromise usability.

---

# 38. Stitch / AI Design Generation Rule

When generating UI using Google Stitch or another design-generation system:

1. Use the supplied La Vivenzia moodboard as the primary visual reference.
2. Preserve the black + gold + cream palette.
3. Preserve the serif + sans-serif typography pairing.
4. Preserve the editorial luxury composition.
5. Generate connected screens rather than isolated concepts.
6. Reuse the same visual system across traveller, host and admin areas.
7. Do not introduce generic SaaS patterns.
8. Do not treat AI as a separate visual brand.
9. Keep the AI Concierge inside the La Vivenzia design language.
10. Use generated screens as design references; production implementation must still follow the project architecture and requirements.

---

# 39. Relationship With Other Project Documents

```text
PROJECT.md
    ↓
Defines the product direction and scope

REQUIREMENTS.md
    ↓
Defines what the product must do

WIREFRAME.md
    ↓
Defines information architecture and user flows

DESIGN.md
    ↓
Defines visual and interaction language

SYSTEM_DESIGN.md
    ↓
Defines technical architecture

CLAUDE.md
    ↓
Defines how the AI coding agent works
```

If a visual implementation conflicts with this document, do not silently create a new design language.

---

# 40. Final Design Statement

La Vivenzia should look and feel like:

**A timeless luxury travel house brought into the digital world.**

It should combine the visual richness of luxury hospitality, the editorial quality of a premium travel publication, and the usability of a modern booking platform.

The interface must remain:

**Dark. Gold. Elegant. Cinematic. Curated. Timeless. Human.**


---

# A. The approved system (2026-09-08)

This section supersedes any colour, radius or typography value stated earlier in
this document. The single source of truth is `src/app/globals.css`; the values
here are for reading, not for copying into components.

## A.1 Two axes, four combinations

| Axis | Values | Mechanism |
| --- | --- | --- |
| Mode | light · dark | a `.dark` class on `<html>` |
| Palette | green · blue | `data-palette` on `<html>` |

Both are stamped before first paint by `themeInitScript` in
`src/lib/theme-init.ts`, so there is never a flash of the wrong palette. Every
component reads semantic names only, so neither axis needs a line of conditional
JSX.

**The blue palette exists and ships.** It is not shown in the reference images
and is not the default; it is a second approved skin reached with
`?palette=blue`.

## A.2 Colour

| Role | Green · light | Green · dark |
| --- | --- | --- |
| Page ground | `#f3efe7` | `#0d1611` |
| Card surface | `#fcfaf6` | `#15221a` |
| Chips, wells | `#eae1d2` | `#1e2c22` |
| Heading | `#16261e` | `#f5f1e8` |
| Body | `#1a1a1a` | `#f3efe7` |
| Primary | `#1f4d3a` | `#2c6b4f` |
| Gold (logo) | `#d4af37` | `#d4af37` |
| Call to action | `#1f4d3a` green | `#cba94e` gold |

Two properties are easy to undo by accident and must not be:

**The neutral axis is green, not brown.** The pre-approval ink was `#17140f`, a
warm brown-black. The approved ground is a deep pine whose green channel leads.
Anything that "corrects" these toward neutral grey breaks the identity.

**The call to action inverts by ground** — deep green on ivory, gold on pine.
The two reference screens are otherwise identical and differ exactly here.

## A.3 Typography

| Role | Face |
| --- | --- |
| Display — headings, wordmark | **Cinzel** |
| Body, UI, dense text | **Sora** |

Cinzel is a capitals face: generous tracking, heading sizes only, never dense
utility text. Sora replaced Montserrat on 2026-09-08.

## A.4 Shape

| Token | Value | Used for |
| --- | --- | --- |
| `--radius-pill` | `999px` | buttons, chips, filter fields, search |
| `--radius-card` | `1.125rem` | cards, panels, media wells, feature blocks |
| `--radius-xs … lg` | 2–8px | retained for dense console tables only |

**Buttons are pills everywhere**, consoles included. It is the strongest shape
signal in the approved design, so it lives on the shared `Button` rather than
being reapplied per screen.

## A.5 The components that own the language

Do not create a second version of any of these. If one does not fit, change it.

| Concern | Component |
| --- | --- |
| Public chrome | `SiteShell` → `MobileHeader` / `DesktopHeader` / `Footer` / `BottomNavigation` |
| Account controls | `ProfileButton` — sign in, avatar, sign out |
| Interior masthead | `PageHeader` · `PageBody` |
| Listing card | `DestinationCard` |
| Editorial card | `ExperienceCard` |
| Result grid | `CatalogueGrid` |
| Section title + rail | `SectionHeader` |
| Search | `SearchBar` |
| Buttons, fields, chips, alerts | `ui/button` · `ui/field` · `ui/status` · `ui/feedback` |

## A.6 Two token vocabularies, deliberately

`--lv-*` and the `bg/fg/accent/cta/panel` utilities serve the public site and
come from the approved system verbatim. The `ink/gold/text/line/canvas` names
serve the consoles, which have **no approved reference of their own** and would
otherwise have been restyled on no evidence.

They are not duplicates — where they overlap the values agree. Retiring the
console vocabulary needs its own approved reference. Do not merge them on
aesthetic grounds.

## A.7 What is deliberately absent

The references show **Stays**, **AI Genie** and **Trips**. None has a backend:
there is no accommodation entity, AI discovery is a later phase with its
embeddings provider unresolved (ADR-0007, A-006), and itineraries are Phase 9.

`AIGenieSection` and `AIGenieFeature` are kept on disk, matching the approved
design, and are **not mounted**. When the feature ships, mounting them restores
the design with no rework. Until then, `CLAUDE.md` §7 governs: the interface
must not promise capability the product lacks.

---

# B. Brand expression, experience principles and visual governance (2026-10-16)

§A defines what the product **looks like** and remains the source of truth for
every token. This section defines what it must **feel like**, how its surfaces
should behave, and how UI work is verified. It is additive: it introduces no
colour, radius or typeface value, and it overrides nothing in §A.

## B.0 A rejected brand direction — RESOLVED 2026-10-20

> **Closed.** The founders selected the existing forest-green-and-ivory identity
> on 2026-10-20. The direction below was **rejected**; §A stands unchanged and
> no token was altered. The comparison is retained as the record of what was
> weighed — it is evidence, not a live proposal. Full decision:
> `docs/VISUAL_IDENTITY_DECISION.md`.

A brand direction supplied on 2026-10-16 conflicted with §A on the three points
marked **CONFLICT** below. Both positions are recorded so the reasoning survives
the decision.

| Subject | §A — approved and implemented | 2026-10-16 direction | Status |
| --- | --- | --- | --- |
| Neutral axis | Deep pine. Heading ink `#16261e`, green channel leads | "Obsidian `#171715`" — effectively neutral grey-black | **CONFLICT** |
| Primary | Deep green `#1f4d3a`, carrying the whole neutral axis | Forest demoted to "a restrained supporting accent" | **CONFLICT** |
| Page ground | `#f3efe7` | "Ivory `#F5F2EA`" | Near-identical; a change would be cosmetic, not structural |
| Third neutral | `--lv-bg-soft #ece5d8`, `--lv-surface-3 #eae1d2` | "Stone `#D8D1C3`" | Compatible in role; values differ |
| Typography | Cinzel display + Sora UI | "Editorial serif + contemporary grotesk" | **No conflict** — the implemented pairing already satisfies this |
| Brand line | `brand.tagline` = "Experience Every Journey Through Its Soul" (rendered in `Footer`, `Logo`, `MobileHome`) | "THE WORLD, CONSIDERED." / "Journeys composed around you." | **CONFLICT** |

**Why it was rejected.** §A says, in terms:

> The neutral axis is green, not brown. […] Anything that "corrects" these
> toward neutral grey breaks the identity.

`#171715` is that correction. Adopting it would have inverted the identity —
green falling from the neutral axis and the primary to a decorative accent — and
§A's values were not chosen aesthetically: they were **ported from references
the founders approved** (ADR-0015, `public/uirefrence/`).

The founders confirmed on 2026-10-20 that the green axis stands. **ADR-0015
remains in force and `public/uirefrence/` remains the standard.**

**What was kept from the rejected direction.** Its palette was declined; its
craft was not. Generous whitespace, editorial typography, authentic travel
photography, restrained motion, accessibility discipline and consistent tokens
are all adopted — they are the substance of §B.1 and §B.6 through §B.12, and
none of them ever depended on changing a colour.

## B.1 Design territory and personality

The territory is **Luxury Editorial × Quiet Luxury × Modern Digital Product**.

The personality is **cultured, intelligent, personal, warm, modern, timeless,
restrained**. These extend §2's Core Attributes rather than replacing them; the
two lists are consistent, and where a word appears in both it means the same
thing.

The product must read as a considered travel house expressed through a
sophisticated digital product — not a SaaS dashboard, and not a mass-market
travel marketplace. The distinction is behavioural, not decorative: a travel
house shows fewer things, says why each one is there, and does not shout.

## B.2 Brand line — settled

**"Experience Every Journey Through Its Soul"** — confirmed by the founders on
2026-10-20. It lives in `brand.tagline` (`src/data/`) and is rendered by
`Footer`, `MobileHome` and the `Logo` alt text. "THE WORLD, CONSIDERED." was
rejected. **No code change is required; the implemented line is the approved
line.**

Two related items are **not** settled by that decision:

**The lockup artwork is still defective.** `src/components/ui/wordmark.tsx`
records that the supplied artwork misspells the tagline — "Joumey" and
"Th1ough" — which is why only the pin is used and never the full lockup. It also
carries a baked-in glow that makes it dark-surface-only. Re-cutting it, ideally
as SVG, fixes both and is independent of the brand decision.

**A third line exists in the product.** The document `<title>` renders as "La
Vivenzia — Journeys Designed Around You", observed in the running application on
2026-10-20. Whether that is intentional positioning copy or drift has not been
decided.

## B.3 The experience principles

Every traveller-facing surface should sit somewhere on this progression, and
should make clear where:

**DISCOVER → UNDERSTAND → CURATE → PERSONALISE → BUILD → EXPERIENCE**

| Stage | What the surface owes the traveller | Where it lives today |
| --- | --- | --- |
| Discover | A reason to look, before a box to type in | `/`, `/destinations`, `/categories` |
| Understand | Enough to judge: place, duration, host, price basis | `/experiences/[slug]` |
| Curate | A narrowing that reflects intent, not just filters | `/experiences` |
| Personalise | Shaping around the person | **Not implemented** — no `TravellerProfile` |
| Build | Assembling something across days | **Not implemented** — Phase 9 |
| Experience | During and after the trip | **Not implemented** |

**Intent before search.** Discovery should lead with intent rather than a
general-purpose query box. A search field may exist; it should not be the first
thing the page argues for.

The last three rows are stated as direction, **not as capability**. Nothing in
this section should be read as a claim that personalisation, itineraries or
in-trip surfaces exist.

## B.4 AI surfaces — a private concierge, not a chatbot

When AI discovery ships (Phase 8, blocked on A-006), it must read as a
considered concierge: it asks, listens, and returns a small number of
well-reasoned options with the reasoning shown.

- No generic assistant chrome — no robot avatars, no sparkle motifs, no
  "AI is thinking" theatre.
- Recommendations carry their reason. An unexplained recommendation is a guess.
- Restraint over volume: fewer, better, explained.
- The interface must not promise capability the product lacks (`CLAUDE.md` §7).
  `AIGenieSection` and `AIGenieFeature` stay unmounted until there is a backend.

## B.5 One system, three densities

Traveller, host and admin share one design language and differ only in
**information density**, because their jobs differ. They must not diverge into
separate design systems.

| Surface | Density | Governing intent |
| --- | --- | --- |
| Traveller | Generous. Editorial composition, large media | Persuade and inform |
| Host | Moderate. Forms and status, still branded | Complete a task accurately |
| Admin / ops | Dense. Tables, queues, filters | Decide quickly, repeatedly |

Shared across all three without exception: typeface pairing, colour roles, pill
buttons (§A.4), focus treatment, and the `Button` component with its variants.

§A.6 records why two token vocabularies currently coexist and why they must not
be merged on aesthetic grounds. That remains correct and is not relaxed here.

## B.6 Photography and art direction

Photography carries more of this identity than any component does.

- **Real, specific places.** The catalogue's own listing photographs are what
  the site renders — this is a content standard for hosts as much as a design
  one.
- Cinematic, human, architectural. Natural light preferred.
- Composed with space for type to sit over it where the layout requires.
- **Never** generic stock travel imagery unrelated to the actual listing. A
  photograph that does not depict the thing being sold is a misrepresentation
  before it is a design flaw.
- Cropping must survive responsive reflow: check the subject is not lost at the
  narrowest breakpoint.

**Known gap:** there is no documented minimum resolution, aspect ratio set or
compression target for host-supplied media. These need deciding — marked
**REQUIRES VERIFICATION**; do not invent values.

## B.7 Iconography

Icons are functional, not decorative. One family, consistent stroke weight,
aligned to the text they label. Icons never carry meaning alone — pair with a
label or an accessible name. Current implementation uses `lucide-react` plus
local `src/components/icons.tsx`; do not introduce a third source.

## B.8 Motion

Purposeful and short. Motion explains a relationship — where something came
from, what changed — or it does not run.

- Prefer opacity and small translations; avoid scale on large surfaces.
- Nothing bounces, pulses or loops for decoration.
- Honour `prefers-reduced-motion`. **REQUIRES VERIFICATION** — this audit did
  not confirm it is implemented.

## B.9 Accessibility and contrast

- Body and UI text must meet **WCAG AA (4.5:1)**; large display text **3:1**.
- `--lv-accent-ink` exists precisely because the logo gold fails contrast on a
  pale ground. **Use `--lv-accent-ink`, never `--lv-accent`, for text on light
  surfaces.**
- Every interactive element needs a visible focus state, and it must survive
  both modes and both palettes.
- Colour alone must never carry status — pair with text or an icon.
- Targets: 44px minimum on touch surfaces.

**No automated contrast checking exists.** Contrast claims in this document are
derived from the token values, not from a test. Marked **REQUIRES
VERIFICATION**.

## B.10 States

Every data-bearing surface owes five states, and they are design work, not
fallbacks:

| State | Requirement |
| --- | --- |
| Loading | Shaped like the content it replaces. No full-page spinners on a populated page |
| Empty | Says why it is empty and what to do next. Never a bare "No results" |
| Error | Plain language, no codes, and a way forward. Never a raw message |
| Success | Confirms what happened, briefly, without blocking |
| Disabled | Visibly distinct and explained — why is more useful than that |

`src/components/ui/feedback.tsx` and `status.tsx` own these. Do not reimplement
them per screen.

## B.11 Anti-patterns — explicitly prohibited

Do not introduce:

- Generic SaaS dashboard aesthetics.
- Excessive rounded cards or nested containers — containers inside containers
  inside containers.
- Gradients or glassmorphism used decoratively.
- Flashy AI visuals, cyberpunk styling, neon.
- Generic decorative travel imagery unrelated to the real listing.
- Decorative noise that competes with content.
- Arbitrary colour, spacing, typography or radius values that bypass the tokens.
- A second design system for any product area.
- Another company's brand or interface, copied.

The structural guard is `tests/unit/button-variants.test.ts`, which fails if a
button is recoloured through `className` instead of a variant. It covers buttons
only; everything else on this list is reviewed by eye.

## B.12 Visual acceptance criteria

A UI change is not done when it compiles. It is done when it has been **looked
at**. This project's own record is the argument: four consecutive milestones
produced defects that only appeared by opening the running product — an
invisible hero button, a soft 404, a missing logout, and a client-boundary 500.
Each component was individually correct; the composition was not.

Before marking UI work complete:

1. **Open it.** Not a unit test — the running page.
2. **Both modes and both palettes** — light/dark × green/blue (§A.1).
3. **Real breakpoints**, not a resized desktop window: 390, 768, 1024, 1440.
4. **Tokens only** — no literal hex, px radius or font-family in a component.
5. **All five states** from B.10 exercised.
6. **Focus order and visible focus**, by keyboard.
7. **Images** at the narrowest breakpoint — subject still intact after cropping.
8. **Copy** — no placeholder text, no lorem, no misspellings.

**There is no visual regression infrastructure in this repository** — no
Playwright, no screenshot comparison, no responsive test. Items 1–8 are
therefore manual, and item 4 is the only one with any automated backing. Adding
visual regression coverage is outstanding design-system work, not a solved
problem.
