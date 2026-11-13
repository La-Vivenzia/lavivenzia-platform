# La Vivenzia: Product, Architecture & UX Audit

**Date:** 2026-11-13
**Scope:** `src/app` (all routes), `src/components`, `src/modules`, `src/data`, `prisma/schema.prisma`, `next.config.ts`
**Method:** Static reading of the code at `96a87c1`. The app was **not run** for this audit, so every claim here comes from the code. Section 2.7 lists what still needs checking in a browser.

---

## 0. The verdict in seven lines

1. **There are five ways to ask the product for something and four ways to describe a plan.** Each one was a separate feature commit, and none of them replaced the one before it.
2. **The desktop home page puts two text boxes on top of each other, and they go to two different AI engines.** The hero search goes to `/viveniq`. The "concierge" bar directly below it goes to `/concierge`.
3. **There are three sources of truth for what you sell:** Postgres `Experience`, the TypeScript constant `PILOT_EXPERIENCES`, and demo copy in `src/data/content.ts`. Three of the engines read the TypeScript constant directly and bypass the database.
4. **Nothing a patron buys is ever saved.** The schema has no `Booking`, `Payment` or `Pass` table. Experience checkout runs in `demo` or `razorpay_test` mode. Journey passes are `PRE_ARRANGED_SIMULATED` and trips are `PRE_BOOKED_SIMULATED`. "My Booked Journeys" links to `/trips`, which does not exist.
5. **The home page makes claims the product can't back up.** It advertises "112 Destinations · 840+ Curated stays · 1:1 Human planners". The real catalogue is **20 listings in one city (Pune) with no stays**.
6. **About a dozen links and controls go nowhere** (see 2.5).
7. **The fix is mostly subtraction.** There is one catalogue, one plan object (the Journey), one conversation (VivenIQ), one checkout and one pass. Most of the engine logic you need already exists; it just has to be consolidated.

---

## 1. Ground truth inventory

### 1.1 Patron-facing routes

| Route | What it actually does | Key components | Data source |
|---|---|---|---|
| `/` | Renders two separate home trees, `MobileHome` (below `lg`) and `DesktopHome` (`lg` and up), with **different section orders**. The desktop tree has 12 sections. | `DesktopHero`+`SearchBar`, `ConciergeChatBar`, `CategoryNavigation`, `CuratedTripsSection`, `DestinationCard` ×2 rails, `JourneyArcView`, `TasteArchetypeFinder`, `AIGenieFeature`, `LiveTrackingFeature`, `ExperienceCard`, pillars, `Footer`, all wrapped in `CopilotProvider` | DB (`discovery.featured/destinations/categories`), plus **static** `listJourneys()` and `listTrips()`, plus static `content.ts` copy |
| `/experiences` | Catalogue grid with category pills and filters. The empty state points to VivenIQ. | `CatalogueGrid`, `ResultsSkeleton` | DB |
| `/experiences/[slug]` | Listing detail: gallery, inclusions, location panel, booking panel, live-track button | `BookingPanel` (628 lines), `LocationPanel`, `LiveTrackButton` | DB plus `CheckoutService` (demo / Razorpay test) |
| `/destinations` | Destination index. There is **one destination (Pune)**. | `CatalogueGrid` | DB |
| `/destinations/[slug]` | Listings in a city. This is the same grid as `/experiences?city=`. | `CatalogueGrid` | DB |
| `/categories` | "Collections" index, made up of 5 categories | links | DB |
| `/categories/[key]` | Listings in a category. This is the same grid as `/experiences?category=`. | `CatalogueGrid` | DB |
| `/viveniq` | Free-text chat (Gemini plus deterministic picks). Returns single picks and "signature" or "architected" journeys. | `VivenIQChat` (521) | DB plus static journeys plus LLM |
| `/concierge` | A 3-question wizard (where / craving / party+budget) dressed up as a chat | `ConciergeChat` (383) | **Static `PILOT_EXPERIENCES`** |
| `/concierge/results` | The wizard's results page | `ConciergeMatchCard` | **Static `PILOT_EXPERIENCES`** |
| `/trips/architect` | Twelve static two-day "trips" with stays, a simulated booking, **and** a second planner (`ItinerarySynthesizer`) below them | `TripArchitectView` (640), `ItinerarySynthesizer` (546), `CuratorScore`, `PartyStepper` | **Static** `trips/data.ts` plus `PILOT_EXPERIENCES` |
| `/journeys/[id]` | Detail for a 3-act evening, a per-act checkout, a digital VIP pass with a secret keyword, and a live companion map | `JourneyExperienceView` (413), `DigitalVipPass`, `LiveMapTracker` (872) | **Static** `journeys/data.ts` plus DB media |
| `/profile` | Four tabs: Personal details, Taste & palate, Account security, "Your Curations & Journeys" | `ProfileView` (776) | DB (`User.preferences` JSON, sessions) |
| `/sign-in`, `/join`, `/mfa`, `/sign-out` | Email OTP, password, TOTP | `AuthScreen`, `CodeInput` | DB |
| *(modal, no route)* | **"AI Genie" / Live Travel Copilot**: a mood search near a point, opened from the header, the AI Genie section and the Live Tracking section | `LiveTravelCopilot` (**1010 lines**), `LiveMapTracker` | DB plus LLM |

