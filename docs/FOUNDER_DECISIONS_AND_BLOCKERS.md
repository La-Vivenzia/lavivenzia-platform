# Founder Decisions & External Blockers

**Date:** 2026-10-20
**Companion to:** `docs/ROADMAP_IMPLEMENTATION_AUDIT.md`
**Type:** Audit only. Nothing changed, staged, committed or deployed.

---

## Summary

Eight items. **Only two genuinely block engineering today**, and both are
external waits rather than decisions — which means they should start now and
finish while code is written. Four more block _completion_ of Phase 6 but not
its start. Two block nothing.

> **Standing instruction (Tejas, 2026-08-19, recorded in `PROJECT_STATE.md`):**
> pending business decisions must not block development. Assumptions made in
> their place are registered in `docs/ASSUMPTIONS.md`. This document applies
> that rule rather than re-opening it.

| #   | Item                               | Priority | Blocks now?                      | Lead time                 |
| --- | ---------------------------------- | -------- | -------------------------------- | ------------------------- |
| 1   | GST / TCS (A-005)                  | **P0**   | No — blocks Phase 6 _completion_ | **Longest in project**    |
| 2   | AWS email account                  | **P0**   | **Yes — blocks real users**      | Support request + waiting |
| 3   | Platform fee (A-003)               | P1       | No                               | None once decided         |
| 4   | Cancellation / refund (A-004)      | P1       | No                               | None once decided         |
| 5   | Google Maps spend                  | P2       | No                               | Account setup             |
| 6   | Error-monitoring spend             | P2       | No — blocks production           | Account setup             |
| 7   | Editing published listings (A-009) | P2       | No — default in place            | None                      |
| 8   | Admin 2FA recovery (A-012)         | P2       | No                               | None                      |

---

## 1. GST / TCS treatment (A-005) — P0

**Why it matters.** It decides the _column structure_ of every record holding
money. A wrong guess is not a settings change — it is migrating live financial
data.

**Blocks.** Phase 6 completion: invoice foundation, commission, payout ledger,
reconciliation. **Does not block Phase 6 starting.**

**Evidence.** `docs/ASSUMPTIONS.md` A-005 = DEFERRED, "needs a chartered
accountant", reversal cost **Very high**. `PROJECT_STATE.md`: _"longest external
lead time in the project and has still not been started."_ No `Invoice` model
exists; **no financial arithmetic exists anywhere** —
`experiences.base_price_minor` holds the host list price only.

**Genuinely blocking?** Not today. But it is the **critical path to launch**:
every week of delay lands at the _end_ of Phase 6, not the beginning.

**Action.** Engage a chartered accountant. Needed: GST rate and place-of-supply
treatment for experiences, whether La Vivenzia is a TCS-liable e-commerce
operator, and invoicing responsibility (platform vs host).

---

## 2. AWS email-sending account — P0, the only true hard blocker

**Why it matters.** Login codes are delivered by email. Without a sending
account **no real customer can sign in.**

**Blocks.** Any real user, any pilot, any production launch. Phase 12.

**Evidence.** `src/adapters/email/ses/index.ts` — 257 lines, retry/backoff,
throttle handling, config guards. **58 mock tests pass.** `EMAIL_TRANSPORT`,
`EMAIL_FROM`, `SES_CONFIGURATION_SET` unset locally; `AWS_REGION` set. No
delivery evidence anywhere in the repository. Checklist: `docs/EMAIL.md`.

> **Caveat:** missing local config is **not proof no AWS account exists**. This
> audit can only say the repository shows no configured provider and no
> delivered message. **Please confirm whether an account already exists** —
> if it does, this drops to a configuration task.

**Genuinely blocking?** **Yes**, for real users. No, for continued development
(the console transport works locally).

**Action.** Confirm whether an AWS account exists. If not, create one, verify
the sending domain (DKIM, SPF, DMARC), and **file the production-access request
to leave the SES sandbox** — that request has a waiting period, so it should be
filed before it is needed.

---

## 3. Platform fee / commission (A-003) — P1

**Why it matters.** Determines what the platform earns and what the host is
owed. Sits in the same money columns as GST.

**Blocks.** Commission calculation, payout ledger, final checkout totals.

**Evidence.** A-003 = DEFERRED, reversal cost **High if guessed**. No
`Commission` model. ADR-0010 records payments as a deliberate boundary.

**Genuinely blocking?** No. Availability, cart structure and the booking state
machine can all be built first. It blocks the moment an _amount_ is computed.

**Action.** Decide the percentage (or tiers) and **the base it applies to** —
host price only, or price including add-ons. The base matters as much as the
number.

---

## 4. Cancellation & refund policy (A-004) — P1

**Why it matters.** Determines refund records, payment state transitions and
what a traveller is promised at checkout.

**Blocks.** Refund flow, cancellation, rescheduling, payment state machine.

**Evidence.** A-004 = DEFERRED, reversal cost **High if guessed**. No `Refund`
model.

**Genuinely blocking?** No — a booking can be created and paid before a
cancellation policy exists, though it should not ship to customers that way.

**Action.** Define the windows and proportions (e.g. free >7 days, 50% 2–7 days,
none <48h), who absorbs the payment-gateway fee, and whether hosts may set their
own policy within platform bounds.

---

## 5. Google Maps spend — P2

**Why it matters.** Location search, geocoding and autocomplete work **today**
through the catalogue fallback. A key adds a real provider and an embedded map.

**Blocks.** Embedded interactive map only. Not search, not location.

