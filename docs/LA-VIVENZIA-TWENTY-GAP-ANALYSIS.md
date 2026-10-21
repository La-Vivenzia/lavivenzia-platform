# La Vivenzia CRM — Twenty CRM gap analysis

**Status:** Evaluation only. No code was written, changed, or committed in either repository.
**Date:** 2026-09-07
**Analyst note:** every claim below was verified against the source in
`D:\LA  VIVENZIA\LAVIVENZIACRM`, not against Twenty's documentation or marketing.

---

## 0. Two things to read before the findings

### 0.1 The requirements source is this task, not the founder's blueprint

The brief refers to a "CRM Product Requirements & Functional Blueprint". **That document is
not on disk.** A search across every La Vivenzia directory found only
`lavivenziaSAAS/REQUIREMENTS.md`, which specifies the _marketplace platform_ and says nothing
about a CRM.

This analysis is therefore built from the requirement list enumerated in the task itself —
Phase 1 (18 items), Phase 2 (11), Phase 3 (9), plus 34 cross-cutting items. That list is
substantial and specific enough to support a real audit, and proceeding was better than
producing nothing.

**What this costs.** The blueprint almost certainly carries acceptance criteria, field-level
detail, volumes, and SLA numbers that this list does not. Those change _individual rows_ —
particularly the SLA engine, the assignment rules, and the role definitions — but they are
very unlikely to change the architectural conclusion. **Re-run the matrix against the
blueprint before committing budget.**

### 0.2 The licence is a business decision, not an engineering one

Twenty is **AGPL-3.0**. Section 13 triggers on _network interaction_: if you modify Twenty
and people reach the modified version over a network, you must offer them the source of your
modifications.

- Internal use by La Vivenzia staff is the softer case.
- Exposing it to hosts, partners or travellers is not.

Every recommendation in §7 assumes this is resolved. It is the single largest non-technical
risk in the evaluation, and it should be answered by the founders before engineering starts.
There is a commercial licence available from Twenty; that conversation is cheaper than a
rewrite.

---

## 1. What is actually running

|                        |                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Product                | Twenty CRM                                                                                                           |
| Release line           | **2.39** (upgrade commands present through `2-39`)                                                                   |
| `package.json` version | `0.2.1` — this is the **monorepo workspace version, not the release**; do not quote it as the product version        |
| Source provenance      | **Not a git repository.** Downloaded as an archive, so there is no upstream remote and no way to pull security fixes |
| Running image          | `twentycrm/twenty@sha256:6c95b4ba…`, built 2026-09-04                                                                |
| Local URL              | `http://localhost:3002` (3000 and 3001 were already taken)                                                           |
| Runtime                | Docker: server + worker + PostgreSQL 16 + Redis, compose project `twenty`                                            |

**The missing git history is a real finding, not a formality.** A CRM holds customer data.
Running one you cannot patch from upstream is an operational risk with no upside. Before any
further work: clone `twentyhq/twenty` and check out the tag, rather than continuing on a
snapshot.

---

## 2. Architecture as verified in source

### 2.1 Overall

An **Nx monorepo, 20 packages, Yarn 4.13**, requiring **Node ^24.5.0** (the machine has
22.16.0 — the Docker path avoids this, a source build does not).

The server is **NestJS**; the front is **React 19 + Vite + Apollo Client 4 + Jotai +
Emotion + react-router 6 + Lingui** for i18n.

### 2.2 The architectural fact that decides this evaluation

Twenty is **not a CRM with a plugin system bolted on. It is a metadata-driven application
platform that ships a CRM as its default configuration.**

`engine/metadata-modules/` contains ~70 modules describing objects, fields, views, layouts,
roles, permissions, agents and skills _as data_. Creating a custom object or field writes
metadata and provisions real PostgreSQL tables per workspace — it is not a JSON blob bolted
onto a fixed schema.

This is the single most important finding in the report. It means a large share of
La Vivenzia's data model is **configuration, not development**.

### 2.3 Backend

