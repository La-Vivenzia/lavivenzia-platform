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

Before creating UI:

- search for existing components
- use existing tokens
- extend components instead of duplicating them
- preserve responsive behavior

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