### 1.2 Host & ops routes

| Route | Status |
|---|---|
| `/host`, `/host/profile`, `/host/experiences/**`, `/become-a-host` | **Unreachable.** `next.config.ts` redirects all of them to `https://host.lavivenzia.com`. The pages, `components/host/*` and `lib/host-*.ts` are dead code in this repo. `/api/v1/host/*` is still live. |
| `/ops`, `/ops/hosts/**`, `/ops/experiences/**` | Live, with an in-app review console and its own `ops/layout.tsx`. Its isolation is fine. |
| `destinationForRoles()` | Sends a host account to `/host`, which then bounces off-site. A user with both the host and patron roles can never reach `/profile` from the header. |

### 1.3 API surface (`/api/v1`)

There are 58 route handlers. These are the ones that matter for this audit:

- **Five discovery endpoints for one catalogue:** `experiences`, `viveniq`, `concierge`, `copilot`, `itinerary/generate`
- **Three "booking" paths:** `experiences/[slug]/checkout(+confirm)`, `journeys/[id]/pass`, `trips/simulate-book`
- `companion/dispatch` (the in-journey "butler"), `places/autocomplete|resolve`, `ops/metering`

### 1.4 Data model reality

| Concept | Where it lives | Persisted? | Bookable? |
|---|---|---|---|
| Experience | Postgres `experiences`, seeded from `src/data/pune-pilot.ts` (20 listings, all Pune) | Yes | Demo / Razorpay **test** checkout, not saved |
| Category ("Collection") | Postgres `categories`: culinary 10, adventure 3, celebrations 3, wellness 2, arts 1 | Yes | n/a |
| Destination | Derived from `Experience.city`, so there is exactly 1 | Derived | n/a |
| Journey (3-act evening) | `src/modules/journeys/data.ts`, 11 hard-coded | **No** | Per-act checkout plus a `PRE_ARRANGED_SIMULATED` pass |
| Architected journey | An `arc-` id that encodes a slug list (`journeys/architected.ts`), made up by VivenIQ | **No** (stored only in the URL) | Same as Journey |
| Trip (2-day with stays) | `src/modules/trips/data.ts`, 12 hard-coded. Stay prices are "indicative". | **No** | `PRE_BOOKED_SIMULATED` |
| Itinerary | Generated by `itinerary/generator.ts` from `PILOT_EXPERIENCES` | **No** | Not bookable |
| VIP Pass | An HMAC-signed QR payload, rebuilt on request | **No** | n/a |
| Booking / Payment | **Does not exist in the schema** (`schema.prisma` line 5: "added in…" later) | No | n/a |
| Taste preferences | `User.preferences` JSON | Yes | Read by VivenIQ `favouredTracks` only |
| VIP privileges | Journey definitions, all `confirmed: false` | No | n/a |

### 1.5 Dead code (verified to have no importers)

- Components: `layout/editorial-split.tsx`, `PaletteToggle.tsx`, `site/destination-card.tsx`, `site/experience-card.tsx`, `site/location-field.tsx`, `site/search-form.tsx`
- Data: `content.ts` exports `curated`, `popular`, `experiences`, `journal`, `quickAccess`, `bottomNav`, `heroImage`, and `user` (a hard-coded *"Karan Patil, Atelier Member"*). Nothing renders them.
- Duplicate pairs:
  - `DigitalVipPass` and `VipPassCard`
  - `DestinationCard` / `site/destination-card` and `ExperienceCard` / `site/experience-card`
  - `Hero` / `DesktopHero` and `MobileHeader` / `DesktopHeader`. These are separate trees by design, but they have drifted apart.