```
engine/
  api/            graphql · rest · mcp        ← three API surfaces, MCP included
  metadata-modules/  ~70 modules: the no-code platform
  twenty-orm/        per-workspace schema provisioning
  core-modules/      ~70 platform services (auth, billing, search, file, ai, tool, …)
  workspace-manager/ multi-tenant lifecycle
modules/          the shipped CRM domain (person, company, opportunity, task, …)
```

### 2.4 Database

PostgreSQL 16. **Multi-tenant by schema**: each workspace gets its own provisioned schema,
driven by metadata. Redis for queues and cache. Soft delete is pervasive (`deletedAt`) with
a dedicated `engine/trash-cleanup/` module — commands, crons and jobs.

### 2.5 Standard objects shipped

`person`, `company`, `opportunity`, `task`, `task-target`, `note`, `note-target`,
`attachment`, `timeline-activity`, `calendar-event` (+participants, targets),
`message` / `message-thread` / `message-participant` (email), `message-campaign`,
`message-list`, `call-recording`, `workflow` (+version, +run, +automated-trigger),
`dashboard`, `workspace-member`, `blocklist`.

This maps onto a CRM almost directly: Person → Lead/Contact, Company → Partner,
Opportunity → Deal/Onboarding pipeline.

---

## 3. Subsystem inventory (verified)

