# Database

PostgreSQL is the system of record (`PROJECT.md` §5, `SYSTEM_DESIGN.md` §5).
Access is through Prisma; the schema lives in `prisma/schema.prisma` and every
change ships as a migration.

## Local development

No published image carries both PostGIS and pgvector, so `docker/postgres/Dockerfile`
builds one from the official PostGIS image (ADR-0004, ADR-0008).

```bash
npm run db:up          # build and start PostgreSQL 16 (waits for healthy)
npm run db:migrate     # apply migrations
npm run db:seed        # seed roles and permissions (idempotent)
npm run db:verify      # assert extensions, tables and PostGIS functionality
```

`npm run db:down` stops it; `docker compose down -v` destroys the data volume.
`npm run db:reset` drops, re-migrates and re-seeds from scratch.

Point `.env` at it:

```
DATABASE_URL=postgresql://lavivenzia:lavivenzia_local_dev@localhost:5432/lavivenzia
DIRECT_DATABASE_URL=postgresql://lavivenzia:lavivenzia_local_dev@localhost:5432/lavivenzia
```

The local container uses `--lc-collate=C` for deterministic index ordering.
**RDS must be provisioned with the same collation** — otherwise sorted queries
can return different results in each environment, and collation cannot be
changed in place after data exists.

## Connections

| Variable              | Used by                   | Notes                                                                                                    |
| --------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | App and worker at runtime | Pooled. Bounded pools: 10 for Prisma, 4 for the queue.                                                   |
| `DIRECT_DATABASE_URL` | Prisma Migrate only       | Direct and unpooled. Required in production; DDL and advisory locks do not survive a transaction pooler. |

Prisma 7 no longer accepts connection URLs in the schema. Runtime connections go
through the `pg` driver adapter in `src/lib/db.ts`; CLI connections come from
`prisma.config.ts`.

## Extensions

Created by the initial migration so every environment is provisioned identically
(ADR-0004):

| Extension  | Why                                                           |
| ---------- | ------------------------------------------------------------- |
| `pgcrypto` | UUID generation                                               |
| `citext`   | Case-insensitive email uniqueness (`users.email`)             |
| `pg_trgm`  | Fuzzy destination autocomplete and admin search (FR-03)       |
| `postgis`  | Nearby and map-viewport discovery (FR-03) — ADR-0008          |
| `vector`   | Semantic retrieval (FR-02, FR-16) — extension only, see below |

**On AWS RDS** these require a role with `rds_superuser`. Grant it to the
migration runner, not to the application role. The application role needs only
DML on the application schema.

**pgvector has no column yet.** The embedding provider is unresolved and it fixes
the vector dimension (ADR-0007). Do not add a vector column until that decision
is made — changing a dimension after data exists means a rebuild.

## Current schema

Identity, authorization and audit only. Marketplace entities arrive with the
phases that own them, several of them blocked on the decisions in
`PROJECT_STATE.md`.

| Table              | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `users`            | One row per person, regardless of how many roles they hold     |
| `sessions`         | Server-side sessions; stores a token **hash**, never the token |
| `roles`            | Role definitions; six actors per `REQUIREMENTS.md` §2          |
| `permissions`      | Individual capability keys                                     |
| `role_permissions` | Role-to-permission join                                        |
| `user_roles`       | User-to-role grants, with grantor and timestamp                |
| `audit_logs`       | Append-only record of privileged actions (FR-15)               |

Conventions:

- `snake_case` table and column names, mapped from `camelCase` in Prisma.
- All timestamps are `timestamptz`. No naive local times anywhere.
- UUID primary keys, except `audit_logs`, which uses a bigint sequence because it
  is append-only and high-volume.
- Soft delete on `users` only, for financial and audit traceability. Everything
  else deletes for real.
- JSON is used **only** in `audit_logs` before/after snapshots. Core business
  data is modelled relationally, per `DEVELOPMENT_WORKFLOW.md`.

## Workflow

Per `DEVELOPMENT_WORKFLOW.md`:

1. Define the business requirement.
2. Update `prisma/schema.prisma`.
3. `npm run db:migrate` to create and apply the migration locally.
4. Review the generated SQL — read it, do not assume it.
5. Check relationships, constraints, transactions and indexes.
6. Update seed data and tests.
7. Update this document.

`npm run db:migrate:deploy` applies migrations in staging and production. It is
never run against a database a human is also migrating by hand.

CI applies every migration to an empty database and then asserts that
`prisma/schema.prisma` and `prisma/migrations` agree. That check is what keeps
the schema reproducible from the repository rather than from someone's laptop.

## Queue schema

pg-boss owns a separate `pgboss` schema, managed by pg-boss rather than Prisma,
so queue and application migrations never collide. Jobs are enqueued inside the
caller's transaction via `transactionalDb()` in `src/jobs/queue.ts` — see
ADR-0001 for why that property is the reason the queue is in PostgreSQL at all.
