# La Vivenzia SaaS — Audit Summary

**For the founders · 2026-10-16**
Full detail: [`SAAS_DEVELOPMENT_AUDIT.md`](./SAAS_DEVELOPMENT_AUDIT.md)

---

## Where the project stands

The product is **further along than the phase number suggests, and far less
protected than its quality suggests.**

Everything through official Phase 5 is built: the traveller marketplace, host
onboarding and inventory, the operations console, authentication, transactional
email, search, maps and location. The code quality is high and the architecture
is disciplined. Right now, on the current working tree, **format, lint,
typecheck, 409 unit tests and a production build all pass.**

**But one thing overshadows all of it: roughly seven weeks of work exists only
on one laptop.** The last commit is dated **25 August**. There are **114
uncommitted files** — including the entire approved visual identity, a database
migration, nine test files and two architecture records. None of it has been
pushed, and none of it has ever been checked by CI.

A disk failure this week would erase seven weeks of work. This is the most
urgent item in the project and it is not a technical problem — it is ten
minutes of work that keeps being postponed.

---

## Last confirmed complete phase

**Phase 1 — Design System & UI Foundation**, completed 2026-09-08, when the
approved moodboard was implemented. That closed what the project's own notes
called *"the longest-running blocker in the project."*

Only **Phase 0 (Architecture & Foundation)** is rated *complete and verified* in
the strict sense. Four more phases — 1, 2, 5 and 7 — are implemented but have
outstanding verification.

---

## Current phase

**Declared: Phase 6 — Booking & Payments. Begun: no.**

There is no booking or payment code in the repository at all — no database
table, no route, no module. The payment adapter deliberately refuses to run,
with one exception: webhook signature verification is built and tested, because
it is a security boundary that is expensive to get wrong later.

That restraint is correct. **No financial arithmetic exists anywhere** — no fee,
commission, tax or payout is stored or calculated. The team has avoided guessing
at numbers that would be expensive to change, which is the right call.

---

## What remains

| Category | Work |
| --- | --- |
| **Features** | Booking & payments (Phase 6), AI discovery (8), itinerary engine (9), availability/slots, traveller profiles & wishlist, Google sign-in, password reset |
| **Verification** | 190 database tests not currently runnable; no responsive/mobile testing exists at all; no real email has ever been sent |
| **Infrastructure** | Nothing has ever run outside a developer laptop. No hosting, no deployment setup, no monitoring |
| **Production readiness** | Security hardening on the money path, error monitoring, deployment pipeline |

Of 13 phases: **1 verified, 4 implemented pending verification, 4 partially
built, 4 not started.** A simple "percent complete" would mislead — Phase 6
alone contains the entire revenue path.

---

## The biggest blockers

**1. Seven weeks of uncommitted work.** *Critical. Engineering action, no
decision needed.* One disk failure from losing it.

**2. GST/TCS structure (A-005).** *Critical. Needs a chartered accountant.*
This is **the longest-lead item in the project and has still not been started.**
It determines how money-holding database columns are structured — guessing means
migrating financial data later rather than changing a setting. Every week of
delay is added to the **end** of Phase 6, not the beginning.

**3. No AWS account for email.** The code is finished and tested, but **no real
email has ever been sent.** Login codes cannot reach a real customer. Getting
out of the AWS sending sandbox is a support request with waiting time attached,
so it should be started before it is needed.

**4. Platform fee (A-003) and cancellation/refund policy (A-004).** Booking can
start without these but cannot finish.

**5. Nothing has ever been deployed.** No hosting, no infrastructure, no error
monitoring. AWS work remains frozen pending your cost approval.

---

## Next recommended actions

**This week, in parallel:**

1. **Commit and push the work.** Engineering only, no decision required. Removes
   the single largest risk in the project.
2. **Engage a chartered accountant on GST/TCS.** The longest lead time you have.
   It is already the critical path.
3. **Start the AWS sending-sandbox request.** It involves waiting, so start the
   clock.

**Then:**

4. Run the database test suite to re-establish a known-good baseline.
5. Build availability and slots — the one piece of Phase 6 that depends on none
   of the pending decisions, so it can proceed while you decide.
6. Close the TOTP security gap before any payment endpoint ships.

---

## Decisions that need you

| # | Decision | Why it matters now |
| --- | --- | --- |
| 1 | **GST/TCS structure** | Longest lead time; blocks finishing Phase 6 |
| 2 | **Platform fee** | Booking cannot calculate amounts without it |
| 3 | **Cancellation & refund policy** | Determines refund records and payment states |
| 4 | **AWS cost approval** | Nothing reaches production until this lifts |
| 5 | **Embeddings provider** | Fixes a database column size; blocks AI discovery |
| 6 | **Editing a live listing** | Now affects what travellers actually see |
| 7 | **Operator MFA recovery** | Today the only fix is editing the database by hand |
| 8 | **Google Maps account** | Needed for a map embedded in the page |
| 9 | **Error monitoring spend** | Without it, production failures are invisible |

---

## One thing worth your attention

The project's own records show that **four milestones in a row produced bugs
that were only found by opening the running product** — never by the automated
tests. An invisible button, a page returning the wrong status code to Google, a
missing logout, and a crash on the experiences page.

Every individual piece was correct; the way they fitted together was not.

The team responded correctly by adding tests that check how pieces connect
rather than how they look. But the lesson stands, and it shapes how this audit
reads the evidence: **a passing test suite is not proof that a phase is
finished.** There is currently no mobile or responsive testing of any kind, and
nothing has run outside a developer's laptop — so for every phase marked
"implemented", real verification work remains.
