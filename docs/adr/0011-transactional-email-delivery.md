# ADR-0011 — Transactional email: Amazon SES, sent inline

**Status:** Accepted
**Date:** 2026-08-22
**Supersedes:** the "all sending is asynchronous, via the worker" note in the
original `src/ports/email.ts` docstring.

## Context

Authentication is complete but cannot serve a traveller in any deployed
environment: travellers sign in with an emailed code (ADR-0005) and there is no
email transport. Password reset, email change and email verification are blocked
behind the same gap.

Two questions had to be answered together.

**Which provider.** The platform is deploying on AWS (ADR-0002, `AWS_REGION` is
already configuration). SES is in the same account and region, bills per
message with no monthly floor, and authenticates through the task's IAM role
rather than an API key that has to live in a secret store and be rotated.

**Whether a login code goes through the queue.** `SYSTEM_DESIGN.md` §14 lists
email among the things background jobs are for, and ADR-0001 chose a
PostgreSQL-backed queue precisely so a job can be enqueued in the same
transaction as the business write that causes it.

## Decision

Amazon SES via `@aws-sdk/client-sesv2`, behind the existing `EmailPort`.

**Login codes are sent inline, in the request that issues them.** Non-interactive
mail that follows a business write — booking vouchers, invoices, payout notices —
will go through pg-boss when the phases that own it arrive.

Two transports exist and are selected by `EMAIL_TRANSPORT`:

- `console` renders the message through the same template code and writes it to
  the structured log. Development and CI.
- `ses` delivers. Required in production, asserted at startup.

## Rationale

ADR-0001's argument is about **consistency between a database write and its
consequence**. A login code has no such write to stay consistent with: nothing
is committed that the email must agree with, and the challenge row it accompanies
is superseded by the next request anyway. The property that made the queue
compelling for a voucher simply does not apply here.

What does apply is that a person is sitting in front of a form waiting for this
exact message. Queueing it would mean:

- **login depends on a second process.** A worker that is down, deploying, or
  backed up behind slow jobs becomes an authentication outage for every
  traveller — with no error to see, because the request returned 202.
- **added latency for no gain.** pg-boss polls; the code arrives a poll interval
  later than it needs to.
- **a harder local and CI story.** The end-to-end HTTP verification of the auth
  slice runs against one process. Requiring two to test login makes the cheapest
  useful test more expensive.

Inline sending has one real cost, accepted deliberately: SES latency is inside
the request, and an SES outage turns `otp/request` into an error response for
addresses that have an account. The alternative — swallowing the failure and
returning 202 — is worse: it tells the traveller a code is coming when none is.
The network budget in the adapter (two attempts, four-second request timeout)
exists to bound that cost.

## Consequences

**The console transport is refused in production**, at two independent points:
`assertDeploymentInvariants()` at startup, and `resolveEmailTransport()` at
wiring. It reports success while sending nothing and writes login codes into a
retained log; either alone is disqualifying.

**A missing sender fails at wiring, not at first use.** `EMAIL_FROM` must be an
identity SES has verified. Without it the process refuses to build the adapter,
so the failure lands on a deploy rather than on a traveller.

**Provider failures are classified, not just propagated.** Throttling, timeouts
and 5xx are retryable; an unverified domain, a suspended account or a rejected
message are terminal, because retrying a configuration fault only delays the
alarm. Anything unrecognised is treated as retryable — dropping a login code
costs more than one extra attempt.

**Delivery is at-least-once, not exactly-once.** SES has no idempotency token,
and the SDK retries a request whose response was lost. For a login code a
duplicate is harmless: it carries the same code, which is single-use at the
database. Any future email where a duplicate is not harmless needs its own
deduplication, keyed on a business identifier.

**Bodies never reach the logs.** The code is in the subject, the text body and
the HTML body, so the SES adapter logs the template id, a masked recipient and
the provider message ID — never the rendered message.

## Alternatives considered

**Queue every email, including login codes.** Rejected above: it buys
transactional consistency that a login code has no use for, and pays in an
availability coupling on the flow least able to afford one.

**SMTP through SES, or a third-party provider (Postmark, Resend, SendGrid).**
SMTP needs long-lived credentials in a secret store where the SDK needs none.
A third-party provider is a second vendor, a second bill and a second set of
credentials for a capability already present in the account being deployed to.
The port makes this reversible: a different provider is one adapter and one line
in the factory.

**A `NotImplementedError` stub until AWS access arrives.** Rejected. The AWS
account is being arranged separately, and blocking the code on it would leave
the integration untested when credentials appear. Everything except a real
`SendEmail` call is testable now, and is tested.
