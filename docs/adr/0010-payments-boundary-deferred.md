# ADR-0010: Razorpay boundary established, payment logic deferred

- **Status:** Accepted (boundary) — business logic **blocked**
- **Date:** 2026-08-19

## Context

FR-10 and FR-11 require Razorpay integration, invoices, refunds, commissions, a
host payout ledger and reconciliation. `SYSTEM_DESIGN.md` §8 requires
server-side verification, idempotent webhooks and auditable state.

Three product decisions remain unresolved, and each determines column-level
schema rather than merely behaviour:

- **GST/TCS structure** — whether La Vivenzia is a supplier or an e-commerce
  operator collecting TCS. Determines the invoice and tax tables. Requires
  professional tax advice, not an engineering judgement.
- **Cancellation and refund policy** — tiers, thresholds, and who absorbs the
  platform fee. Determines the refund schema.
- **Platform fee model** — no requirement defines it.

Implementing payment logic against invented rules would produce a schema that has
to be migrated under launch pressure, with money already flowing through it.

## Decision

**Establish the boundary; implement no business logic.**

`src/ports/payments.ts` defines the port. `src/adapters/payments/razorpay/`
implements it with:

- `verifyWebhook` **fully implemented** — HMAC-SHA256 over the raw body, compared
  in constant time, verified _before_ parsing, returning the provider event ID as
  the idempotency key. This is a security boundary rather than business logic,
  and getting it wrong later is expensive. Covered by tests, including that a
  malformed body with a bad signature fails as a signature error, proving
  unverified input is never parsed.
- `createOrder` and `fetchPayment` throwing `NotImplementedError`, so an
  accidental call fails loudly rather than returning empty data.

Design constraints recorded now, binding on the payments phase:

- Money is always integer minor units (paise). Never floating point. Currency
  stored explicitly, so international expansion stays possible.
- Booking and Payment are separate aggregates with explicit state machines,
  transitioned only through domain services, each writing an append-only event
  row that serves as both audit trail and reconciliation source.
- Inventory holds are created in the same transaction as the pending booking,
  with row-level locking on the availability slot.
- Webhooks: persist the raw event first (unique on provider event ID), return 200
  immediately, process asynchronously via the queue.
- The client-side success callback is a UX signal only. Confirmation happens on
  webhook, with a server-side reconciliation sweep as the backstop.
- Commission rates are snapshotted onto the booking at confirmation, never
  recomputed — changing the rate must not alter historical bookings.
- Payout disbursement (Razorpay Route) is deferred; the ledger produces a payable
  statement and payouts are recorded back into it.
- Use hosted Razorpay Checkout. Card data never touches our servers, keeping PCI
  scope at SAQ-A. This is a hard rule.

## Consequences

- The webhook endpoint cannot be built until the persistence table exists, which
  is part of the payments phase.
- `RAZORPAY_WEBHOOK_SECRET` is the only Razorpay credential currently used.

## Revisit when

The founder resolves GST/TCS structure, cancellation policy and platform fee.
All three block the payments phase.
