# Founder Decisions & External Blockers

**Date:** 2026-11-05
**Supersedes:** the 2026-10-20 edition of this document
**Companion to:** `docs/ROADMAP_IMPLEMENTATION_AUDIT.md` (same date)
**Scope:** what stands between the current `main` (HEAD `c01ac89`) and a
**Pune pilot that takes real bookings** at Amanora, Seasons Mall, Magarpatta
Cybercity, Hadapsar and Viman Nagar.
**Type:** Audit only. No code changed.

---

## Summary

Engineering has moved fast since 20 October: availability, a full booking
panel, Razorpay test checkout, itinerary engine, trips, concierge and cost
metering are built, and **953 unit tests pass**. What remains is a mix of
**one large engineering block** (the persisted booking aggregate) and
**external items with lead times** that should start now so they finish
alongside the code.

> **Standing instruction (Tejas, 2026-08-19, `PROJECT_STATE.md`):** pending
> business decisions must not block development. Assumptions stand in for them
> (`docs/ASSUMPTIONS.md`). This document applies that rule.

### Risk scale

- **CRITICAL** — the pilot cannot take a real booking without it.
- **HIGH** — the pilot can launch but carries legal, financial or security
  exposure.
- **MEDIUM** — degrades the pilot experience or operations.
- **LOW** — post-pilot or cosmetic.

### Blocker register

| #   | Blocker                                   | Type             | Risk         | Lead time (estimate)                         | Owner             | Changed since 10-20               |
| --- | ----------------------------------------- | ---------------- | ------------ | -------------------------------------------- | ----------------- | --------------------------------- |
| B1  | GST / TCS treatment (A-005)               | Founder + CA     | **CRITICAL** | 2–4 weeks (CA engagement + opinion)          | Tejas             | Unchanged — still not started     |
| B2  | Razorpay live merchant account + KYC      | External         | **CRITICAL** | 1–3 weeks (KYC, website review)              | Tejas             | New focus — test checkout built   |
| B3  | Booking / Payment aggregate               | Engineering      | **CRITICAL** | ~2 weeks                                     | Engineering       | New — the largest remaining build |
| B4  | Venue agreements for 16 pilot listings    | Founder / BD     | **CRITICAL** | 2–6 weeks (per-venue)                        | Founders          | **New**                           |
| B5  | Pilot availability slots                  | Data + Eng       | **CRITICAL** | 2–3 days once B4 gives hours/capacity        | Engineering + ops | **New**                           |
| B6  | Platform fee / margin model (A-003)       | Founder          | **CRITICAL** | Days once decided                            | Tejas             | Reframed for hostless model       |
| B7  | Cancellation & refund policy (A-004)      | Founder          | **HIGH**     | Days once decided                            | Tejas             | Unchanged                         |
| B8  | Voucher redemption at venue (QR scanner)  | Engineering + BD | **HIGH**     | ~1 week eng; venue training separate         | Engineering       | **New**                           |
| B9  | Real email delivery proven (Resend)       | External         | **HIGH**     | 1–2 days (domain DNS + test send)            | Tejas             | Provider changed SES → Resend     |
| B10 | Database TLS verification disabled        | Engineering      | **HIGH**     | < 1 day                                      | Engineering       | **New**                           |
| B11 | Error monitoring (Sentry)                 | Founder spend    | **HIGH**     | 1 day                                        | Tejas → Eng       | Unchanged                         |
| B12 | Production deploy target + config in repo | Founder + Eng    | **HIGH**     | 2–3 days                                     | Engineering       | Unchanged                         |
| B13 | Viman Nagar coverage                      | Founder / BD     | **MEDIUM**   | Depends on B4                                | Founders          | **New**                           |
| B14 | Static catalogue in AI surfaces           | Engineering      | **MEDIUM**   | 3–4 days                                     | Engineering       | **New**                           |
| B15 | Meta WhatsApp Cloud API                   | External         | **MEDIUM**   | 1–4 weeks (business verification, templates) | Tejas             | **New**                           |
| B16 | Twenty CRM event sync                     | Engineering      | **LOW**      | ~1 week                                      | Engineering       | **New**                           |
| B17 | CI red on formatting                      | Engineering      | **LOW**      | Minutes                                      | Engineering       | **New**                           |
| B18 | Editing published listings (A-009)        | Founder          | **LOW**      | None                                         | Tejas             | Less urgent — hostless pilot      |
| B19 | Admin 2FA recovery (A-012)                | Founder          | **LOW**      | None                                         | Tejas             | Unchanged                         |
| B20 | WCAG AA contrast on two tokens            | Founder sign-off | **LOW**      | < 1 day                                      | Tejas → Eng       | Unchanged                         |

Lead times are estimates for planning, based on typical provider processes;
they are not quotes from any provider.

