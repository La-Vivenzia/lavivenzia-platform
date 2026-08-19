# Domain modules

Framework-independent business logic. This layer is the reason the
single-deployable topology was acceptable (ADR-0002): because nothing here
imports Next.js, extracting a standalone API service later is mechanical rather
than a rewrite.

Enforced by lint (eslint.config.mjs, domainBoundary):

- no `next`, `next/*`, `react`, or `server-only` imports;
- no imports from `@/app`, `@/components`, or `@/adapters`.

A module depends on `@/ports` for anything external, and receives concrete
implementations by injection at the composition root.

Modules planned per SYSTEM_DESIGN.md §4 — only `auth` exists so far. The
marketplace modules (experiences, availability, bookings, payments, invoices,
refunds, commissions, payouts, ledger, search, discovery, itineraries, reviews,
wishlists, notifications, analytics, admin, audit) are added in later phases,
several of them blocked on the decisions in PROJECT_STATE.md.