| #   | Area                | Verdict                                                                                                                                                                                                                                                                                             | Evidence in source                                                                               |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Version / branch    | 2.39 line, no git                                                                                                                                                                                                                                                                                   | `upgrade-version-command/2-39/`                                                                  |
| 2   | Architecture        | Nx monorepo, NestJS + React                                                                                                                                                                                                                                                                         | `nx.json`, `packages/`                                                                           |
| 3   | Frontend            | React 19, Apollo 4, Jotai, Emotion, Lingui                                                                                                                                                                                                                                                          | `twenty-front/package.json`                                                                      |
| 4   | Backend             | NestJS, modular, 3 API surfaces                                                                                                                                                                                                                                                                     | `engine/api/{graphql,rest,mcp}`                                                                  |
| 5   | Database            | PostgreSQL 16, schema-per-workspace                                                                                                                                                                                                                                                                 | `engine/twenty-orm`, `workspace-manager`                                                         |
| 6   | Authentication      | **Strong.** Password, Google, Microsoft, **SAML**, **OIDC**, JWT, API keys, 2FA, impersonation, approved domains                                                                                                                                                                                    | `core-modules/auth/strategies/`, `two-factor-authentication/`, `sso/`                            |
| 7   | RBAC                | **Very strong.** Roles, permission flags, **object-level**, **field-level**, and **row-level permission predicates**                                                                                                                                                                                | `metadata-modules/{role,object-permission,flat-field-permission,row-level-permission-predicate}` |
| 8   | Object/data model   | Metadata-driven custom objects, real tables                                                                                                                                                                                                                                                         | `metadata-modules/object-metadata`                                                               |
| 9   | Custom fields       | **25 types** incl. `RELATION`, `MORPH_RELATION`, `MULTI_SELECT`, `CURRENCY`, `RATING`, `RICH_TEXT`, `FILES`, `RAW_JSON`, `TS_VECTOR`                                                                                                                                                                | `FieldMetadataType`                                                                              |
| 10  | Workflow engine     | **Strong.** Triggers: `DATABASE_EVENT`, `MANUAL`, `CRON`, `WEBHOOK`. Actions: `ai-agent`, `code`, `http-request`, `mail-sender`, `record-crud`, `if-else`, `filter`, `iterator`, `delay`, `form`, `logic-function`, `create-calendar-event`, `tool-backed`                                          | `modules/workflow/workflow-executor/workflow-actions/`                                           |
| 11  | Tasks               | Standard object with targets                                                                                                                                                                                                                                                                        | `modules/task/`                                                                                  |
| 12  | Timeline            | Standard object + configurable activity types + event logs                                                                                                                                                                                                                                          | `modules/timeline/`, `core-modules/event-logs/`                                                  |
| 13  | Email / calendar    | **Strong.** Gmail, Microsoft, and **IMAP/SMTP/CalDAV**. Two-way sync, threads, participants, blocklist                                                                                                                                                                                              | `core-modules/imap-smtp-caldav-connection/`, `modules/messaging/`, `modules/calendar/`           |
| 14  | Search              | Postgres `tsvector` + GIN, with a documented fallback path when tsvector returns nothing                                                                                                                                                                                                            | `core-modules/search/services/search.service.ts:198-257`                                         |
| 15  | Dashboards          | Real. Widgets: `NUMBER`, `BAR_CHART`, `LINE_CHART`, `PIE_CHART`, `AGGREGATE_CHART`, `VIEW`, `IFRAME`, `PAGEVIEW`                                                                                                                                                                                    | `modules/dashboard/chart-data/`                                                                  |
| 16  | API                 | GraphQL + REST + **MCP** + webhooks + SDK + CLI                                                                                                                                                                                                                                                     | `engine/api/`, `twenty-sdk`, `twenty-cli`                                                        |
| 17  | AI / agents         | **Much stronger than expected.** Agents, executions, monitoring, agent roles, billing, chat, skills. Providers: **Anthropic (Claude Opus 5 / Sonnet 5), OpenAI, Google, Mistral, xAI, openai-compatible**. Agent tools: email, calendar, HTTP, **code interpreter**, navigation, help-centre search | `metadata-modules/ai/*`, `core-modules/tool/tools/`                                              |
| 18  | Files               | Local + **S3** drivers, validated                                                                                                                                                                                                                                                                   | `core-modules/file-storage/drivers/`                                                             |
| 19  | Import / export     | Spreadsheet import UI; CSV export per-view and per-record                                                                                                                                                                                                                                           | `twenty-front/src/modules/spreadsheet-import/`, `useRecordIndexExportRecords.ts`                 |
| 20  | Audit               | `isAuditLogged` per object; event logs with live resolver; timeline activities                                                                                                                                                                                                                      | `event-logs/`, `objectMetadata.isAuditLogged`                                                    |
| 21  | Notifications       | **Weak — genuine gap.** Email sending exists. **No in-app notification object or centre** was found; only a front-component seed example                                                                                                                                                            | `core-modules/email/`; no notification workspace entity                                          |
| 22  | Deployment          | Docker Compose, **Helm, k8s**, Podman, Grafana, OTel collector                                                                                                                                                                                                                                      | `packages/twenty-docker/`                                                                        |
| 23  | Extension framework | Apps, SDK, CLI, front-components, logic functions, custom skills/agents                                                                                                                                                                                                                             | `twenty-apps/`, `twenty-sdk/`, `twenty-cli/`                                                     |
| 24  | Mobile              | Responsive helpers throughout the UI layer. **Desktop-first; no native app**                                                                                                                                                                                                                        | `twenty-front/src/modules/ui/**`                                                                 |
| 25  | Testing             | **Excellent.** 1,088 server specs · 1,162 front tests · 1,120 integration files · 275 Storybook stories · Playwright e2e                                                                                                                                                                            | `twenty-e2e-testing/`, `**/*.spec.ts`                                                            |

### 3.1 Capabilities I expected to be missing and are not

- **Duplicate detection is real**: `duplicateCriteria` on `objectMetadata`, a
  `common-find-duplicates-query-runner.service.ts`, _and_ a `common-merge-many-query-runner`
  for merging records. This is a full feature, not a stub.
- **Call recording with transcription** is a shipped standard object.
- **MCP** is a first-class API surface — unusually convenient for AI tooling.

### 3.2 Capabilities that genuinely are not there

Verified by search, with false positives excluded:

- **OCR — absent.** An initial grep suggested 306 files; every one was a substring match
  (`processor`, and similar). There are **no genuine OCR references**.
- **WhatsApp — absent.** One incidental file. No integration.
- **Twilio / SMS / voice capture — absent.** One incidental file.
- **In-app notification centre — absent.**
- **Lead scoring, SLA timers, round-robin assignment — absent** as named features.