- The host app under `src/app/host/**`, `src/app/become-a-host`, `components/host/*`, and `lib/host-context.ts` and `lib/host-page.ts` (all redirected away)

---

## 2. Why it feels senseless: root causes

### 2.1 Five discovery engines, one catalogue of 20

| Engine | Name the patron sees | Entry points | Reads | Real difference |
|---|---|---|---|---|
| Browse | "Experiences", "Collections", "Destinations" | Nav, bottom nav, category pills | DB | Deterministic grid |
| VivenIQ | "VivenIQ", "Describe the moment" | **Hero search bar**, empty state on `/experiences` | DB + LLM | Free text, picks and journeys |
| Concierge | "Ask the Concierge" | **The chat bar directly under the desktop hero**, quick-access tile | **Static TS** | GPS, party maths, budget |
| AI Genie / Copilot | "AI Genie", "Plan My Journey", "Live map" | Header radar button, AI Genie section, Live Tracking section | DB + LLM | Mood near a point, plus the map |
| Itinerary Synthesizer | (no name, sits on Trip Architect) | Only by scrolling `/trips/architect` | **Static TS** | Builds a schedule with budget, moods and stop count |

The **Taste Archetype Finder** quiz on the home page is a sixth recommender. It also produces a `VipPassCard`, which is a second pass design.

**The result:** a visitor can't tell which box is the "real" one. Each engine gives a different answer to the same question, and three of them can drift from what is actually bookable because they don't read the database.

### 2.2 Four competing representations of "a plan"

| | Journey | Architected journey | Trip | Itinerary |
|---|---|---|---|---|
| Unit | One evening, 3 acts | One evening, 2–3 acts | Two days with a stay | 1–4 stops |
| Made by | Curators (TS file) | VivenIQ | Curators (TS file) | Generator |
| Page | `/journeys/[id]` | `/journeys/arc-…` | `/trips/architect?trip=` | Inline, no page |
| Booking | Per-act checkout plus a simulated pass | Same | Simulated | None |
| Pass | `DigitalVipPass` | Same | "Master Trip Voucher" + WhatsApp | None |

These are all the same idea: an ordered list of experiences with times. **They should be a single `Journey` object with a `kind`.**

### 2.3 Naming chaos

The AI alone has six names: Concierge, VivenIQ, AI Genie, Live Travel Copilot, Trip Butler, and Companion. Planners are called Trip Architect and Itinerary Synthesizer. The customer is a traveller, a patron, or an "Atelier Member". Taxonomy is called both Collections (in the UI) and categories (in the URL and DB). On the home page, experiences render through `DestinationCard` under the heading "Curated for You". Pillars promise "Curated Stays", but no stay entity exists.

### 2.4 Three checkouts, zero bookings

- `BookingPanel` on an experience runs a demo or Razorpay test checkout and saves nothing.
- The journey pass runs a checkout per act and then issues a signed pass that is never stored.
- Trip simulate-book returns a voucher with a status of `PRE_BOOKED_SIMULATED`.

Because nothing is saved, `/profile` has no passes to show. Ops can't see a booking, a host can't see a guest, and the "live companion" has no state to resume from. **This is the single largest structural gap, bigger than any UX problem.**

### 2.5 Broken or misleading on-screen elements

| Where | Element | Problem |
|---|---|---|
| `DesktopHero.tsx:81-83` | "112 Destinations · 840+ Curated stays · 1:1 Human planners" | Made up. The real numbers are 1 city, 0 stays and 20 listings. |
| `DesktopHome` "Curated for You" | "Chosen … based on where you have been looking" | Not personalised. It is just `discovery.featured(12)`. |
| `DesktopHome` "Signature Experiences" | Card `href="#d-experiences"`, "View All" `href="#d-experiences"` | Both links point at the section itself, so they do nothing. |
| `LiveTrackingFeature` | "Open" `href="#live-map"` | The anchor doesn't exist. |
| `DesktopHome` "Popular Destinations" | 12-column mosaic | Only one destination is available to fill it. |
| `Footer` | Stays, Journal, Help Centre, Travel Advice, Privacy, Terms | These fall back to `/`. |
| `BottomNavigation` | "Trips" tab | Goes to `/destinations`. |
| `ProfileView` | "My Booked Journeys → View Reservations" | Goes to `/trips`, which returns a **404**. |
| `ProfileView` | "VivenIQ Private Concierge → Explore With AI" | Goes to `/experiences`, not to VivenIQ. It also promises "48-hour weekend itineraries", which VivenIQ doesn't do. |
| `ProfileView` | "micro-vineyards, private heritage walks" | Not in the catalogue. |
| `content.ts` `genie` comment | "Multi-day itinerary planning does not exist yet" | Trip Architect and the Synthesizer both exist, so the copy and the code disagree. |
| `/trips/architect` | (whole route) | The only way in is the home page's trips rail. No nav item points to it. |
| Journey privileges | "VIP privilege" | All `confirmed: false`. The product leans on privileges that no venue has agreed to. |
| Imagery fallback | Positano hero, plus Kyoto, Maldives and other assets in `/public/images` | Visually promises global luxury travel, while the product is evenings in Pune. |

