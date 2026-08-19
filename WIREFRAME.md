# La Vivenzia — Luxury Wireframe & UX Sitemap

## Design Reference

This wireframe follows the supplied La Vivenzia moodboard.

### Visual Direction

- Dark, luxurious, editorial interface
- Near-black / charcoal foundations
- Gold as the primary accent
- Warm cream/off-white supporting text
- Refined serif display typography
- Clean sans-serif body/interface typography
- Thin gold borders and restrained separators
- Premium photography and immersive visual areas
- Minimal, spacious composition
- High contrast and readable hierarchy
- No generic SaaS/tech aesthetic
- No bright gradients, neon UI, or excessive rounded cards

## 1. Primary Traveller Flow

```text
HOME
  ↓
DISCOVER / SEARCH
  ↓
FILTER / LOCATION / DATE / GUESTS
  ↓
EXPERIENCE DETAIL
  ↓
SELECT DATE + GUESTS
  ↓
BOOKING SUMMARY
  ↓
PAYMENT
  ↓
PAYMENT VERIFICATION
  ↓
BOOKING CONFIRMATION
  ↓
VOUCHER / BOOKING MANAGEMENT
  ↓
EXPERIENCE + REVIEW
```

## 2. Homepage

```text
┌────────────────────────────────────────────────────────────────┐
│ LA VIVENZIA   Experiences  Destinations  Become a Host  Login │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│              THE ART OF EXPERIENCE                             │
│              Timeless Memories.                                │
│              A World Beyond the Ordinary.                      │
│                                                                │
│  [ Search experiences, destinations...              ][Search] │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ Popular / Curated Experiences                                  │
│                                                                │
│ [ Experience ] [ Experience ] [ Experience ] [ Experience ]    │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ Curated Experiences | Trusted Hosts | Secure Booking            │
└────────────────────────────────────────────────────────────────┘
```

## 3. Search & Discovery

```text
┌────────────────────────────────────────────────────────────────┐
│ Search experiences, destinations...                 [ Search ] │
├────────────────────────────────────────────────────────────────┤
│ [Filters] [Date] [Guests] [Map]                                │
├──────────────────────────────┬─────────────────────────────────┤
│ FILTERS                      │ RESULTS                         │
│ Location                     │                                 │
│ Date                         │ [ Image ] Experience             │
│ Budget                       │           Location               │
│ Category                     │           Rating / Price         │
│ Mood                         │                                 │
│ Group type                   │ [ Image ] Experience             │
│                              │                                 │
│                              │ [ Image ] Experience             │
├──────────────────────────────┴─────────────────────────────────┤
│                         MAP / LOCATION VIEW                     │
└────────────────────────────────────────────────────────────────┘
```

## 4. Experience Detail

```text
┌────────────────────────────────────────────────────────────────┐
│ ← Back                                      Share   ♡           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                     IMMERSIVE MEDIA                            │
│                                                                │
├──────────────────────────────────┬─────────────────────────────┤
│ Experience Title                 │ BOOKING CARD                │
│ Location                         │ From ₹X,XXX / person        │
│ ★ Rating                         │ Date                        │
│                                  │ Guests                      │
│ Description                      │ Availability                │
│                                  │                             │
│ Highlights                       │ [ Select Date ]             │
│ Inclusions                       │                             │
│ Exclusions                       │                             │
│ Policies                         │                             │
├──────────────────────────────────┴─────────────────────────────┤
│ Meeting Point / Map                                             │
├────────────────────────────────────────────────────────────────┤
│ Reviews + Similar Experiences                                   │
└────────────────────────────────────────────────────────────────┘
```

## 5. Booking

```text
SELECT DATE
      ↓
┌───────────────────────┐
│ May 2025              │
│ Calendar              │
│                       │
│ Guests   [-] 2 [+]    │
│                       │
│ [ Continue ]           │
└───────────────────────┘
      ↓
BOOKING SUMMARY
      ↓
PAYMENT
```

## 6. Payment

```text
┌───────────────────────────────┐
│ PAYMENT                       │
├───────────────────────────────┤
│ Experience      ₹X,XXX        │
│ Date             DD MMM       │
│ Guests           2 Adults     │
│ Platform Fee     ₹XXX         │
│ Total            ₹X,XXX       │
├───────────────────────────────┤
│ ○ UPI                          │
│ ○ Credit / Debit Card          │
│ ○ Net Banking                  │
│ ○ Wallet                       │
│                               │
│ [ PAY ₹X,XXX SECURELY ]       │
│                               │
│ Secured by Razorpay           │
└───────────────────────────────┘
```

