# ADR-0003: Architecture source-of-truth hierarchy

- **Status:** Accepted
- **Date:** 2026-08-19
- **Decides:** D3 from the Phase 0.1 architecture report

## Context

D1 and D2 arose because two PNG diagrams carrying binding infrastructure
decisions were never registered in the `README.md` document table. Demoting the
diagrams treats the symptom; the cause is an incomplete registry with no status
information.

## Decision

Authority, highest first:

1. `PROJECT.md` — product constitution: scope, principles, exclusions.
2. `REQUIREMENTS.md` — what the product must do. FR IDs are the traceability anchor.
3. `SYSTEM_DESIGN.md` plus these ADRs — authoritative architecture. An ADR records
   _why_ and supersedes on specifics; `SYSTEM_DESIGN.md` is updated to match.
4. `WIREFRAME.md` (IA and flows) and `DESIGN.md` (visual and interaction language).
5. `DEVELOPMENT_WORKFLOW.md` and `CLAUDE.md` — process and agent rules.
6. `System Design.png` and `wireframe sample image.png` — **non-authoritative
   references**. The architecture diagram describes the Phase 2+ target state.

Every document, including the diagrams, is listed in `README.md` with an explicit
status. When code and documentation disagree, the documentation is updated first
and the code follows — never a silent divergence.

## Consequences

- Architectural changes now require an ADR plus a `SYSTEM_DESIGN.md` update.
- The diagrams are kept, not deleted: they capture a genuinely useful target
  state. They simply no longer read as Phase 1 runtime.

## Revisit when

The diagrams are regenerated to match the accepted architecture, at which point
promoting them to authoritative could be reconsidered.
