# ADR-0004: PostgreSQL extensions enabled at foundation

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

Extensions are cheap to enable on an empty database and expensive to retrofit
onto populated core tables. The relevant question is which are justified by a
current requirement rather than a hypothetical one.

## Decision

Enable in the initial migration: `pgcrypto`, `citext`, `pg_trgm`, `postgis`
(ADR-0008) and `vector`.

- `pgcrypto` — UUID generation.
- `citext` — case-insensitive email uniqueness, applied to `users.email`.
- `pg_trgm` — fuzzy destination autocomplete and admin search (FR-03).
- `postgis` — nearby and map-viewport discovery (FR-03). See ADR-0008.
- `vector` — semantic retrieval (FR-02, FR-16). **Extension only.** No vector
  column exists, because the embedding provider is unresolved and it fixes the
  dimension. See ADR-0007.

Explicitly not adopted: any dedicated vector database, Elasticsearch, or
OpenSearch — all excluded by `PROJECT.md` §9.

## Consequences

- On AWS RDS these require a role with `rds_superuser`; the migration runner
  needs that grant. Documented in `docs/DATABASE.md`.
- CI applies migrations to a clean `postgis/postgis:16-3.4` database with
  pgvector installed, so schema reproducibility is verified on every change.

## Revisit when

A requirement appears that PostgreSQL full-text search plus `pg_trgm` cannot
serve.
