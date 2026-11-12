# ADR-0017: Curated journeys as one experience — unified pass and companion map

- **Status:** Accepted
- **Date:** 2026-11-12
- **Decides:** how a multi-act curated journey is sold, presented and navigated
  before bookings are persisted

## Context

The product sold to a traveller is the curated experience arc — two or three
venues sequenced into one evening — not the venues themselves. Until now a
journey was editorial only: `JourneyArcView` showed the arc and each chapter was
booked on its own listing, because there was no multi-stop checkout.

ADR-0016 still holds: no `Booking` or `Payment` table exists, and no live money
may be taken.

## Decision

1. **One catalogue, two collections.** `modules/journeys/data.ts` resolves
   every journey from pilot listings by slug (price, duration, pin and time
   saved are the listing's). `listJourneys()` stays the four featured arcs the
   home page shows; `listCuratedJourneys()` adds the signature collection.
   Definitions are validated at resolve time: two or three acts in arc order,
   15–30 minute transitions, per-person pricing, at least one occasion.

2. **VivenIQ offers journeys for occasions.** `viveniq/journeys.ts` maps a
   message to an occasion (date, celebration, unwind, connoisseur, weekend) and
   returns up to three journeys alongside the single-venue picks. Selection and
   the lead sentence are deterministic; the model never chooses or prices a
   journey. Act covers come only from listings discovery returned.

3. **One checkout, one pass — simulated.** `POST /api/v1/journeys/:id/pass`
   follows `BOOKING_CHECKOUT` exactly as the trip bundle does: closed when
   `off`, simulated otherwise. The body carries a party size and a name only.
   Every act is re-read through discovery (PostgreSQL); an unpublished act, a
   non-per-person price or a party outside an act's limits refuses the pass,
   and the total is the sum of live listing prices. No provider is called and
   nothing is written or reserved; the pass says so (`simulated`,
   `chargedMinor: 0`, `notice`).

4. **The pass identifies; it does not authorise.** The reference is `LV-XXXX`
   (Crockford base32). The two-word secret host keyword is derived
   deterministically from the reference — a courtesy phrase, not a credential.
   The QR payload is HMAC-signed with a key derived from `SESSION_SECRET` and
   the purpose label `lv.journey-pass.v1`, so a future host tool can verify a
   pass with `verifyPassPayload`.

5. **The live map tracker gains a journey mode.** `LiveMapTracker` accepts
   `stops`; the active act is routed live from the traveller, legs ahead are
   drawn faintly, acts advance on arrival (80 m) then departure (150 m) or by
   hand, and arrival repeats the keyword. Single-destination mode (the
   copilot) is unchanged except for the traveller marker, which is now the
   branded pine-and-gold compass instead of the blue dot.

## Consequences

- Privileges remain `confirmed: false` everywhere and are labelled
  "requested". Nothing on the pass promises a venue has agreed.
- "Pay once, show up" is the product promise printed on the pass. While the
  pass is simulated it sits beside an explicit notice that nothing was charged
  or reserved.
- The pass is not stored. Reprinting it means issuing a new one, with a new
  reference and keyword.

## Revisit when

- The booking aggregate lands (ADR-0016's revisit): a journey pass becomes a
  parent booking with one child booking per act, and the keyword is stored
  rather than derived.
- Venues contract privileges: flip `confirmed` per privilege.
- A host app exists: it should verify the signed QR, not the keyword.
