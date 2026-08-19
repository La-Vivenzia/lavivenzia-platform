# Adapters

Concrete implementations of the ports in `src/ports`. Provider-specific code
lives **only** here (SYSTEM_DESIGN.md §10) — no provider SDK or vendor concept
may appear in `src/modules`.

Every adapter is responsible for:

- asserting its own credentials at construction, so a missing secret fails at
  wiring time rather than mid-transaction;
- translating provider failures into the shared error model (`src/lib/errors`),
  in particular distinguishing retryable from terminal failures;
- enforcing an explicit timeout — no unbounded outbound call.

Adapters that are boundaries only at this stage throw `NotImplementedError`
rather than returning empty data, so an accidental call is loud and traceable.
