# La Vivenzia — Design System

Version: 1.0
Status: Launch Design Source of Truth

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
