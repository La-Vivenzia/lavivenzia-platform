# La Vivenzia — Antigravity Project Documentation

## Mandatory Project Documents

Authority runs highest-first down this table. When two documents disagree, the higher one wins; see ADR-0003.

| File                       | Purpose                                                                 | Status                    |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------- |
| `PROJECT.md`               | Product constitution, scope, architecture rules and project direction   | Authoritative             |
| `REQUIREMENTS.md`          | Functional/non-functional requirements and acceptance foundation        | Authoritative             |
| `SYSTEM_DESIGN.md`         | Architecture, modules, data flow, integrations and security             | Authoritative             |
| `docs/adr/`                | Architecture decision records — the reasoning behind each choice        | Authoritative on specifics |
| `WIREFRAME.md`             | Product information architecture and screen/user-flow wireframes        | Authoritative             |
| `DESIGN.md`                | UI design system and consistency rules                                  | Authoritative             |
| `DEVELOPMENT_WORKFLOW.md`  | Delivery process, definition of done, approval gates                    | Authoritative             |
| `CLAUDE.md`                | AI coding-agent operating rules                                         | Authoritative             |
| `docs/DATABASE.md`         | Schema, extensions, connection and migration workflow                   | Authoritative             |
| `PROJECT_STATE.md`         | What is built, what is pending, what is blocked                         | Living record             |
| `System Design.png`        | Architecture diagram — describes the **Phase 2+ target**, not the launch runtime | **Non-authoritative reference** |
| `wireframe sample image.png` | Visual wireframe board                                                | **Non-authoritative reference** |

The two images are references, not specifications. They carry infrastructure and
IA details that the markdown does not, and where they conflict with it, the
markdown wins. Treating them as authoritative is what produced the Redis and
backend-topology contradictions resolved in ADR-0001 and ADR-0002.

## How Antigravity Should Use Them

Before any implementation, load:

```text
CLAUDE.md
PROJECT.md
REQUIREMENTS.md
DESIGN.md
SYSTEM_DESIGN.md
WIREFRAME.md
```

Then inspect the actual repository.

These documents are complementary:

```text
PROJECT
  ↓
What are we building?

REQUIREMENTS
  ↓
What must it do?

WIREFRAME
  ↓
How does the user move through it?

DESIGN
  ↓
How should it look and behave visually?

SYSTEM DESIGN
  ↓
How should the software work internally?

CLAUDE
  ↓
How should the coding agent work on it?
```

## Important

The documents describe the intended system. They do not replace repository inspection or real implementation validation.

When source code conflicts with documentation:

1. Do not silently choose one.
2. Identify the conflict.
3. Determine whether the code or documentation represents the latest approved decision.
4. Update the appropriate source of truth before making a large architectural change.
