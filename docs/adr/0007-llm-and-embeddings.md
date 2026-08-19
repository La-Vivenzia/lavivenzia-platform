# ADR-0007: LLM provider selected; embeddings provider BLOCKED

- **Status:** Partially accepted — embeddings decision is **open and blocking**
- **Date:** 2026-08-19

## Context

FR-16 makes natural-language discovery a launch requirement; FR-17 and FR-18 add
shortlists and itinerary generation. No provider was named anywhere in the
specification documents.

## Decision (LLM)

**Anthropic Claude**, behind the `LlmPort` interface in `src/ports/llm.ts`.

Chosen for strict structured outputs and tool use — essential for forcing the
model to return validated experience IDs rather than prose, which is the core
grounding control — plus prompt caching for cost control on a stable system
prefix, a large context window, and adaptive thinking for itinerary planning.

**No orchestration framework.** A single port with one adapter satisfies
`SYSTEM_DESIGN.md` §10; a framework would add a dependency layer with its own
churn for no benefit at this scope, contrary to `CLAUDE.md` §4.

Model tiering by surface is a **cost decision reserved for the founder**, not an
engineering default. The baseline is the most capable model on every surface;
tiering intent extraction down is the safest first economy because its output is
schema-validated and cheap to verify.

## Decision (embeddings) — NOT MADE

**No embeddings provider is selected.** Anthropic offers no embeddings endpoint,
but `PROJECT.md` mandates pgvector, so a second vendor is required and no
document addresses it.

This is a **sequencing constraint, not a preference**: the chosen model fixes the
vector dimension, which is baked into the pgvector column definition. It must be
decided before any vector column is added to the schema.

Accordingly:

- The `vector` extension is enabled (ADR-0004) but **no vector column exists**.
- `src/ports/embeddings.ts` defines the interface.
- `src/adapters/embeddings/index.ts` is an `UnconfiguredEmbeddingsAdapter` that
  throws `NotImplementedError`. It deliberately does not default to a provider:
  defaulting would silently commit a dimension to the database.
- `EMBEDDINGS_PROVIDER` and `EMBEDDINGS_API_KEY` exist in `.env.example` as
  empty placeholders.

## Grounding rules — binding regardless of provider

Per `CLAUDE.md` §7, the model is never the source of truth for price,
availability, booking status, refund status, host information, policy or
inventory.

- Retrieval runs first and deterministically; the model receives only candidate
  IDs plus verified attributes.
- The model returns IDs and rationale text only. Prices and availability are
  re-read from PostgreSQL at render time.
- Responses are schema-validated; an ID outside the candidate set is rejected,
  never repaired.
- AI never writes to booking, payment, refund or inventory tables.
- Every AI surface degrades to a working deterministic path. Structured search
  must function with the LLM entirely unavailable.

## Consequences

- Two AI vendors, both isolated behind ports.
- Cost controls required before launch: prompt caching, per-surface token
  ceilings, per-user rate limits, a daily spend cap with a kill switch that
  degrades to deterministic search, and batch processing for offline embedding.

## Revisit when

The founder selects an embeddings provider. That unblocks vector schema work.