**Evidence.** `src/adapters/maps/google/index.ts` — 243 lines, real
implementation, no stubs. `src/adapters/maps/fallback.ts` serves when Google is
absent, throttled or down. `GOOGLE_MAPS_API_KEY` **unset**, so the Google path
has never been exercised against the live API here.

**Genuinely blocking?** **No.** The fallback is what has actually been tested.

**Action.** Approve a Google Cloud account with billing, or confirm the
catalogue fallback is acceptable for launch. Note the embedded map needs a
_browser-published_ key, which is a separate security consideration.

---

## 6. Error-monitoring spend — P2, blocks production not development

**Why it matters.** Without it, a production failure is discovered by a customer
rather than by a tool.

**Blocks.** Phase 11 completion and responsible production launch.

**Evidence.** PostHog adapter is an **11-line stub**; `SENTRY_DSN` and
`POSTHOG_KEY` unset. Structured logging with correlation IDs exists (pino) but
nothing collects it outside a terminal.

**Genuinely blocking?** No for development. **Yes for go-live.**

**Action.** Approve Sentry (errors) at minimum. Analytics can follow.

---

## 7. Editing a published listing (A-009) — P2, increasingly urgent

**Why it matters.** Listings are now traveller-visible, so a host edit changes
what a customer sees.

**Blocks.** Nothing. A conservative default is already in place.

**Evidence.** A-009 = ASSUMED, "conservative default", reversal cost
**Trivial**. Published listings are currently **not editable**.
`PROJECT_STATE.md` flags it as _"now urgent rather than merely answerable."_

**Genuinely blocking?** No. But the cost of changing it rises as hosts
accumulate live listings.

**Action.** Confirm the default, or choose: allow the edit and return the
listing to review.

---

## 8. Admin two-factor recovery (A-012) — P2

**Why it matters.** An operator who loses their phone cannot sign in. The only
recovery today is editing the database by hand.

**Blocks.** Nothing technically. It is an operational risk that grows with team
size.

**Evidence.** `PROJECT_STATE.md` open items: _"There is no supported path; the
only recovery is a direct database update. Fine with one operator, not fine with
a team."_ TOTP is implemented and tested (`password-totp`, `totp-qr`).

**Genuinely blocking?** No.

**Action.** Decide the policy — recovery codes issued at enrolment, or
super-admin reset with an audit entry. Related engineering item, no decision
needed: **TOTP replay prevention must land before the first money-moving
endpoint ships.**

---

## What engineering can proceed with in parallel

**Needs no decision at all:**

| Work                                                | Why it is unblocked                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Availability & slots (FR-08)**                    | Stores _when_ an experience runs, not what it costs. Also closes a Phase 4 gap |
| Cart and booking state machine **structure**        | Shape can be built before amounts exist                                        |
| TOTP replay prevention                              | Pure engineering; required before any payment endpoint                         |
| Commit and push the 120 uncommitted paths           | Ten minutes; lets CI validate eight weeks of work                              |
| Browser verification of the identity                | Never done; four milestones' defects were found only this way                  |
| Visual regression + contrast tooling                | No automated design guard exists beyond `button-variants`                      |
| WCAG AA fix for `--lv-accent-ink`, `--lv-fg-subtle` | Defect correction; values proposed in `VISUAL_IDENTITY_DECISION.md` §7.1       |
| Traveller profile / wishlist (Phase 3 gap)          | No pending decision                                                            |

**Must wait for decisions:** anything that computes or stores an amount —
commission (A-003), refunds (A-004), invoices and tax (A-005), payouts.

---

## Required before booking & payments can be **completed**

1. **A-005 GST/TCS** — invoice and tax columns
2. **A-003 platform fee** — commission and totals
3. **A-004 cancellation/refund** — refund records and payment states
4. **Razorpay credentials** — `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET` all unset (names only; no values inspected)

Phase 6 can **start** without any of them.

---

## Action items

| #   | Action                                                                      | Owner       | Urgency                              |
| --- | --------------------------------------------------------------------------- | ----------- | ------------------------------------ |
| 1   | Engage a chartered accountant on GST/TCS                                    | Tejas       | **This week** — critical path        |
| 2   | Confirm whether an AWS account exists; if not, create and file sandbox exit | Tejas       | **This week** — has a waiting period |
| 3   | Decide platform fee and its base                                            | Tejas       | Before amounts are computed          |
| 4   | Decide cancellation/refund windows                                          | Tejas       | Before checkout ships                |
| 5   | Approve Sentry; decide on Google Maps                                       | Tejas       | Before production                    |
| 6   | Confirm A-009 default and A-012 policy                                      | Tejas       | One line each                        |
| 7   | Build availability & slots (FR-08)                                          | Engineering | **Start now — unblocked**            |
| 8   | Commit/push 120 paths; verify in browser                                    | Engineering | Now — no approval needed             |

---

## Evidence index

`docs/ASSUMPTIONS.md` (A-001…A-016) · `PROJECT_STATE.md` (blockers, open items)
· `docs/EMAIL.md` · `docs/adr/0010-payments-boundary-deferred.md` ·
`docs/adr/0007-llm-and-embeddings.md` · `src/adapters/payments/razorpay/index.ts`
· `src/adapters/email/ses/index.ts` · `src/adapters/maps/google/index.ts` ·
`src/adapters/maps/fallback.ts` · `prisma/schema.prisma` · `.env.example`
(variable **names** only — no values were read or printed)