### 2.6 The first 60 seconds on lavivenzia.com (desktop)

1. **0–5 s:** A large Cinzel headline, "Journeys Designed Around You", over a Pune venue photo, with a search box labelled "Describe the moment…" and stats claiming 112 destinations and 840+ stays. *The visitor reads this as a global luxury travel agency.*
2. **5–10 s:** Directly below is a **second** input: "What are you in the mood for tonight?" *Now the question is whether this is a travel site or a nightlife app, and which box they're meant to use.*
3. **10–20 s:** "Quick Discovery" tiles, then "Curated Trips" (2-day Western Ghats trips with stays), then "Curated for You" (Pune restaurants shown as destination cards). *Three different units of product in three scrolls.*
4. **20–35 s:** "Curated Journeys" (a 3-act evening across Amanora and Magarpatta), then "Find Your Taste" (a quiz), then "Plan Smarter with AI Genie" (a third AI entry point that opens a modal), then "Walk there, live on the map" (a fourth).
5. **35–50 s:** "Popular Destinations" (a mosaic with one city in it), then "Signature Experiences" (cards that link to themselves).
6. **50–60 s:** Three "Why La Vivenzia" pillars, including "Curated Stays", which don't exist. Then a footer whose links lead back to the top.

**Diagnosis:** the page answers six different questions ("where to travel", "what to do tonight", "plan my weekend", "what's my taste", "track me live", "where's popular") without ever answering the one that matters, *what is La Vivenzia?* The honest answer is already in the code: **curated evenings in Pune, sequenced by curators and an AI concierge, with a pass that gets you through the door.** The home page should say that and nothing else.

### 2.7 Still to check in a browser

These can't be confirmed from the code alone: the mobile tree's visual order, LLM latency and fallback behaviour on `/viveniq`, how the map performs on a phone, and how both palettes and modes look (per DESIGN.md §B.12).

---

## 3. Elimination list

### 3.1 Keep (these become the product)

| Keep | Why |
|---|---|
| Postgres `Experience` + media + slots + categories | The only real source of truth |
| `/experiences`, `/experiences/[slug]` | A clean, DB-backed browse and detail flow |
| `/viveniq` + `modules/viveniq` | The best conversational engine: it reads the DB and has guardrails |
| `/journeys/[id]` + `JourneyExperienceView` | The signature product shape |
| `DigitalVipPass` + `LiveMapTracker` | The in-journey experience. They move to `/pass/[ref]`. |
| `modules/itinerary/generator.ts` (logic only) | Becomes VivenIQ's planning backend for bespoke journeys |
| `modules/concierge` party, budget and GPS maths (logic only) | Becomes structured filters inside VivenIQ |
| `modules/companion` | Powers the butler on the pass page |
| `/profile` (restructured), auth, `/ops` | Needed |

### 3.2 Merge

