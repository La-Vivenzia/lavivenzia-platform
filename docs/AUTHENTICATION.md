# Authentication & Identity

Implements ADR-0005. Server-side sessions, database-backed RBAC, argon2id
passwords, email OTP for travellers, and TOTP as a second factor for privileged
roles.

## Layering

```
src/app/api/v1/auth/*      HTTP adapters — thin: validate, call, map
src/lib/auth-context.ts    cookies, request context, principal resolution
src/lib/container.ts       composition root — wires adapters into the service
src/modules/auth/          domain: service, policy, credentials  (framework-free)
src/adapters/persistence/  Prisma implementations of the auth ports
```

`src/modules/auth` imports no framework and no database driver. The service
receives repositories and a clock; the HTTP layer owns cookies and status codes.

## Endpoints

| Method | Path                       | Auth    | Purpose                                     |
| ------ | -------------------------- | ------- | ------------------------------------------- |
| POST   | `/api/v1/auth/register`    | none    | Traveller (passwordless) or host (password) |
| POST   | `/api/v1/auth/otp/request` | none    | Issue a traveller login code                |
| POST   | `/api/v1/auth/otp/verify`  | none    | Exchange a code for a session               |
| POST   | `/api/v1/auth/login`       | none    | Password login (hosts, admins)              |
| POST   | `/api/v1/auth/logout`      | session | Revoke the current session                  |
| GET    | `/api/v1/auth/me`          | session | Current principal and permissions           |
| POST   | `/api/v1/auth/mfa/enroll`  | session | Begin TOTP enrolment                        |
| POST   | `/api/v1/auth/mfa/verify`  | session | Satisfy MFA for this session                |

All requests are Zod-validated, all responses carry `x-correlation-id`, and all
errors use the shared shape from `src/lib/errors.ts`.

## Flows

**Traveller** — register → request code → verify code → session. Passwordless;
completing a code also marks the address verified.

**Host / admin** — register with password → login → session. Where the account
holds a privileged role, the session is created **MFA-unsatisfied** and
`authorize()` denies every privileged permission until `mfa/verify` succeeds.

## Security properties

Each of these is covered by a test; the reasoning is in the code.

**Enumeration.** `otp/request` always returns 202 and `login` returns one
message for unknown account, wrong password, and suspended account. Login runs
an argon2 verification against a dummy hash when no account exists, so the
timing of both branches matches — otherwise the response time alone enumerates
users.

Registration _does_ report a duplicate address. That is a deliberate trade-off:
the alternative silently succeeds and emails the existing owner, turning
enumeration into a spam vector and a confusing flow. The paths where
enumeration actually matters do not leak.

**Brute force.** Three independent controls, all required together: a 10-minute
code lifetime, a 5-attempt cap per challenge after which the code is burned even
if correct, and rate limits on issuance. Limits apply on **two** keys —
identifier and client IP — because either alone is bypassable.

**Session fixation.** A fresh 256-bit token is minted on every login; no
pre-authentication session is ever upgraded. In production the cookie uses the
`__Host-` prefix, which browsers reject unless it is Secure, `Path=/`, and has
no `Domain` — preventing a compromised sibling subdomain from writing a session
into this origin.

**Session theft.** Only a SHA-256 hash of the token is stored, so a database
disclosure yields no usable sessions. Revocation, suspension and soft-delete all
take effect on the next request — the reason sessions are server-side rather
than JWTs.

**CSRF.** `SameSite=Lax` is the primary control. An `Origin` check against
`APP_URL` runs on every state-changing endpoint as defence in depth. Note the
check is strict about **port**: if `APP_URL` does not match the serving origin
exactly, every browser POST is rejected with 403.

**Cookies.** `httpOnly` (an XSS bug cannot exfiltrate the session), `Secure` in
production, `SameSite=Lax`, `Path=/`, and a `Max-Age` matching the session
lifetime.

**Secrets.** Passwords are argon2id (64 MiB, 3 passes, 4 lanes — RFC 9106).
Codes and session tokens are stored hashed. The TOTP provisioning URI carries
the shared secret and is returned once, over an authenticated channel, never
logged.

**Authorization bypass.** Registration refuses any role outside
`{traveller, host}`, so privileged roles cannot be self-assigned. Enforcement
lives in the pure `authorize()` at the service layer, not only at route
handlers, so worker jobs and internal callers are governed identically. A role
key present in the database but absent from code is filtered out rather than
cast, so a stale grant cannot widen permissions.

**Step-up.** Money-moving and privilege-granting permissions require
authentication within the last 15 minutes, on top of MFA.

## Session lifetimes

| Actor                 | Absolute | Idle       |
| --------------------- | -------- | ---------- |
| Traveller             | 30 days  | 30 days    |
| Host                  | 7 days   | 7 days     |
| Admin / Ops / Finance | 8 hours  | 30 minutes |

A user holding several roles gets the **strictest** lifetime, never the most
permissive — otherwise an admin who is also a traveller would hold an 8-hour
role in a 30-day session.

## Known limitations

- **No email transport.** The SES adapter is a boundary with no implementation,
  so `deliverOtp` logs the code in development and **throws in production**.
  Failing loudly is deliberate: a deploy that cannot send mail must not appear
  to work while every traveller is locked out. This blocks traveller login in
  any deployed environment.
- **No Google OAuth.** ADR-0005 specifies it alongside email OTP for travellers.
  It needs a Google Cloud project and client credentials — a founder decision,
  not an engineering one.
- **TOTP replay within a window.** A code stays valid for its 30-second period
  (plus one period of drift either side). Preventing reuse needs a stored
  last-accepted counter per user. It matters most for step-up actions and should
  land with the first money-moving endpoint.
- **No password reset or email-change flow.** Both need the email transport.
- **No admin bootstrap.** The seed creates no users by design, so no account can
  yet reach a privileged role. An operational procedure is required.
- **`x-forwarded-for` is trusted** for rate-limit keys. Correct behind the ALB,
  which rewrites it; exposing the app directly would make it attacker-controlled.
