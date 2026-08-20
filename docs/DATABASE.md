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
npm run db:verify      # assert extensions, tables, FKs, indexes, constraints
```

`npm run db:down` stops it; `docker compose down -v` destroys the data volume.

### Resetting

`npm run db:reset` drops every table, re-applies migrations and re-seeds. It runs
behind `scripts/db-reset.ts`, which refuses unless **all three** hold:

1. `NODE_ENV` is not `production`
2. the host is loopback
3. the database name ends in `_dev`, `_local`, `_test`, `_shadow`, or is exactly
   `lavivenzia`

Override with `ALLOW_REMOTE_DB_RESET=i-understand-this-destroys-data` — deliberately
awkward to type by accident.

Two things worth knowing:

- **Prisma 7 does not run the seed as part of `migrate reset`**, even with
  `migrations.seed` set in `prisma.config.ts`. The wrapper invokes the seed
  explicitly; without that, a reset leaves an empty RBAC vocabulary and every
  authorization check silently denies.
- Prisma blocks `migrate reset` when it detects an AI agent, and requires
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` carrying the user's exact words
  of consent. Humans running it interactively are unaffected.

### Testing

```bash
npm run db:test:setup      # create + migrate + seed lavivenzia_test
npm run test:integration   # database integration tests
npm run test               # unit tests — needs no database at all
npm run verify:full        # everything: unit gate + db:verify + integration
```

Integration tests use a **separate** database (`TEST_DATABASE_URL`) because they
truncate tables. `tests/integration/setup.ts` refuses to run unless the database
name contains `test`, so a misconfigured URL cannot wipe local development data.

The unit suite deliberately excludes them and runs with no environment variables
set at all — that is the standing proof the domain layer is decoupled from
infrastructure.

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

## Known traps

**`citext` + Prisma pattern matching.** `users.email` is `citext`, so equality is
case-insensitive and `findUnique({ where: { email } })` matches any casing. But
Prisma casts the operand to `text` for `contains` / `startsWith` / `endsWith`,
which defeats citext and makes those **case-sensitive**. Pass
`mode: "insensitive"` explicitly when pattern-matching an email. This was found
by an integration test where an uppercase fixture survived cleanup.

**`array_agg` over `name` columns.** Querying `pg_index`/`pg_attribute` returns
`name[]`, which node-pg does not parse into a JS array — it arrives as the raw
string `{col_a,col_b}`. Cast with `a.attname::text` when aggregating catalogue
columns.

## Queue schema

pg-boss owns a separate `pgboss` schema, managed by pg-boss rather than Prisma,
so queue and application migrations never collide. Jobs are enqueued inside the
caller's transaction via `transactionalDb()` in `src/jobs/queue.ts` — see
ADR-0001 for why that property is the reason the queue is in PostgreSQL at all.
