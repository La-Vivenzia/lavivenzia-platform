# La Vivenzia — Development Workflow

## Purpose

La Vivenzia will be built incrementally as a production-ready product, not as a prototype or a collection of generated screens. Claude Code may implement the code, but scope, architecture, product decisions, and final approval remain human-controlled.

## Standard Claude Code Cycle

For every task:

1. Read `CLAUDE.md`, `PROJECT.md`/`PROJECT_STATE.md`, and relevant requirements/design/architecture docs.
2. Inspect the existing repository before changing anything.
3. Identify reusable components, services, schemas, utilities, and existing patterns.
4. Define the implementation plan and acceptance criteria.
5. Implement only the requested scope.
6. Do not rewrite unrelated code or invent requirements.
7. Run formatting, linting, type checking, tests, and build validation as applicable.
8. Review security, error handling, performance, accessibility, responsiveness, and UI consistency.
9. Update `PROJECT_STATE.md` and relevant documentation.
10. Review the Git diff and create a focused commit.

## Scope Control

Never ask Claude Code to build the entire product or an entire major phase in one instruction. Large features must be divided into small, independently verifiable tasks.

Do not introduce premature microservices, Kubernetes, dedicated search infrastructure, separate vector databases, or other infrastructure without a current requirement.

Do not implement advanced AI before deterministic inventory, search, availability, and business rules are reliable.

## Development Phases

0. Engineering Foundation
1. Design System + UI Foundation
2. Public Website + Discovery
3. Authentication + Identity
4. Host + Inventory
5. Search + Maps
6. Booking + Payments
7. Admin + Operations
8. AI Discovery
9. Itinerary Engine
10. Notifications + CRM
11. Security + Analytics + Hardening
12. Integration + QA + Production

Each phase is further divided into small implementation sprints.

## Definition of Done

A task is complete only when applicable:

- Functionality works on happy and failure paths.
- Existing related functionality still works.
- TypeScript/type checking passes.
- Linting and formatting pass.
- Appropriate tests pass.
- Production build passes.
- UI follows the existing La Vivenzia design system.
- Responsive, loading, empty, error, and success states are handled.
- **UI work additionally meets the visual acceptance criteria in `DESIGN.md`
  §B.12** — the page was opened and looked at, in both modes and both palettes,
  at real breakpoints (390 / 768 / 1024 / 1440), with every state exercised and
  no literal colour, radius or font value left in a component. This is manual:
  the repository has no visual regression infrastructure.
- Inputs are validated and authorization is enforced.
- No secrets or sensitive data are committed or exposed.
- Critical operations are observable and auditable.
- Documentation and `PROJECT_STATE.md` are updated.
- Git diff is reviewed and the work is committed.

## Git

Use focused commits such as:

- `feat: add host registration`
- `feat: add experience creation`
- `fix: prevent duplicate booking`
- `test: add payment webhook coverage`
- `docs: update API documentation`

Do not mix unrelated changes in one commit.

## Security

Never commit API keys, payment secrets, database passwords, OAuth secrets, JWT secrets, production credentials, private certificates, or customer data.

Use local environment variables for development and company-managed secret storage for deployed environments. Never paste production secrets into AI prompts.

## Database

Database changes must be deliberate:

1. Define the business requirement.
2. Update the Prisma schema.
3. Create and review migrations.
4. Review relationships, constraints, transactions, and indexes.
5. Update tests/seed data where needed.
6. Update `DATABASE.md`.

Do not use unstructured JSON as a substitute for proper relational modeling of core business data.

## API

APIs must be validated, authenticated/authorized where required, consistent, observable, and safe to retry where applicable. External webhooks must verify signatures and handle duplicate delivery safely. Payment operations must support idempotency and reconciliation.

## AI

AI is an intelligence layer over verified platform data. It must not invent prices, availability, bookings, hosts, policies, or refund status. Deterministic systems own factual platform state; LLMs handle natural-language understanding, reasoning, explanation, and controlled generation.

## Performance

Optimize based on evidence. Prefer efficient queries and indexes, pagination, appropriate caching, server-side rendering where useful, image optimization, CDN delivery, lazy loading, and asynchronous processing for expensive background work. Avoid infrastructure added only for hypothetical scale.

## Production Safety

For production-sensitive features consider failures, retries, timeouts, idempotency, partial failures, logging, monitoring, rollback, data consistency, security, and user-facing error states. Happy-path-only behavior is not production-ready.

## Context Continuity

Claude Code must use the project documentation as persistent context:

- `CLAUDE.md`
- `PROJECT.md`
- `PROJECT_STATE.md`
- `REQUIREMENTS.md`
- `SYSTEM_DESIGN.md`
- `DESIGN.md`
- `WIREFRAME.md`
- relevant architecture, database, API, and security documents

At the beginning of a task, inspect the current state rather than assuming previous work is complete. At the end, update project state.

## Human Approval Gates

Human approval is required before major architecture changes, database redesigns, payment/authentication architecture changes, security-sensitive changes, major dependency changes, cloud infrastructure changes, cross-domain refactors, design-system changes, or moving to the next major phase.

## Phase Completion Gate

A phase can advance only when required functionality, tests, type checking, linting, production build, regression checks, security review, responsive/UI review, documentation, project state, and Git state are all satisfactory. Known blockers and technical debt must be documented.

## Guiding Principle

Build La Vivenzia as a real product. Every feature must belong to a coherent architecture, every user workflow must connect to real data, every important business operation must be reliable, and every phase must leave the system in a working state.