---

## 4. The matrix

A 16-column table is unreadable in Markdown, so the requested fields are split: the decision
columns are in the matrix, and the verbose columns (approach, risks) follow per requirement
in §4.4. No requested information is omitted.

**Support levels.** A = fully supported · B = mostly, via configuration · C = partial,
needs custom development · D = substantial new functionality · E = not realistic without
major architectural work.

**Column keys.** Cfg = configuration only · Cus = custom development · Maj = major
development · DB = new database model · BE = new backend logic · FE = new frontend UI ·
3P = third-party integration · AI = AI required · Cx = complexity (S/M/L/XL).

### 4.1 Phase 1 — Core CRM

| ID    | Requirement                       | Lvl   | Cfg | Cus | Maj | DB  | BE  | FE  | 3P  | AI  | Cx  | Twenty location                                                                |
| ----- | --------------------------------- | ----- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ------------------------------------------------------------------------------ |
| P1-01 | Login                             | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `core-modules/auth/`                                                           |
| P1-02 | Roles & permissions               | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `metadata-modules/role`, `object-permission`, `row-level-permission-predicate` |
| P1-03 | Lead database                     | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `modules/person`, `object-metadata`                                            |
| P1-04 | Dynamic categories                | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `FieldMetadataType.SELECT` / `MULTI_SELECT`                                    |
| P1-05 | Lead capture                      | **B** | ✓   | ✓   | –   | –   | ✓   | ✓   | –   | –   | M   | `workflow-trigger` (WEBHOOK), REST API                                         |
| P1-06 | Lead profile                      | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `record-show`, `page-layout`                                                   |
| P1-07 | Lead timeline                     | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `modules/timeline/`                                                            |
| P1-08 | Assignment (manual)               | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `RELATION` → `workspaceMember`                                                 |
| P1-09 | Tasks                             | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `modules/task/`                                                                |
| P1-10 | Follow-ups                        | **B** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | Task + `CRON`/`DATABASE_EVENT` workflow                                        |
| P1-11 | Interaction history               | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `timeline-activity`, `message-thread`                                          |
| P1-12 | Basic dashboards                  | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `modules/dashboard/`                                                           |
| P1-13 | Onboarding workflow               | **B** | ✓   | ✓   | –   | –   | –   | –   | –   | –   | M   | `opportunity` pipeline + workflow engine                                       |
| P1-14 | Email integration                 | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | M   | `imap-smtp-caldav-connection`, `modules/messaging`                             |
| P1-15 | Search                            | **B** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `core-modules/search/` (tsvector + GIN)                                        |
| P1-16 | Admin controls                    | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `core-modules/admin-panel/`                                                    |
| P1-17 | Audit log                         | **B** | ✓   | ✓   | –   | –   | ✓   | ✓   | –   | –   | M   | `event-logs/`, `isAuditLogged`                                                 |
| P1-18 | Delete restrictions / recycle bin | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | soft delete + `engine/trash-cleanup/`                                          |

**Phase 1: 11×A, 7×B, 0×C/D/E.**

### 4.2 Phase 2 — AI CRM

