# ADR-0016: Interactive booking flow with demo and Razorpay test-mode checkout

- **Status:** Accepted
- **Date:** 2026-10-28
- **Decides:** how the traveller booking flow ships before bookings are persisted

## Context

Phase 6 opens with the traveller booking flow on the experience page: date, time,
party size, an INR price breakdown, Razorpay checkout and a confirmation with a
voucher and the venue.

ADR-0010 still holds. No `Booking` or `Payment` table exists. The platform fee
(A-003), the cancellation policy (A-004) and GST/TCS (A-005) are undecided, and no
live Razorpay credentials have been issued. Taking real money now would leave
nothing on record to reconcile, refund or honour.

## Decision

Ship the full flow, and put three hard limits on how it can complete.

`BOOKING_CHECKOUT` has three values:

- `off` — dates, times, guests and price all work; the reserve button is closed.
  This is the default in production.
- `demo` — no payment provider. The server signs the confirmation itself. This is
  the default outside production.
- `razorpay_test` — hosted Razorpay Checkout using **test keys only**.
  `resolveCheckoutMode` refuses an `rzp_live_` key, and there is no live mode.

The rules that apply in every mode:

- **The browser chooses; the server decides.** `POST …/checkout` accepts only a
  slot id and a guest count. It re-checks them against `listBookable` (the same
  rule the slots endpoint uses), checks the party size against the host's minimum
  and maximum and the seats left, and prices the booking with `quoteBooking`.
  The panel runs the same function to show a preview.
- **The intent is a signed, stateless token.** It is HMAC-SHA256 signed with a key
  derived from `SESSION_SECRET` and a purpose label, and it expires after
  30 minutes. While there is no table, it does the job a pending booking row will
  do later.
- **Confirmation happens on the server.** `POST …/checkout/confirm` verifies the
  intent. In test mode it also checks the Razorpay payment signature against the
  order id stored in the intent. Only after that does it return the venue.
- **Order creation is never retried.** Razorpay orders have no idempotency key.
  The adapter enforces an 8-second timeout, maps provider errors, and rejects an
  order whose amount or currency differs from the request.
- **Fees and taxes are left out on purpose.** The quote has one line, the host's
  price, until A-003 and A-005 are decided.
- **Nothing in the UI overclaims.** References start with `DEMO-` or `TEST-`, and
  every confirmation states that no seat was held and no real money moved.

## Consequences

- Travellers, founders and QA can go through the whole flow today, and test-mode
  payments run through Razorpay end to end.
- **No seat is reserved.** `reservedCount` does not change, so two people can
  "confirm" the last seat. That is acceptable only because no mode takes real
  money.
- No email or stored voucher exists. The confirmation lives only in the browser,
  with a print option.
- Checkout does not require sign-in, because there is no traveller record to
  attach a booking to yet.

## Revisit when

The booking aggregate is built. At that point:

- `prepare` creates a pending booking and a seat hold in one transaction.
- `confirm` becomes a state transition, with webhook confirmation as the
  authoritative path.
- A live mode is added.

The contract between the panel and the API (`src/modules/booking/contract.ts`)
should not need to change.