## 7. Confirmation

```text
              ✓

        BOOKING CONFIRMED

       Your experience is booked.

Experience      ________
Date            ________
Guests          ________
Booking ID      ________
Total Paid      ________

[ View Booking ]

[ Back to Home ]
```

## 8. Host Flow

```text
HOST DASHBOARD
      ↓
ADD EXPERIENCE
      ↓
BASIC INFORMATION
      ↓
MEDIA + LOCATION
      ↓
PRICING + CAPACITY
      ↓
AVAILABILITY
      ↓
POLICIES
      ↓
REVIEW
      ↓
PUBLISH
      ↓
MANAGE BOOKINGS
      ↓
PAYOUTS
      ↓
REVIEWS
```

## 9. Admin Flow

```text
ADMIN DASHBOARD
      ↓
USER MANAGEMENT
      ↓
HOST VERIFICATION
      ↓
EXPERIENCE APPROVAL
      ↓
CONTENT MODERATION
      ↓
BOOKINGS
      ↓
REFUNDS / DISPUTES
      ↓
COMMISSIONS / PAYOUTS
      ↓
AUDIT LOGS
```

## 10. Information Architecture

```text
HOME
├── Experiences
│   ├── All Experiences
│   ├── Categories
│   ├── Featured
│   └── New Arrivals
│
├── Destinations
│   ├── Cities
│   ├── Regions
│   └── Destination Guides
│
├── Become a Host
│   ├── Why Host
│   ├── Onboarding
│   └── Host Dashboard
│
├── Concierge
│   ├── AI Discovery
│   ├── Shortlists
│   └── Itinerary
│
├── Traveller
│   ├── Profile
│   ├── Wishlist
│   ├── Saved Itineraries
│   └── Bookings
│
└── About / Support
```

## 11. Mobile Wireframe Strategy

The mobile experience is not a compressed desktop page.

Primary bottom navigation:

```text
┌──────────────────────────────────────────────┐
│ Home | Search | Bookings | Wishlist | Profile│
└──────────────────────────────────────────────┘
```

Mobile priorities:

1. Discovery
2. Search
3. Experience detail
4. Date/guest selection
5. Booking
6. Payment
7. Confirmation
8. Booking management

## 12. UI Component Inventory

### Navigation

- Premium header
- Search
- Breadcrumb
- Mobile bottom navigation
- Footer

### Discovery

- Experience card
- Destination card
- Collection card
- Filter chips
- Filter drawer
- Map panel
- Rating
- Price display

### Booking

- Availability calendar
- Guest selector
- Price summary
- Booking summary
- Payment selector
- Confirmation card
- Voucher

### Host

- Dashboard cards
- Listing form
- Media uploader
- Availability calendar
- Booking table
- Revenue cards

### Admin

- KPI cards
- User table
- Host verification queue
- Experience approval cards
- Booking table
- Finance table
- Audit log

## 13. Moodboard-to-UI Rules

The supplied moodboard is the visual authority.

### Use

- Black / charcoal backgrounds
- Gold borders and accents
- Warm cream text
- Serif display headings
- Restrained gold buttons
- Fine-line icons
- Editorial photography
- Luxury hospitality/travel imagery
- Large visual compositions
- Generous negative space

### Avoid

- Bright blue/purple SaaS gradients
- White dashboard-heavy layouts
- Neon colors
- Excessive glassmorphism
- Cartoonish illustrations
- Generic startup landing-page patterns
- Excessive rounded UI
- Dense data-heavy visual treatment on traveller-facing pages

## 14. Relationship to Other Project Documents

`PROJECT.md` → what the product is.

`REQUIREMENTS.md` → what the product must do.

`WIREFRAME.md` → how users move through the product.

`DESIGN.md` → how the product looks and behaves visually.

`SYSTEM_DESIGN.md` → how the software works internally.

`CLAUDE.md` → how Antigravity should implement and maintain the project.

This file is the wireframe/UX source of truth. It does not override business requirements or architecture.
