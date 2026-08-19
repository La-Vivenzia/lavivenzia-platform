# ADR-0001: PostgreSQL-backed job queue instead of Redis/BullMQ

- **Status:** Accepted
- **Date:** 2026-08-19
- **Decides:** D1 from the Phase 0.1 architecture report

## Context

`SYSTEM_DESIGN.md` §14 warned against introducing Redis/BullMQ "merely because
they appear in architecture discussions". `System Design.png` placed ElastiCache
Redis and BullMQ queues in the Phase 1 runtime. The two documents contradicted
each other, and FR-12 makes transactional email a launch requirement, so some
asynchronous mechanism is needed either way.

The decisive consideration is transactional consistency rather than throughput.
Nearly every launch job is triggered by a database state change: booking
confirmed → send voucher, payment captured → generate invoice. With the queue in
Redis there is a dual-write problem in both directions — enqueue before commit
and a rolled-back transaction still sends the email; commit before enqueue and a
Redis failure loses the voucher. Neither is acceptable in a system that takes
payments.

Throughput was never close to the constraint. A Postgres queue using
`SELECT ... FOR UPDATE SKIP LOCKED` handles low thousands of jobs per second; a
curated marketplace at launch generates jobs in the hundreds per day.

The usual secondary argument for Redis — distributed rate limiting — is
addressed separately: volumetric protection belongs at the edge (AWS WAF), and
the endpoints needing precise limits (login, OTP, AI discovery) are low-volume
enough for Postgres counters.

## Decision

Use **pg-boss** on the same PostgreSQL instance as the domain data. Enqueue jobs
through `transactionalDb()` (`src/jobs/queue.ts`), which wraps pg-boss's Prisma
adapter so the queue insert joins the caller's transaction.

Do not introduce Redis.

## Consequences

- Enqueue becomes exactly-once; delivery remains at-least-once, so **every
  handler must be idempotent**, keyed on a business identifier.
- A long-running worker process is now mandatory (see ADR-0002); scale-to-zero
  serverless cannot host the poller.
- One fewer stateful system to secure, back up, monitor and pay for.
- The job tables need a retention/archival policy or they become an autovacuum
  problem.
- Required alarms: queue depth, **age of oldest pending job**, failure rate,
  dead-letter queue non-empty.

## Revisit when

Any one of: sustained throughput above ~50 jobs/sec; p95 queue latency above 30s
under normal load; job tables exceeding ~5M live rows or causing measurable
vacuum pressure; or a second independent need for Redis appears that CDN and
Postgres cannot meet.