| From | Into | How |
|---|---|---|
| `/concierge`, `/concierge/results`, `ConciergeChat`, `ConciergeChatBar`, `ConciergeMatchCard` | `/viveniq` | Re-implement the wizard's three questions as VivenIQ's clarifying follow-ups. Switch `concierge/service.ts` from `PILOT_EXPERIENCES` to `DiscoveryService` and call it as a VivenIQ tool. Permanent redirect `/concierge*` → `/viveniq`. |
| AI Genie / `LiveTravelCopilot` modal, `CopilotProvider`, `AIGenieFeature`, `AIGenieSection`, the header radar button | `/viveniq` (search) and `/pass/[ref]` (map) | The modal's job is split between those two. Delete the 1010-line component. |
| `/trips/architect`, `TripArchitectView`, `trips/data.ts`, `trips/simulate.ts`, `CuratedTripsSection` | `/journeys` as `kind: "multi-day"`, **parked** | Two-day trips need a stay entity, which doesn't exist. Hide them until it does, and keep the data file out of the build. Permanent redirect `/trips/architect` → `/journeys`. |
| `ItinerarySynthesizer` UI | VivenIQ | VivenIQ already makes "architected" journeys. Feed them from `itinerary/generator.ts` (switched to DB reads) rather than keeping a second form. |
| `/destinations`, `/destinations/[slug]`, `/categories`, `/categories/[key]` | `/experiences?city=` / `?category=` | Permanent redirects. Bring Destinations back as a nav item when a second city launches. |
| `VipPassCard` (archetype quiz) | `DigitalVipPass` | One pass design |
| `TasteArchetypeFinder` on the home page | `/profile` → Taste tab (and VivenIQ onboarding) | Taste belongs to the patron, not the landing page |
| `DestinationCard` used for experiences | `ExperienceCard` | Name the thing what it is |
| Journeys `data.ts` + `architected.ts` + trips | One `Journey` table (step 2) | |

### 3.3 Delete

- Host app pages in this repo: `src/app/host/**`, `src/app/become-a-host/**`, `components/host/*`, and `lib/host-context.ts` and `lib/host-page.ts`. Keep the `/api/v1/host/*` routes only if the portal calls them; otherwise move them to the portal repo.
- The orphaned components in §1.5.
- The dead exports in `content.ts`, plus `pillars` and `liveTracking`.
- The made-up hero stats.
- The home sections Quick Discovery, Curated Trips, Find Your Taste, AI Genie, Live Tracking and Popular Destinations.
- The footer columns that have no destinations.
- `/api/v1/concierge`, `/api/v1/copilot`, `/api/v1/trips/*` and `/api/v1/itinerary/generate` once their logic is behind `/api/v1/viveniq`.

---

## 4. The unified information architecture

### 4.1 Product in one sentence

> **La Vivenzia composes evenings in Pune: one perfect venue, or three in sequence, chosen by curators, shaped by you through VivenIQ, and carried on a pass that opens the door.**

The tagline "Experience Every Journey Through Its Soul" stays, because the founders settled on it.

### 4.2 Route map

```
PATRON (one shell: DesktopHeader/MobileHeader + Footer)
/                          Home
/experiences               The Collection: every bookable venue
/experiences/[slug]        Venue detail → book
/journeys                  Signature Journeys index (new, small)
/journeys/[id]             Journey detail → book (signature or bespoke)
/viveniq                   The one conversation
/checkout/[bookingId]      Single checkout (experience or journey)
/pass/[ref]                VIP Pass + live companion map + butler
/profile                   Passes · Taste · Account
/sign-in  /join  /mfa

OPERATIONS (separate layout, no patron chrome, role-guarded)
/ops/**                    Review, hosts, experiences, bookings (new), metering

HOST
host.lavivenzia.com        External portal. Nothing in this repo.

REDIRECTS (308)
/concierge*        → /viveniq
/trips/architect   → /journeys
/destinations*     → /experiences?city=…
/categories*       → /experiences?category=…
```

**Navigation:**
- **Desktop header:** Logo · The Collection · Journeys · VivenIQ, plus the theme toggle and an account avatar. There is no radar button and no notification bell until notifications exist.
- **Mobile bottom bar (4 items):** Home · Explore · VivenIQ · Passes. Profile is reached from the avatar in the header.
- **Footer:** The Collection, Journeys, VivenIQ, and Become a host (which goes to the portal), plus Privacy and Terms once those pages exist. Don't show any link that has no destination.

`destinationForRoles` should always send a patron to `/profile`. Ops staff get an "Operations" link inside the account menu rather than being forced there.

### 4.3 Unified data model (target)

```
Experience (exists)
  └─ ExperienceSlot (exists)

Journey                     NEW table, replaces journeys/data.ts + architected codec + trips/data.ts
  id, slug, kind: SIGNATURE | BESPOKE | MULTI_DAY(parked)
  title, tagline, occasion[], status, createdBy (curator | viveniq | user)
  └─ JourneyAct            position, role (prelude|centerpiece|epilogue),
                            experienceId, suggestedStart, privilegeId?
Privilege                   NEW: venueId, title, detail, confirmed:boolean, validFrom/To

Booking                     NEW: one per checkout
  id, userId, reference, status (PENDING|CONFIRMED|CANCELLED|REFUNDED),
  journeyId?, partySize, totalMinor, currency
  └─ BookingItem           experienceId, slotId, priceMinor (server-computed), status
Payment                     NEW: bookingId, provider, providerOrderId, status, idempotencyKey
Pass                        NEW: bookingId, ref, qrSignature, secretKeyword, issuedAt
                            (derived 1:1 from a CONFIRMED booking)
```