**Critical path:** B4 (venue agreements) → B5 (slots) and B1/B6 (money model) →
B3 (booking aggregate, final money columns) → B2 (live keys) → launch. B1 and B4
have the longest external lead times and **should start this week**.

---

## CRITICAL

### B1. GST / TCS treatment (A-005)

**Why it matters more now.** Under the hostless model La Vivenzia is likely the
**seller of record** for every pilot booking, not a marketplace facilitating a
host's sale. That changes the GST answer (output tax on the full ticket vs. on a
commission) and possibly TCS applicability under Section 52. Every money column
in the booking aggregate depends on it.

**Evidence.** `docs/ASSUMPTIONS.md` A-005 = DEFERRED, reversal cost Very high,
last touched 2026-10-21. No invoice model; `quoteBooking` returns a single line
with no tax (`src/modules/booking/pricing.ts`).

**Needed from the CA:**

1. GST rate and SAC code for each pilot category (gaming, dining/F&B, brewery
   tasting, cinema, spa, workshops, guided walks) — they may differ.
2. Whether La Vivenzia is principal or agent for hostless listings.
3. Place-of-supply treatment (all pilot venues are in Maharashtra).
4. TCS liability as an e-commerce operator, and for which model.
5. Invoice issuer and format (B2C invoice per booking?).

**Unblocks:** final pricing lines, invoice table, payout/settlement ledger.

### B2. Razorpay live merchant account

**Evidence.** `RazorpayAdapter` implements `createOrder`,
`verifyCheckoutSignature` and `verifyWebhook`. **No `RAZORPAY_*` variables are
set locally** — not even test keys — so test-mode checkout has not been
exercised on this machine. Live keys are **refused in code**
(`resolveCheckoutMode`, `src/modules/booking/checkout.ts`) until B3 exists, by
design (ADR-0016).

**Actions:**

1. Confirm whether a Razorpay account exists and its KYC status.
2. If not, start onboarding now: business PAN, GST registration (links to B1),
   bank account, and a live website showing pricing, terms, refund policy (B7)
   and contact details — Razorpay reviews the site.
3. Issue **test keys** to engineering immediately so `razorpay_test` mode can
   be exercised end-to-end.
4. Configure a webhook secret once the webhook route exists (B3).

### B3. Booking / Payment aggregate (engineering)

**Evidence.** 14 Prisma models; none is `Booking`, `Payment`, `Voucher` or
`Ledger`. `ExperienceSlot.reservedCount` has no writer. Checkout confirmation
lives only in the browser. ADR-0016: "two people can 'confirm' the last seat."

**Scope (buildable now except money columns):** pending booking + seat hold in
one transaction against the existing CHECK constraint; hold expiry job
(pg-boss); idempotent Razorpay webhook as the authoritative confirmation path;
stored voucher with a signed code; confirmation email; ops booking list; audit
entries. Tax/fee columns land after B1/B6.

**Founder input needed:** none to _start_. B1/B6/B7 to _finish_.

### B4. Venue agreements for the pilot catalogue

**Why it matters.** All 16 pilot listings name real third-party businesses —
Smaaash, Mystery Rooms, Timezone, Effingut, The Beer Café, Agent Jack's,
Indimex, Third Wave Coffee, The Flour Works, Café Peter, Absolute Barbecues,
Spice Factory, Cinépolis VIP, O2 Spa, plus a lake walk and a pottery studio —
published under "La Vivenzia Pune Curations" (`src/data/pune-pilot.ts`). The
repository holds **no evidence of any agreement**, of venue sign-off on the
listed prices, durations and capacities, or of image rights for the cover
photos.

**Exposure if sold without it:** a traveller pays La Vivenzia for something
the venue has not agreed to honour; use of venue names and imagery without
permission.

**Needed per venue:** agreement (rate, inventory, cancellation terms),
confirmed price/duration/capacity, operating hours (feeds B5), redemption
process (feeds B8), settlement terms (feeds B6), image licence.

### B5. Pilot availability slots

**Evidence.** `scripts/seed-pune-pilot.ts` creates the host and 16 published
listings but **no `ExperienceSlot` rows**. Host UI routes now 307-redirect to
`https://host.lavivenzia.com` (`next.config.ts`), which is outside this
repository. There is no ops-side slot tool. In a freshly seeded database **no
pilot listing can be booked**, even in demo mode.

**Action.** Founders/ops supply hours and per-slot capacity per venue (from
B4). Engineering adds either a slot seed or an ops slot tool. Confirm whether
the host portal can manage slots for the pilot host account.

### B6. Platform fee / margin model (A-003)

**Reframed.** A-003 was written for a commission marketplace. For hostless
pilot listings the question becomes: **is the listed price the venue's price
plus a La Vivenzia markup, or the venue's price with a commission settled back
from the venue?** That choice interacts directly with B1.

