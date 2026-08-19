# ADR-0005: Server-side sessions and database-backed RBAC

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

FR-04, FR-05, FR-14 and FR-20 require traveller, host and admin authentication
with RBAC, audit logging and consent handling. `REQUIREMENTS.md` §2 defines six
actors, so a boolean admin flag is not sufficient.

Hosted identity providers were considered and rejected: they split user ownership
across two systems, which contradicts `PROJECT.md` §6 (PostgreSQL is the source
of truth; database ownership must remain explicit), complicate the
host-to-KYC-to-payout linkage, weaken the audit trail FR-15 requires, and carry
per-MAU cost that scales with the marketplace.

## Decision

**Identity is owned entirely in PostgreSQL.**

**Sessions are opaque random tokens, not JWTs.** 256 bits of entropy, stored as a
SHA-256 hash in `sessions.token_hash` — a database disclosure must not yield live
sessions. A plain hash rather than a slow KDF is correct here because the token
is high-entropy random, not a human secret; there is nothing to brute force.

JWTs were rejected because revocation must be immediate: suspending a fraudulent
host or deprovisioning an admin cannot wait for token expiry, and the audit trail
needs to attribute actions to a specific session.

**Mobile-readiness without a rewrite:** the session table carries both transports.
Phase 2 mobile uses short-lived bearer tokens plus rotating server-side refresh
tokens against the same table.

| Actor                 | Method                                           | Lifetime              |
| --------------------- | ------------------------------------------------ | --------------------- |
| Traveller             | Email OTP and Google OAuth                       | 30 days sliding       |
| Host                  | Password (argon2id) and TOTP                     | 7 days                |
| Admin / Ops / Finance | Password and **mandatory TOTP**, no social login | 8h absolute, 30m idle |

**RBAC is data, not code**: `roles`, `permissions`, `role_permissions`,
`user_roles`. Operations can grant and revoke without a deploy.

**Authorization is enforced at the service layer**, not only at route handlers,
so worker jobs and internal callers are governed identically. Route-only checks
are how privilege-escalation bugs happen.

**Step-up re-authentication** is required for money-moving and privilege-granting
actions even inside an MFA-satisfied session, within a 15-minute window.

Authorization checks MFA before permissions, deliberately: a privileged role on
an unverified session must not learn which permissions exist.

## Consequences

- Every session check is a database read. Acceptable at launch volume; if it
  becomes hot, cache with a TTL that never exceeds the revocation SLA.
- `REQUIREMENTS.md` §5 needs `Session`, `Role`, `Permission`, `UserRole` and
  `ConsentRecord` added to the entity list.
- TOTP secrets must be encrypted at rest by the application before storage.

## Revisit when

Session lookup becomes a measured bottleneck, or a compliance requirement
mandates a specific identity provider.