Rules (from CLAUDE.md §6–7):
- Prices are always summed server-side from `Experience.basePriceMinor`.
- VivenIQ can *create* a `BESPOKE` journey draft. It can never set a price or availability.
- A `Pass` exists only after a server-verified payment.

---

## 5. Screen-by-screen specification

The design tokens, typefaces and palette stay exactly as they are in DESIGN.md §A. This section changes **structure and copy, not style**.

### 5.1 Home (`/`): six sections, and the same order on mobile and desktop

| # | Section | Content | Copy | Media |
|---|---|---|---|---|
| 1 | **Hero** | Eyebrow, headline, one line of support, **one** input (→ `/viveniq?q=`), and one text link | Eyebrow: *Pune · Curated Evenings*<br>H1: *Journeys Designed Around You.*<br>Support: *An evening composed for you, from the first pour to the last course. Every venue visited, every host verified.*<br>Input placeholder: *Describe your evening — "a quiet dinner for two, then a rooftop"*<br>Link: *Or browse the collection →* (`/experiences`) | One full-bleed photograph of the best signature venue at golden hour. Never the Positano fallback. |
| 2 | **Signature Journeys** | 3 cards (from `Journey.kind = SIGNATURE`), each showing title, its 3 acts as a timeline, the total price "from ₹X per guest" and duration | H2: *Signature Journeys*<br>Sub: *Three venues, one evening, sequenced by our curators.*<br>CTA: *View all journeys →* | The centerpiece venue photo, with act thumbnails |
| 3 | **The Collection** | 6 `ExperienceCard`s, each linking to `/experiences/[slug]` | H2: *The Collection*<br>Sub: *Twenty venues we would send our own friends to.*<br>CTA: *Explore the collection →* | Venue cover photos |
| 4 | **How it works** | 3 steps, no images | *1 · Tell VivenIQ the evening you want.*<br>*2 · We compose it from venues we know.*<br>*3 · Your pass opens every door, and the map walks you between them.* | Icons only |
| 5 | **The La Vivenzia standard** | 3 honest proof points | *Every venue visited by a curator.* · *Prices are the venue's own. Nothing is invented.* · *A real person behind every pass.* (Only if that's true. Otherwise drop it.) | — |
| 6 | **Closing band** | Repeats the hero CTA | *Tonight could be composed.* Button: *Begin with VivenIQ* | Dark panel (`--lv-panel`) |
| — | **Footer** | As defined in §4.2 | Tagline: *Experience Every Journey Through Its Soul* | — |

Removed from the home page: the stats row, the concierge bar, Quick Discovery, Curated Trips, Curated for You (it duplicated The Collection), Find Your Taste, AI Genie, Live Tracking, Popular Destinations and the pillars.

### 5.2 The Collection (`/experiences`)

- **Header:** Eyebrow *The Collection*, H1 *Every venue, personally chosen*, sub *Filter by mood, or let VivenIQ choose for you.*
- **Filter row (one line):** Mood/category pills (All · Dining · Adventure · Celebrations · Wellness · Arts), and a "Sort" select (Recommended · Price ↑ · Price ↓). Add an Area filter only once there are more than 3 neighbourhoods. Drop any filter that would return 0–1 results.
- **Grid:** `ExperienceCard` showing photo, title, area, duration, "from ₹X per guest", and **one** curator line (the `curation` perk). Leave out favourite hearts until wishlists are saved.
- **Inline VivenIQ prompt** after the 6th card: *Can't decide? Describe the evening →*
- **Empty state:** *Nothing matches those filters.* with buttons *Clear filters* and *Ask VivenIQ*.

### 5.3 Experience detail (`/experiences/[slug]`)

Order: gallery → title, area and host → curator's note (perk plus secret) → what's included / not included → location panel with map → **sticky booking panel** (date, slot, party, server price, *Reserve*) → "Pairs beautifully with" (the Signature Journeys this venue appears in).
Remove the standalone "Live track" button. Tracking belongs on the pass.

### 5.4 Journeys (`/journeys`, `/journeys/[id]`)

