# Transactional Email

Implements ADR-0011. **Resend** behind `EmailPort`, with Amazon SES retained as
a verified rollback path and a console transport for local development.

> **Provider migrated to Resend on 2026-10-21.** SES was not removed: it is
> fully implemented and tested, and rolling back is a single environment
> variable. See "Rollback" below.

## Layering

```
src/modules/notifications/email-templates.ts   subject + text + HTML  (framework-free)
src/ports/email.ts                             the interface callers depend on
src/adapters/email/transport.ts                which transport, and whether it is allowed
src/adapters/email/resend/                     Resend — the only file that knows Resend exists
src/adapters/email/ses/                        Amazon SES — retained for rollback
src/adapters/email/console/                    development transport: renders and logs
src/adapters/email/index.ts                    reads configuration, builds the adapter
src/lib/container.ts                           wires it into the auth service
```

Callers name a template and pass variables. They never build a body, never see a
provider, and cannot send an unrendered message — `EmailMessage` is distributed
over the template map, so a payload that does not match the named template is a
compile error.

## Flows that send today

| Template          | Sent by                                | Trigger                         |
| ----------------- | -------------------------------------- | ------------------------------- |
| `auth.login-code` | `AuthService.requestLoginOtp` (inline) | Traveller requests a login code |

That is the complete list, deliberately. Email verification has a schema purpose
(`OtpPurpose.EMAIL_VERIFICATION`) but no flow that issues one, and there is no
password-reset flow at all — adding either means adding authentication surface,
which belongs to the milestone that owns it rather than to this one. Both are a
template entry and a call site away once those flows exist.

## Configuration

| Variable                | Required           | Purpose                                             |
| ----------------------- | ------------------ | --------------------------------------------------- |
| `EMAIL_TRANSPORT`       | defaults `console` | `ses` or `console`. Production must be `ses`.       |
| `EMAIL_FROM`            | in production      | Sender address; must be a **verified** SES identity |
| `AWS_REGION`            | yes (defaulted)    | SES endpoint region                                 |
| `SES_CONFIGURATION_SET` | no, but see below  | Routes bounce and complaint events                  |

**No AWS credentials are configured here.** The SDK resolves them through the
standard provider chain, which in a deployed environment means the task's IAM
role. There is no access key to store, rotate, or leak. Locally, if you ever
need to send through real SES, use `aws sso login` or `AWS_PROFILE` — never keys
in `.env.local`.

A configuration set is optional to boot but not optional in practice: it is what
publishes bounce and complaint events. Without one, those signals never reach us
and the sending reputation degrades unobserved until SES pauses the account.

## What AWS must supply

None of this is done yet — the account is being arranged separately. Once it
exists, the application side needs no code change, only these values.

1. **A verified sending identity.** Preferably the domain (`lavivenzia.com`),
   not a single address: a domain identity lets any address under it send, and
   is what DKIM attaches to.
2. **DKIM signing enabled**, with the three CNAME records published in DNS.
   Unsigned mail from a new domain is routinely filed as spam.
3. **SPF alignment** — a `v=spf1 include:amazonses.com` record, and a custom
   MAIL FROM subdomain so SPF aligns with the From domain.
4. **A DMARC record**, starting at `p=none` with reporting, tightened once the
   reports are clean.
5. **Production access.** A new SES account is in the sandbox, which only sends
   to addresses that are themselves verified — every real traveller login would
   fail. Leaving the sandbox is a support request and it has lead time; it is
   the item on this list to start first.
6. **An IAM policy** for the task role, `ses:SendEmail` on the identity, scoped
   to the sending identity rather than `*`.
7. **A configuration set** with an event destination for bounces and complaints.
8. **The values themselves**, into Secrets Manager / SSM (ADR-0009):
   `EMAIL_TRANSPORT=ses`, `EMAIL_FROM`, `AWS_REGION`, `SES_CONFIGURATION_SET`.

Until step 5 completes, a deployed environment can be configured correctly and
still fail to reach anyone outside the verified list. That is a sandbox
restriction, not a defect.

## Local development

Nothing to configure. `EMAIL_TRANSPORT` defaults to `console`, which renders the
message through the same template code SES uses and writes it to the log:

```
WARN  email NOT sent — development transport; message logged instead
    transport: "console"
    to: "traveller@example.com"
    subject: "482913 is your La Vivenzia login code"
    body: "Your La Vivenzia login code is 482913. ..."
```

Copy the code from `body` to complete a login. Because it renders through the
real template code, a broken template fails on a laptop rather than in
production.

## Reliability

**Timeouts.** Three seconds to connect, four to complete, two attempts. The AWS
defaults — three attempts, no request timeout — can hang a request for minutes
when SES is degraded, and this call is inside a request a traveller is waiting
on.