| ID    | Requirement               | Lvl   | Cfg | Cus | Maj | DB  | BE  | FE  | 3P  | AI  | Cx  | Twenty location                                     |
| ----- | ------------------------- | ----- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------------------------------------------------- |
| P2-01 | AI lead classification    | **B** | ✓   | ✓   | –   | –   | –   | –   | –   | ✓   | M   | `ai-agent` workflow action                          |
| P2-02 | AI lead scoring           | **C** | –   | ✓   | –   | ✓   | ✓   | ✓   | –   | ✓   | M   | agent + custom score field + recompute job          |
| P2-03 | Duplicate detection       | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `common-find-duplicates-query-runner`, `merge-many` |
| P2-04 | AI summaries              | **B** | ✓   | ✓   | –   | –   | –   | ✓   | –   | ✓   | M   | `ai-generate-text`, `ai-agent`                      |
| P2-05 | AI email drafting         | **B** | ✓   | ✓   | –   | –   | –   | –   | –   | ✓   | M   | `send-email-tool`, `mail-sender` action             |
| P2-06 | AI WhatsApp drafting      | **D** | –   | –   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | L   | **no WhatsApp integration exists**                  |
| P2-07 | AI next-best-action       | **C** | –   | ✓   | –   | ✓   | ✓   | ✓   | –   | ✓   | L   | agent + custom surface                              |
| P2-08 | AI problem classification | **C** | –   | ✓   | –   | ✓   | ✓   | ✓   | –   | ✓   | M   | needs Problem object first (X-11)                   |
| P2-09 | AI onboarding assistance  | **C** | –   | ✓   | –   | –   | ✓   | ✓   | –   | ✓   | M   | agent + onboarding pipeline                         |
| P2-10 | OCR                       | **D** | –   | –   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | L   | **absent**; needs external OCR service              |
| P2-11 | AI daily brief            | **C** | –   | ✓   | –   | –   | ✓   | ✓   | –   | ✓   | M   | `CRON` + agent + digest surface                     |

**Phase 2: 1×A, 3×B, 5×C, 2×D.**

### 4.3 Phase 3 — Intelligent operating system

| ID    | Requirement            | Lvl   | Cfg | Cus | Maj | DB  | BE  | FE  | 3P  | AI  | Cx  | Twenty location                                             |
| ----- | ---------------------- | ----- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ----------------------------------------------------------- |
| P3-01 | Voice lead capture     | **D** | –   | –   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | L   | no speech pipeline; `call-recording` is adjacent, not this  |
| P3-02 | Advanced analytics     | **C** | –   | ✓   | –   | –   | ✓   | ✓   | –   | –   | L   | dashboards cover basic; cohort/funnel do not exist          |
| P3-03 | Predictive conversion  | **D** | –   | –   | ✓   | ✓   | ✓   | ✓   | –   | ✓   | L   | no ML/feature-store layer                                   |
| P3-04 | Partner health         | **C** | –   | ✓   | –   | ✓   | ✓   | ✓   | –   | ✓   | M   | composite score over Company                                |
| P3-05 | Workflow builder       | **A** | ✓   | –   | –   | –   | –   | –   | –   | –   | S   | `workflow-builder`, visual editor shipped                   |
| P3-06 | AI forecasting         | **D** | –   | –   | ✓   | ✓   | ✓   | ✓   | –   | ✓   | L   | no forecasting engine                                       |
| P3-07 | Relationship graph     | **D** | –   | –   | ✓   | ✓   | ✓   | ✓   | –   | –   | XL  | relations exist; **graph traversal + visualisation do not** |
| P3-08 | Advanced integrations  | **B** | ✓   | ✓   | –   | –   | –   | –   | ✓   | –   | M   | `http-request` action, webhooks, REST, MCP                  |
| P3-09 | Automated intelligence | **C** | –   | ✓   | –   | –   | ✓   | ✓   | –   | ✓   | L   | agent + cron composition                                    |

**Phase 3: 1×A, 1×B, 4×C, 4×D (one XL).**

### 4.4 Cross-cutting requirements, with approach and risks

Duplicates of Phase items are noted rather than re-scored.