- **Index:** H1 *Signature Journeys*, sub *Evenings our curators would plan for themselves.* Occasion chips (Date · Celebration · Unwind · Connoisseur). There are 4–8 cards.
- **Detail:** hero (centerpiece photo), the 3-act timeline (Prelude / Centerpiece / Epilogue with suggested times and walking or ride transfers), privileges (**show only `confirmed: true`**; hide unconfirmed ones instead of labelling them "requests"), party stepper, total price, *Reserve this journey* (→ `/checkout/[bookingId]`), and a secondary *Make it yours with VivenIQ* (which opens VivenIQ with this journey as context).
- A bespoke journey (`kind = BESPOKE`) uses the identical template with the eyebrow *Composed for you*.

### 5.5 VivenIQ (`/viveniq`): the one conversation

- **Empty state:** H1 *What kind of evening?*, sub *Tell me who's coming, the mood, and roughly when. I'll compose the rest from venues we know.* Then 4 starter chips: *Dinner for two, somewhere quiet* · *A birthday for six* · *Craft beer, then something fun* · *A slow Sunday brunch*. Remove the Hinglish test starter from the public chips, or make it an intentional language feature.
- **Behaviour:**
  1. Get intent from the patron's words, then deterministic retrieval from the DB (`DiscoveryService`).
  2. If party size, time or area is missing, ask **one** clarifying question at a time. This absorbs the Concierge wizard.
  3. Reply with either 1–3 venue cards or a composed journey card (generated by `itinerary/generator.ts`, now reading the DB).
  4. Every card has one action: *Reserve* (single venue) or *View journey* (which saves it as a `BESPOKE` journey and goes to `/journeys/[id]`).
- **The LLM writes the prose only.** Price, availability and privileges always come from the DB, and the current guardrails already do this.
- **Taste:** if `User.preferences` is set, show one quiet line: *Tuned to your taste · Edit*.

### 5.6 VIP Pass & Live Companion (`/pass/[ref]`)

- **Before the evening:** the pass card (`DigitalVipPass`) showing holder, party, date, reference, QR and secret keyword, plus the act list with times, plus *Add to calendar* and *Share with your party*.
- **During the evening:** the top half is `LiveMapTracker` (your position → the current act → the next act, with ETA). The bottom sheet shows the current act card with *Show pass at the door* (full-screen QR), the curator's secret for that act, *Message your butler* (companion dispatch / WhatsApp), and *I'm running late*.
- **After the evening:** *How was it?* (one tap rating per act), plus *Compose another evening*.
- **Access:** the pass page requires the owner's session, or a share token that gives read-only access without the QR.

### 5.7 Profile (`/profile`): three tabs

1. **Passes:** upcoming and past bookings from the `Booking` table, each linking to `/pass/[ref]`. The empty state reads *No evenings yet. Begin with VivenIQ →*.
2. **Taste:** the current Taste & Palate form, with the archetype quiz added as an optional *Help me decide* step. Copy: *VivenIQ uses this to compose for you. Nothing is shared with venues.*
3. **Account:** personal details, password, MFA and sessions (merging the current tabs 1 and 3).

Remove the "Your Curations & Journeys" promo tab and its dead `/trips` link.

### 5.8 Operations (`/ops`)

Keep the current shell. Add **Bookings** (a list plus detail with payment state, used for refunds) and **Journeys** (curate, publish, and confirm privileges) once the step-2 tables exist. Ops must never render patron chrome, and the patron shell must never link into ops except from the account menu for staff.

---

## 6. Restructuring roadmap

Each step ships on its own and leaves the app working.

### Step 1: Cleanup and route consolidation (about 2–3 days, no schema change)

1. Add permanent redirects in `next.config.ts` for `/concierge*`, `/trips/architect`, `/destinations*` and `/categories*`.
2. Delete `src/app/(site)/concierge`, `src/app/(site)/trips`, `src/app/(site)/destinations` and `src/app/(site)/categories`, along with their components. (`ConciergeChat*`, `TripArchitectView`, `ItinerarySynthesizer` UI, `CuratedTripsSection` and `CuratorScore` go, unless the journey detail reuses `CuratorScore`.)
3. Delete the host app pages in this repo (§3.3) and point `destinationForRoles` to `/profile` for hosts.
4. Delete the `LiveTravelCopilot`, `CopilotProvider`, `AIGenieFeature`, `AIGenieSection` and `LiveTrackingFeature` components and the header radar button.
5. Delete the orphans (§1.5) and the dead `content.ts` exports, and remove the hero stats.
6. Fix the dead links in §2.5. Every footer link either resolves or is removed. Change the bottom nav to Home, Explore, VivenIQ and Profile (Passes arrives in step 2).
7. Change the `/experiences` empty state and any remaining CTAs to point only at `/viveniq`.
8. Run `npm run verify` and do a manual browser pass of every remaining route in both modes.