**Retries.** Only the SDK's own, and only for failures where the request
probably never landed. A configuration fault is not retried: an unverified
domain or a suspended account cannot be fixed by trying again, and retrying only
delays the alarm.

**Duplicates are possible.** SES has no idempotency token, so a retry after a
lost response can deliver twice. Harmless for a login code — same code, still
single-use at the database. Any future email where a duplicate matters needs its
own deduplication keyed on a business identifier.

**Failure is loud.** A send that fails throws, the endpoint returns an error, and
the traveller can retry. Nothing reports a delivery that did not happen.

## Security

**No secret reaches the logs.** The login code is in the subject, the text body
and the HTML body, so the SES adapter logs none of them — only the template id,
a masked recipient, the provider message ID and the duration. The console
transport does log the full body, which is why production refuses it.

**Recipients are masked.** `traveller@example.com` logs as
`t*******r@example.com`: enough for support to match against an address a user
reads out, not enough to harvest. Length is preserved so a typo is still visible.

**Every template variable is HTML-escaped**, including ones that cannot contain
markup today. A variable becomes untrusted the moment a template is reused with
a user-supplied value, and that reuse never arrives with a review of the
template file.

**Provider messages stay server-side.** A terminal SES failure raises a
non-operational error, which the HTTP layer renders opaquely — the client gets a
correlation ID, the detail goes to the logs.

## Known limitation

During an SES outage, `POST /api/v1/auth/otp/request` returns an error for an
address that has an account and 202 for one that does not, which is an
enumeration signal that does not exist when SES is healthy. Accepted: the
alternative is returning 202 to a traveller who will never receive a code. It is
bounded by the outage, and the endpoint is rate limited on both address and IP.

---

## Resend setup

What has to exist before a real email can be delivered.

### 1. Verify a sending domain

Resend dashboard → **Domains** → **Add Domain** (e.g. `lavivenzia.com`), then
publish the DNS records it issues:

| Record                                 | Purpose                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| **DKIM** (`resend._domainkey`, TXT)    | Signs outgoing mail. Without it, delivery to Gmail and Outlook is unreliable      |
| **SPF** (TXT on the sending subdomain) | Authorises Resend to send for the domain                                          |
| **DMARC** (`_dmarc`, TXT)              | Tells receivers what to do when the first two fail. Start at `p=none` and tighten |

`lavivenzia.com` is on Cloudflare, so these are added in the Cloudflare DNS
dashboard. Verification is usually minutes but can take up to 72 hours.

**A sandbox-style restriction applies until the domain is verified:** Resend
will only deliver to the address that owns the account. That is enough to test
the login flow, and not enough for real travellers.

### 2. Create an API key

Dashboard → **API Keys** → **Create**. **Sending access** is sufficient; do not
issue a full-access key for an application that only sends.

### 3. Configure the environment

| Variable          | Value                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `EMAIL_TRANSPORT` | `resend`                                                          |
| `EMAIL_FROM`      | An address on the verified domain, e.g. `no-reply@lavivenzia.com` |
| `RESEND_API_KEY`  | The key from step 2                                               |

Local values go in `.env.local`, which is gitignored. **No key is ever
committed**, and the adapter never logs it — failures record the provider error
name and HTTP status only.

Production refuses to start if `EMAIL_TRANSPORT=console`, or if `resend` is
selected without `RESEND_API_KEY` or `EMAIL_FROM` (`src/lib/env.ts`).

---

## Rollback

SES is untouched and still tested. To revert:

```
EMAIL_TRANSPORT=ses
EMAIL_FROM=<identity verified in SES>
AWS_REGION=<region>
```

No code change, no deployment of different code — the factory picks the adapter
from configuration. `resolveEmailTransport` has a test asserting SES remains
reachable precisely so this path cannot rot.

---

## Behaviour parity

The two providers are deliberately near-twins, so an incident reads the same
whichever is active:

| Concern            | Resend                                     | SES                                           |
| ------------------ | ------------------------------------------ | --------------------------------------------- |
| Request timeout    | 4s via `AbortSignal.timeout`               | 4s request / 3s connect, 2 attempts           |
| Terminal failures  | `validation_error`, `invalid_api_key`, 4xx | `MessageRejected`, `BadRequestException`, 4xx |
| Retryable          | 429, rate limit, 5xx, unknown              | throttling, 5xx, unknown                      |
| Missing message ID | Treated as a failed send                   | Treated as a failed send                      |
| Logging            | Masked recipient, never the code           | Masked recipient, never the code              |

**One shape difference:** Resend reports failures in the response body
(`{ data, error }`) rather than by throwing, so the adapter checks `result.error`
explicitly. A returned error alongside data is the case most likely to be
mis-read as success; a test pins that it is not.
