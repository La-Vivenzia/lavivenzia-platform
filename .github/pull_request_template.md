<!--
PR title must follow Conventional Commits, e.g. `feat(booking): hold slot during checkout`.
Branch must be feature/<ticket-or-name>, fix/<ticket-or-name> or chore/<name>.
Complete every section. Mark items that do not apply as N/A — do not delete them.
See CONTRIBUTING.md for the full policy.
-->

## Summary

<!-- What does this PR change, and why? One or two short paragraphs. -->

**Ticket:** <!-- LV-123, or "none" -->

## Type of change

- [ ] `feat` — new capability
- [ ] `fix` — bug fix
- [ ] `refactor` — no behaviour change
- [ ] `test` — tests only
- [ ] `chore` — tooling, dependencies, CI, docs
- [ ] Breaking change (API, schema, environment or behaviour)

## Changes

<!-- Files or modules touched and what was done in each. -->

-

## How to test

<!-- Steps a reviewer can follow to verify the change, including any setup or seed data. -->

1.

## Screenshots

<!-- Required for any user-facing change: before/after, light and dark, mobile and desktop. Otherwise N/A. -->

## Pre-merge checklist

### Verification

- [ ] `npm run verify` passes locally (format:check, lint, typecheck, test, build)
- [ ] `npm run verify:full` passes — required if the schema, migrations, seeds or database behaviour changed
- [ ] New or changed behaviour is covered by tests, including failure paths
- [ ] No lint rules disabled, tests skipped or `@ts-ignore` added to make checks pass

### Security and data

- [ ] No secrets, `.env` files, API keys, credentials or customer data are included
- [ ] New environment variables are added to `.env.example` (empty value) and the env schema
- [ ] Inputs are validated and authorization is enforced server-side
- [ ] Payment state is verified server-side; webhooks are idempotent — or N/A
- [ ] Database changes use a reviewed, migration-safe Prisma migration — or N/A
- [ ] AI output does not invent availability, price, booking, payment status, policy or inventory — or N/A

### UI — user-facing changes only

- [ ] Uses existing components and design tokens; no literal colour, radius or font values
- [ ] Checked in light and dark mode, both palettes, at 390 / 768 / 1024 / 1440
- [ ] Loading, empty, error, disabled and focus states handled
- [ ] Meets the visual acceptance criteria in `DESIGN.md` §B.12

### Documentation

- [ ] `PROJECT_STATE.md` and relevant docs updated
- [ ] ADR added in `docs/adr/` if an architectural decision changed — or N/A

## Risks and rollback

<!-- Known issues, assumptions, follow-up work, and how to revert safely if this misbehaves in production. -->

---

- [ ] I have requested review from the Technical Lead (Karan Patil). This PR will not be merged without his approval.