**Also decide:** who absorbs the Razorpay fee (metered at 2.36 % in
`src/modules/metering/rates.ts`), and whether a convenience fee is shown to the
traveller.

---

## HIGH

### B7. Cancellation & refund policy (A-004)

Unchanged since October and still DEFERRED. Now also a **Razorpay onboarding
prerequisite** (a public refund policy page). Needs: windows and proportions,
who absorbs the gateway fee on refund, no-show treatment, and how it aligns
with each venue's own policy (B4).

### B8. Voucher redemption at the venue

**Evidence.** The booking voucher is on-screen and printable only
(`src/components/site/booking-panel.tsx`). The trip voucher QR is explicitly a
non-credential (`src/modules/trips/simulate.ts`). No redemption endpoint, no
venue-staff role, no scanner.

**Decision needed:** how venue staff verify a booking for the pilot —

- (a) **web scanner page** behind a venue-staff login (camera QR, works on any
  phone, no app store), or
- (b) **reference lookup** — staff type the booking code into a page, or
- (c) **manual list** emailed/WhatsApped to the venue each day.

Recommendation: (b) for launch, (a) shortly after. It needs no app-store review
and works with the stored voucher from B3.

### B9. Real email delivery

**Evidence.** The plan changed from AWS SES to Resend: `.env.local` now sets
`EMAIL_TRANSPORT=resend`, `RESEND_API_KEY` and `EMAIL_FROM` (names checked,
values not read). **The repository still contains no evidence of a delivered
email**, and `PROJECT_STATE.md` still says none has been sent. Sign-in is
OTP-by-email, so without delivery **no real user can log in**.

**Action.** Confirm the sending domain is verified in Resend (SPF, DKIM,
DMARC), send one real OTP to a founder inbox, and record the message id in
`docs/EMAIL.md`. Update `PROJECT_STATE.md` either way.

### B10. Database TLS verification disabled

**Evidence.** `src/lib/db.ts:23` sets `rejectUnauthorized: false` for every
`supabase.co` connection — **this is the production runtime path**.
`prisma/seed.ts`, `scripts/seed-pune-pilot.ts` and `scripts/verify-database.ts`
set `NODE_TLS_REJECT_UNAUTHORIZED = "0"` globally, and `.env.local` sets it
too, so `next build` and `next dev` run with certificate checks off for **all**
outbound HTTPS (Razorpay, Google, Resend).

**Decision needed:** none — engineering defect. Listed here because it must be
fixed before a payment touches the system. Fix: pin Supabase's published CA.

### B11. Error monitoring

Unchanged: no Sentry SDK, PostHog adapter is an 11-line stub,
`SENTRY_DSN`/`POSTHOG_KEY` unset. **Approve Sentry** (free tier suffices for a
pilot). Analytics can follow.

### B12. Production deploy target

**Evidence.** No app Dockerfile, `vercel.json`, Railway/Fly/Render config or
IaC in the repository. Supabase is evidently the database. CI exists but does
not deploy.

**Decision needed:** where the app runs (Vercel, Railway, a container on AWS
Mumbai). Constraints from the code: a long-running worker (`npm run worker`,
pg-boss) is required alongside the web process, and the FinOps meter is
in-process memory — it under-reports on serverless or multi-instance hosts.

---

## MEDIUM

### B13. Viman Nagar coverage

**Evidence.** 0 listings, 0 concierge hotspots, 0 mentions anywhere in `src/`.
The four other pilot locations are covered (Amanora 6, Seasons Mall 6,
Magarpatta 2 standalone, Hadapsar 2 standalone).

**Decision:** sign Viman Nagar venues for launch (Phoenix Marketcity area), or
formally drop Viman Nagar from the pilot scope and the marketing copy.

### B14. AI surfaces read a static catalogue

**Evidence.** Itinerary, concierge, trips and journeys import
`PILOT_EXPERIENCES` from source rather than reading PostgreSQL. An ops
suspension or price change in the database is invisible to them, and they
cannot see availability.

**Decision:** none — engineering. Must land before real bookings, or a
suspended venue keeps being recommended.

### B15. Meta WhatsApp Cloud API (Live Travel Companion)

**Evidence.** Only a `api.whatsapp.com/send?text=…` share link exists
(`TripArchitectView.tsx:506`). No adapter, no env variables, no webhook
verification route, no templates. Metering rates are ready.

**Actions if it is a launch criterion:** Meta Business verification, a
dedicated WhatsApp Business number, display-name approval, utility templates
(booking confirmation, reminder) submitted for review. These steps carry most
of the lead time. **Recommendation:** post-pilot; use the share link plus a
human-staffed WhatsApp Business number for the pilot.