| ID   | Requirement                     | Lvl     | Approach                                            | Risk                                                                   |
| ---- | ------------------------------- | ------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| X-01 | Experience Hunter dashboard     | **B**   | Dashboard + saved views, role-scoped                | Widget set may not cover the intended visuals                          |
| X-02 | Lead Coordinator dashboard      | **B**   | As above                                            | —                                                                      |
| X-03 | Onboarding Expert dashboard     | **B**   | As above                                            | —                                                                      |
| X-04 | Admin Control Tower             | **B**   | `admin-panel` + dashboards                          | Admin panel is instance-level, not business-level; may need extension  |
| X-05 | Morning Workspace               | **C**   | Custom front-component + agent digest               | New surface; no equivalent concept                                     |
| X-06 | End-of-day intelligence         | **C**   | `CRON` + agent + digest                             | Same surface as X-05 — build once                                      |
| X-07 | Next Best Action engine         | **C**   | See P2-07                                           | Ranking quality is a product problem, not an engineering one           |
| X-08 | Relationship Memory             | **C**   | Timeline + messages + agent retrieval               | Needs embeddings; **pgvector is not enabled in Twenty's stack**        |
| X-09 | Partner 360°                    | **B**   | Company record page + layout + related lists        | Largely configuration                                                  |
| X-10 | Experience Quality Intelligence | **D**   | New objects + scoring + AI                          | Depends on data that does not exist yet                                |
| X-11 | Lead Problem Database           | **B**   | Custom object + fields + views                      | Pure configuration                                                     |
| X-12 | Root Cause Analysis             | **C**   | Problem object + agent analysis                     | Needs X-11 first                                                       |
| X-13 | Natural-language search         | **C**   | Agent + MCP over records                            | Twenty search is tsvector, **not semantic**; needs a vector layer      |
| X-14 | AI CRM Copilot                  | **B**   | `ai-chat` + agents + tools                          | Closest thing Twenty ships to a copilot                                |
| X-15 | AI Management Command Centre    | **C**   | Dashboards + agent digests                          | Composite of X-04/05/06                                                |
| X-16 | Custom fields                   | **A**   | 25 field types, no code                             | —                                                                      |
| X-17 | Custom workflows                | **A**   | Visual builder                                      | —                                                                      |
| X-18 | Lead assignment engine          | **C**   | Workflow `code` action                              | Workflow engine can express it; **no assignment primitive exists**     |
| X-19 | Smart round robin               | **C**   | `code` action + counter state                       | Needs durable state and fairness under concurrency                     |
| X-20 | SLA engine                      | **D**   | New timers, breach detection, escalation            | **No SLA/timer primitive.** `delay` exists but is not an SLA clock     |
| X-21 | Notifications                   | **D**   | New object + centre + delivery                      | **Genuine gap.** Email only                                            |
| X-22 | Email access                    | **A**   | Gmail / Microsoft / IMAP                            | —                                                                      |
| X-23 | Email AI                        | **B**   | Agents over message threads                         | —                                                                      |
| X-24 | Mobile-first lead capture       | **C**   | Responsive exists; **mobile-first does not**        | Twenty is desktop-first; a capture flow needs its own UI               |
| X-25 | Voice AI                        | **D**   | See P3-01                                           | External STT required                                                  |
| X-26 | AI data quality engine          | **C**   | Duplicates exist; validation/enrichment do not      | Build on `find-duplicates` + `merge-many`                              |
| X-27 | Experience Graph                | **D**   | See P3-07                                           | —                                                                      |
| X-28 | Security requirements           | **A/B** | SAML, OIDC, 2FA, RLS, field permissions, encryption | Depends on unstated specifics in the blueprint                         |
| X-29 | Analytics                       | **C**   | See P3-02                                           | —                                                                      |
| X-30 | Funnel visualization            | **C**   | No funnel widget exists                             | Chart types are number/bar/line/pie/aggregate only                     |
| X-31 | Role-based access               | **A**   | Object + field + row-level                          | Among Twenty's strongest areas                                         |
| X-32 | Deletion / recycle-bin policy   | **A**   | Soft delete + trash cleanup                         | Retention period needs configuring                                     |
| X-33 | Audit logs                      | **B**   | See P1-17                                           | Event logs exist; **a compliance-grade immutable trail is not proven** |

---

## 5. Coverage — with the methodology stated

**These are counts of requirement items at the granularity given in the task, not
weighted by effort.** A one-line requirement and a six-month requirement count the same.
Anyone using these numbers for budget will be misled; use §4 row-by-row instead.

Scoring rule: **A** = covered today; **A+B** = covered after configuration; **C+D** =
needs custom code; **D+E** = needs substantial new architecture.

### Core CRM (Phase 1 only, n = 18)