### Step 2: One catalogue, one plan object, one checkout (about 1.5–2 weeks)

1. **Single source of truth:** switch `concierge/service.ts`, `itinerary/generator.ts` and the journey resolvers from `PILOT_EXPERIENCES` to `DiscoveryService`. `pune-pilot.ts` becomes seed-only.
2. **Migration:** add `Journey`, `JourneyAct` and `Privilege`. Seed the 11 curated journeys from `journeys/data.ts`, then delete the TS definitions. VivenIQ's `arc-` codec is replaced by saving a `BESPOKE` journey row.
3. **Migration:** add `Booking`, `BookingItem`, `Payment` and `Pass`.
4. **One checkout service:** `POST /api/v1/bookings` takes `{ experienceId, slotId }` or `{ journeyId, acts[] }` and returns `bookingId`. `/checkout/[bookingId]` uses one Razorpay flow, and the confirmation is verified server-side by webhook (idempotent, per CLAUDE.md §6). Retire `experiences/[slug]/checkout`, `journeys/[id]/pass` and `trips/simulate-book`.
5. Issue `Pass` rows only on `CONFIRMED`. Build `/pass/[ref]` from the existing `DigitalVipPass`, `LiveMapTracker` and companion dispatch.
6. Add the Profile → Passes tab and the mobile "Passes" tab, plus an Ops → Bookings page.
7. Park trips. Move `trips/data.ts` out of `src` (for example to `docs/parked/`) until a `Stay` entity is designed.

### Step 3: Home and navigation redesign (about 4–5 days)

1. Rebuild `/` as the six sections in §5.1. Keep the separate mobile and desktop trees if the approved design needs them, but **with the same section order and data**.
2. Change `DesktopHeader` and `MobileHeader` to the nav in §4.2. Remove the notification bell until notifications exist.
3. Rename everywhere: patron-facing copy uses *Journey*, *The Collection*, *VivenIQ*, *Pass*. Remove "Concierge", "AI Genie", "Copilot", "Trip Architect", "Atelier Member", "Collections" and "Curated Stays".
4. Remove the remote and global destination photography (Positano, Kyoto and the rest) from `/public/images`. Make sure the fallback hero is a Pune venue.
5. Before this ships, apply the WCAG fix that is already proposed in `VISUAL_IDENTITY_DECISION.md` §7.1, with founder sign-off.

### Step 4: VivenIQ streamlining (about 1 week)

1. Treat the absorbed logic as internal tools: `findVenues` (discovery plus party, budget and GPS maths from concierge), `composeJourney` (itinerary generator), and `getTaste` (user preferences).
2. Clarify one question at a time, so the wizard's three questions become conversation turns.
3. Every reply ends in a bookable action, and "View journey" saves a `BESPOKE` journey.
4. Keep Gemini behind `ports/llm.ts` with the current deflection guardrails and metering. Add an eval set of about 30 real patron prompts that asserts no invented price or availability.
5. Delete `/api/v1/concierge`, `/api/v1/copilot` and `/api/v1/itinerary/generate`, so `/api/v1/viveniq` is the only conversational endpoint.

### After Step 4

The product is 4 patron destinations (Home, Collection, Journeys and VivenIQ), 1 checkout, 1 pass, and 1 profile. The code is roughly 6,000+ lines lighter (the copilot, concierge, trip architect, synthesizer UI, the host pages, and the orphans), and every price a patron sees comes from Postgres.

---

## Appendix: files referenced

- Home: `src/app/page.tsx`, `src/components/DesktopHome.tsx`, `MobileHome.tsx`, `DesktopHero.tsx`, `src/data/content.ts`, `src/lib/home-content.ts`
- Engines: `src/modules/{viveniq,concierge,copilot,itinerary,trips,journeys,companion}`
- Booking: `src/modules/booking/{checkout,journey-pass,journey-pass-contract}.ts`, `src/modules/trips/simulate.ts`
- Schema: `prisma/schema.prisma` (models: User, Session, Role…, Host, Experience, ExperienceMedia, Category, ExperienceSlot)
- Redirects: `next.config.ts` (host routes → `host.lavivenzia.com`)
- Role routing: `src/lib/destinations.ts`
