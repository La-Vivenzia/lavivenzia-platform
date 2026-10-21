# La Vivenzia — AI Engineering Constitution

## READ THIS FIRST

You are working on La Vivenzia, a production experiential tourism marketplace targeting a 2-month product launch.

Before writing code, read:

1. `PROJECT.md`
2. `REQUIREMENTS.md`
3. `DESIGN.md`
4. `SYSTEM_DESIGN.md`
5. `WIREFRAME.md`

These documents are the project source of truth.

## Non-Negotiable Rules

### 1. Inspect Before Editing

Never modify files blindly.

Before implementation:

- inspect repository structure
- locate existing components
- locate existing services
- inspect relevant database schema
- inspect routes/API contracts
- identify reusable code

### 2. Do Not Rewrite Unrelated Code

Only modify what the current task requires.

### 3. Reuse the Design System

**`DESIGN.md` is the canonical design document.** §A is the approved, implemented
system and the source of truth for every colour, radius and typeface; §B governs
brand expression, experience principles and visual acceptance. `globals.css` is
where the values actually live — §A is for reading, not for copying into
components.

Before creating UI:

- search for existing components
- use existing tokens — never a literal hex, px radius or font-family in a component
- extend components instead of duplicating them
- preserve responsive behavior

Three rules that are not negotiable:

- **Do not restyle on taste.** §A's values were ported from founder-approved
  references (ADR-0015), not chosen aesthetically. "Correcting" the green
  neutral axis toward grey breaks the identity.
- **Do not introduce a second design system** for any product area. Traveller,
  host and admin differ in density, not in language (§B.5).
- **Look at it before calling it done.** A UI change that has only been
  typechecked is not finished. §B.12 lists what to check — both modes, both
  palettes, real breakpoints, all five states. There is no visual regression
  infrastructure in this repository, so this step is manual and cannot be
  skipped.

**The identity is settled.** On 2026-10-20 the founders confirmed La Vivenzia as
a **forest-green-and-ivory brand** — green stays primary and the neutral axis,
ivory `#F3EFE7` and dark neutral `#16261E` stay, gold and the logo stay, and the
tagline stays "Experience Every Journey Through Its Soul". A competing ink-led
direction was rejected. §A needs no change; `DESIGN.md` §B.0 records what was
declined and `docs/VISUAL_IDENTITY_DECISION.md` records why.

One open correction: `--lv-accent-ink` and `--lv-fg-subtle` fail WCAG AA in both
light palettes. A fix is proposed in `VISUAL_IDENTITY_DECISION.md` §7.1 and is
**not yet applied** — do not change those values ad hoc.

### 4. Respect Architecture

Use the modules and boundaries defined in `SYSTEM_DESIGN.md`.

Do not introduce:

- random libraries
- duplicate state-management systems
- duplicate API clients
- duplicate UI systems
- microservices without an explicit requirement

### 5. Database

PostgreSQL is the source of truth.

Database changes must be deliberate and migration-safe.

### 6. Payments

Never trust client-side payment success.

Verify payment state server-side and process webhooks idempotently.

### 7. AI

AI must not invent:

- availability
- price
- booking status
- payment status
- policy
- inventory

AI can interpret, retrieve, rank, summarize and recommend, but deterministic business rules remain authoritative.

### 8. Secrets

Never:

- print secrets
- commit secrets
- hardcode API keys
- place credentials in documentation
- expose server secrets to the browser

Use environment variables and company-controlled secret management.

### 9. Error Handling

Every external integration must handle:

- timeout
- invalid response
- provider error
- retry where safe
- graceful fallback

### 10. Testing

For every meaningful feature:

- typecheck
- lint
- relevant unit/integration tests
- build
- manual UI check for user-facing work

### 11. UI Quality Gate

Before considering UI complete:

- desktop
- tablet
- mobile
- loading
- empty
- error
- disabled
- focus states
- consistent spacing
- consistent typography
- no duplicated visual patterns

### 12. Documentation

If an architectural decision changes:

- update `SYSTEM_DESIGN.md`
- update `PROJECT.md`
- update requirements if behavior changed
- record the decision in an ADR if the repository uses ADRs

## Task Workflow

```text
Read project docs
    ↓
Inspect repository
    ↓
Identify affected modules
    ↓
Create implementation plan
    ↓
Implement
    ↓
Run checks
    ↓
Review UI / API / security
    ↓
Update docs
    ↓
Summarize changes
```

## Response Format After Implementation

Report:

### Changed

Files/modules changed.

### Implemented

What was built.

### Validation

Tests, typecheck, lint, build.

### Risks

Known issues or assumptions.

### Next

Only the next relevant implementation step.

Do not claim a feature works if it was not actually tested.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