---

## LOW

### B16. Twenty CRM event sync

0 references in `src/`. Recommend post-pilot; until then ops can use the
booking list from B3.

### B17. CI fails on formatting

`specs/FINOPS_METERING_SPEC.md` (committed) is not Prettier-formatted, so CI's
first job fails at `format:check` before tests run. `npx prettier --write
specs/` fixes it.

### B18. Editing published listings (A-009)

Less urgent than in October: pilot listings are owned by La Vivenzia and
edited by engineering via seed. Becomes urgent again when external hosts list
through the host portal.

### B19. Admin 2FA recovery (A-012)

Unchanged. Decide recovery codes vs. super-admin reset. TOTP replay prevention
should land before the live payment path.

### B20. WCAG AA contrast

`--lv-accent-ink` and `--lv-fg-subtle` still fail AA in both light palettes. A
fix is proposed in `docs/VISUAL_IDENTITY_DECISION.md` §7.1 and awaits founder
sign-off. Per `CLAUDE.md`, not to be changed ad hoc.

---

## Resolved or reduced since 2026-10-20

| Item (Oct)                   | Now                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| 120 uncommitted paths        | ✅ Committed and pushed; `main` level with `origin/main`                                           |
| Availability & slots (FR-08) | ✅ Built — `ExperienceSlot` + DB capacity constraints + host API                                   |
| Google Maps spend            | ✅ Reduced — Places (New) adapter built and metered; key present locally; map embed is keyless OSM |
| Razorpay adapter             | ✅ Order creation + signature verification built (test keys only)                                  |
| AWS SES account              | ↪ Superseded by Resend — see B9                                                                    |
| A-009 urgency                | ↓ Reduced by the hostless pilot model                                                              |

---

## What engineering can do now, with no founder input

| Work                                                     | Blocker it clears |
| -------------------------------------------------------- | ----------------- |
| Format `specs/` so CI is green                           | B17               |
| Pin Supabase CA; remove TLS overrides                    | B10               |
| Booking aggregate structure, seat hold, webhook, voucher | B3 (structure)    |
| Voucher reference-lookup page + venue-staff role         | B8 (option b)     |
| Slot seed tooling (data to follow from B4)               | B5                |
| Route AI surfaces through the discovery port             | B14               |
| Integration tests for slots and checkout                 | —                 |
| Browser pass on booking panel, itinerary, trips          | —                 |

**Must wait:** tax and fee lines (B1, B6), refund flow (B7), live mode (B2),
any listing beyond the current 16 (B4, B13).

---

## Action items for the founders

| #   | Action                                                                        | Clears      | Urgency                                |
| --- | ----------------------------------------------------------------------------- | ----------- | -------------------------------------- |
| 1   | Engage a CA on GST/TCS for the hostless model                                 | B1          | **This week** — critical path          |
| 2   | Start venue agreements; collect hours, capacity, price sign-off, image rights | B4, B5, B13 | **This week** — critical path          |
| 3   | Start or confirm Razorpay KYC; send test keys to engineering now              | B2          | **This week**                          |
| 4   | Decide markup vs. commission and who absorbs the gateway fee                  | B6          | Before booking aggregate money columns |
| 5   | Decide cancellation/refund windows                                            | B7          | Before Razorpay website review         |
| 6   | Choose voucher redemption method (recommend reference lookup)                 | B8          | Next 1–2 weeks                         |
| 7   | Send one real OTP email; confirm domain verification                          | B9          | This week                              |
| 8   | Approve Sentry; choose a deploy target                                        | B11, B12    | Before production                      |
| 9   | Viman Nagar: sign venues or drop from scope                                   | B13         | Before marketing copy                  |
| 10  | Decide whether WhatsApp Cloud API is a launch criterion                       | B15         | Before pilot date is fixed             |

---

## Evidence index

`src/modules/booking/checkout.ts` · `src/modules/booking/pricing.ts` ·
`src/adapters/payments/razorpay/index.ts` · `src/modules/metering/rates.ts` ·
`src/modules/metering/service.ts` · `src/data/pune-pilot.ts` ·
`scripts/seed-pune-pilot.ts` · `src/lib/db.ts` · `prisma/schema.prisma` ·
`prisma/migrations/20261020191332_experience_availability_slots` ·
`src/modules/trips/simulate.ts` · `src/components/site/booking-panel.tsx` ·
`src/components/trips/TripArchitectView.tsx` · `next.config.ts` ·
`src/modules/concierge/options.ts` · `docs/adr/0016-booking-flow-demo-and-test-checkout.md`
· `docs/ASSUMPTIONS.md` · `PROJECT_STATE.md` · `.env.example` and `.env.local`
(variable **names** only — no values read or printed)