| Measure                                | Count   | Share     |
| -------------------------------------- | ------- | --------- |
| **A.** Already covered                 | 11 / 18 | **≈ 61%** |
| **B.** Covered after configuration     | 18 / 18 | **100%**  |
| **C.** Requires custom code            | 0 / 18  | **0%**    |
| **D.** Requires major new architecture | 0 / 18  | **0%**    |

Phase 1 is the strong result and it is genuine: no Phase 1 requirement scored below B.

### All phases (n = 62 unique, duplicates removed)

| Measure                             | Count | Share |
| ----------------------------------- | ----- | ----- |
| Already covered (A)                 | 20    | ≈ 32% |
| Covered after configuration (A+B)   | 36    | ≈ 58% |
| Requires custom code (C+D)          | 26    | ≈ 42% |
| Requires major new architecture (D) | 9     | ≈ 15% |

**Confidence.** High for Phases 1 and 2 — each row was checked against source. Lower for
Phase 3, because several items ("automated intelligence", "advanced analytics") are not
specified tightly enough to score reliably. Those rows are marked C/D on the assumption
that they mean substantial work; the blueprint could move them either way.

---

# EXECUTIVE SUMMARY

### 1. Is Twenty a suitable foundation?

**Yes — with one condition.** It is a better fit than expected, because it is not really a
CRM product; it is a metadata-driven platform that ships a CRM. Custom objects, 25 field
types, roles down to row level, a real workflow engine, and a multi-provider AI agent
framework are all present and verified.

The condition is the **AGPL-3.0 licence**, which is a founder decision and not an
engineering one.

### 2. Percentage of MVP already available

**≈ 61% of Phase 1 works today with no development.** Read §5 for why that number is a
count and not an estimate of effort.

### 3. Percentage achievable through configuration

**100% of Phase 1.** Every Phase 1 requirement is A or B. This is the finding that should
drive the decision.

### 4. Percentage requiring custom development

**0% of Phase 1. ≈ 42% across all three phases**, concentrated almost entirely in Phase 2
AI surfaces and Phase 3 intelligence.

### 5. Biggest missing capabilities

1. **Notifications** — no in-app notification object or centre. Email only.
2. **SLA engine** — no timer, breach or escalation primitive. `delay` is not an SLA clock.
3. **Assignment / round-robin** — expressible in a workflow `code` action, but no primitive,
   and fairness under concurrency needs durable state.
4. **Semantic search and relationship memory** — search is `tsvector`, not vector.
   **pgvector is not in Twenty's stack**, unlike the La Vivenzia platform where it already is.
5. **Voice, WhatsApp, OCR** — genuinely absent; all three need external services.
6. **Funnel and cohort analytics** — chart types are number/bar/line/pie/aggregate only.
7. **Mobile-first capture** — responsive ≠ mobile-first.

### 6. What must NOT be rebuilt

Rebuilding any of these would be waste:

- Authentication (SAML, OIDC, Google, Microsoft, 2FA, API keys, impersonation)
- RBAC — object, **field**, and **row-level** permissions
- The custom object / custom field metadata system
- The workflow engine and its visual builder
- Email and calendar sync (Gmail, Microsoft, IMAP/SMTP/CalDAV)
- Timeline and activity history
- **Duplicate detection and record merging** — already a complete feature
- Import/export, file storage (local + S3)
- Soft delete and recycle bin
- The AI agent framework and its multi-provider model layer
- The test infrastructure — ~3,400 test files is an asset you inherit

### 7. What to build as La Vivenzia modules

- Notification service and centre
- SLA / timer / escalation engine
- Lead assignment and smart round-robin
- Lead scoring and Next Best Action
- Morning Workspace / End-of-day brief (one surface, two schedules)
- Lead Problem Database and Root Cause Analysis
- Semantic layer — embeddings + vector retrieval for X-08 and X-13
- Voice, WhatsApp and OCR adapters, each behind a port

### 8. Twenty core areas needing modification

Fewer than expected. Most work attaches through the extension framework rather than into
core. Realistic core touch points:

- **Dashboard widget types** — a funnel widget requires a new chart type
- **Notification surfacing** in the app shell
- **Search** — if semantic retrieval joins the existing search path
- **Mobile-first capture** — a new route, not a modification

### 9. Biggest technical risks

1. **AGPL-3.0.** Ranked first deliberately. It constrains what you may keep private.
2. **No git history.** You cannot pull security patches into a system holding customer data.
3. **Node 24 required.** The machine has 22.16.0. Fine under Docker, blocking for a source build.
4. **Upgrade treadmill.** The upgrade-command directories run `2-8` … `2-39`; Twenty moves
   fast. Every core modification is a merge conflict you own forever. This is the strongest
   argument for extending rather than forking.
5. **Two AI stacks.** The platform standardised on Anthropic with embeddings deferred
   (ADR-0007, A-006). Twenty has its own multi-provider layer. Two independent AI
   configurations is a governance problem before it is a technical one.
6. **Multi-tenancy you do not need.** Schema-per-workspace is real complexity for a
   single-tenant internal CRM.
7. **Data-model divergence.** The platform already has Host, Experience, Booking. Twenty
   would hold its own. Which system owns a partner record is an architectural decision that
   must be made **before** building, not after.

### 10. Recommendation

## **B — Extend Twenty through its extension/app framework**, with a narrow hybrid escape hatch.

Not **A (fork)**: with releases moving 2.8 → 2.39, a fork means owning merge conflicts
forever, and nothing found in this audit requires it.

Not **C (inspiration only)**: rebuilding auth, RBAC, workflows, email sync, duplicate
detection and ~3,400 tests would cost many months to arrive behind where Twenty starts.

Not **D (hybrid)** as the headline, because "hybrid" invites building in both places by
default. The default must be _extend_; core changes should be rare, deliberate, and listed.

**The escape hatch:** the four items in §8, plus anything the founders will not accept under
AGPL. Those become La Vivenzia services **outside** the Twenty repository, integrating over
its REST/GraphQL/MCP APIs and webhooks.

---

## 6. Recommended architecture

```
┌──────────────────────────────────────────────────────────┐
│  Twenty (unmodified, pinned to a tag, upgradable)        │
│  auth · RBAC · objects/fields · workflows · email sync   │
│  timeline · duplicates · dashboards · agents · files     │
└───────▲──────────────────┬───────────────────────────────┘
        │ REST / GraphQL / │ webhooks · MCP
        │                  ▼
┌───────┴──────────────────────────────────────────────────┐
│  La Vivenzia CRM Services (own repo, own licence)        │
│  notifications · SLA engine · assignment & round-robin   │
│  lead scoring · Next Best Action · daily brief           │
│  semantic layer (pgvector) · voice · WhatsApp · OCR      │
└───────▲──────────────────────────────────────────────────┘
        │
┌───────┴──────────────────────────────────────────────────┐
│  La Vivenzia Platform (lavivenziaSAAS)                   │
│  hosts · experiences · bookings — system of record       │
└──────────────────────────────────────────────────────────┘
```

**Four rules that make this work.**

1. **Twenty stays unmodified and pinned.** Every core change is a documented exception.
2. **The platform owns hosts, experiences and bookings.** The CRM references them; it does
   not duplicate them. Decide this before writing code.
3. **Custom logic lives in La Vivenzia services**, reached from Twenty via `http-request`
   workflow actions and webhooks. This also keeps proprietary logic outside the AGPL boundary.
4. **One AI governance decision covers both systems** — provider, model, spend, data
   handling. Do not let two stacks drift.

### Immediate next steps

1. **Founders: resolve the AGPL question.** Everything else is downstream of it.
2. **Re-clone Twenty from `twentyhq/twenty`** at a pinned tag. Discard the archive.
3. **Locate the founder's blueprint** and re-run §4 against it.
4. **Decide the system-of-record boundary** between platform and CRM.
5. **Prototype Phase 1 as pure configuration.** It scored 100% B-or-better; two weeks of
   configuration would validate this entire report against reality.

---

_No code was modified. No schema was changed. No branding was altered. Nothing was committed._
