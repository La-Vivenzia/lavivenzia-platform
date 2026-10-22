# Contributing to La Vivenzia

This guide is the working agreement for everyone who changes code in this
repository. It covers ownership, branching, commits, the pre-push gate and the
secrets policy. For the delivery process and the full definition of done, see
[`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md); for what the product is and
how it is built, read the documents listed in [`README.md`](README.md) before
starting work.

If anything here conflicts with a project specification document, the
specification wins — raise the conflict in your PR rather than working around it.

---

## 1. Ownership and review

**Karan Patil is the Technical Lead.** Every pull request requires his review and
approval before it can be merged. There are no exceptions for small changes,
documentation, configuration or urgent fixes.

- Approval is given in the GitHub review UI. A message in chat is not approval.
- A new push after approval invalidates it; request a fresh review.
- Only the Technical Lead merges into `main`, unless he explicitly delegates a
  specific merge.
- Changes that hit a human approval gate in `DEVELOPMENT_WORKFLOW.md` —
  architecture, database redesign, payments, authentication, security, major
  dependencies, infrastructure or the design system — must be discussed with the
  Technical Lead **before** implementation, not at review time.

## 2. Protected `main`

`main` is the production line. It must always build and pass CI.

- **Direct commits to `main` are strictly prohibited.** All changes arrive
  through a reviewed pull request.
- **Force pushes to `main` are strictly prohibited.** Never run
  `git push --force` or `git push --force-with-lease` against `main`, and never
  rewrite its history.
- Do not delete `main` or retarget its history in any way.

Force-pushing your _own_ feature branch while it is under review is allowed (for
example after a rebase), but prefer adding commits once review has started so the
reviewer can see what changed.

## 3. Branch naming

Create every branch from an up-to-date `main`:

```bash
git switch main
git pull --ff-only
git switch -c feature/LV-123-host-payouts
```

| Prefix                     | Use for                                          | Example                        |
| -------------------------- | ------------------------------------------------ | ------------------------------ |
| `feature/<ticket-or-name>` | New user-facing or platform capability           | `feature/LV-142-booking-holds` |
| `fix/<ticket-or-name>`     | Bug fixes                                        | `fix/LV-158-duplicate-webhook` |
| `chore/<name>`             | Tooling, dependencies, CI, docs and other upkeep | `chore/upgrade-prisma`         |

Rules:

- Lowercase, words separated by hyphens. No spaces, underscores or uppercase
  (ticket keys such as `LV-123` are the one exception).
- Include the ticket ID when one exists.
- One concern per branch. Keep branches short-lived and rebase on `main` often.

## 4. Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <imperative summary, lower case, no full stop>

<optional body — what changed and why, wrapped at ~72 characters>

<optional footer — e.g. Refs: LV-123, BREAKING CHANGE: ...>
```

| Type       | Use for                                                   |
| ---------- | --------------------------------------------------------- |
| `feat`     | A new capability                                          |
| `fix`      | A bug fix                                                 |
| `test`     | Adding or correcting tests only                           |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `chore`    | Tooling, dependencies, CI, configuration, documentation   |

Examples:

```text
feat(booking): hold availability slot during checkout
fix(payments): ignore duplicate webhook deliveries
test(auth): cover expired session rejection
refactor(search): extract distance ranking into a service
chore(deps): upgrade next to 16.3.1
```

- Scopes name the module touched (`booking`, `payments`, `auth`, `host`,
  `admin`, `search`, `ui`, `db`, …).
- Each commit should be focused and leave the tree in a working state. Do not
  mix unrelated changes in one commit.
- Mark breaking changes with `!` after the type (`feat(api)!: …`) and a
  `BREAKING CHANGE:` footer.

## 5. Mandatory pre-push check

Before you push a branch for review or open a pull request, run:

```bash
npm run verify
```

`verify` runs, in order:

1. `format:check` — Prettier
2. `lint` — ESLint
3. `typecheck` — `tsc --noEmit`
4. `test` — Vitest unit suite
5. `build` — Next.js production build

**All five must pass.** Do not open a PR with a failing or skipped check, and do
not disable a lint rule, skip a test or add `@ts-ignore` to get green — fix the
cause, or raise it with the Technical Lead.

Notes:

- Use Node.js `>= 22.12` and install with `npm ci`.
- The build validates environment variables. Copy `.env.example` to `.env.local`
  and fill in local values (`npm run db:up` starts the local database).
- If formatting fails, run `npm run format` and commit the result.
- If your change touches the Prisma schema, migrations, seeds or anything that
  depends on real database behaviour, also run `npm run verify:full`, which adds
  database verification and the integration suite.
- CI runs the same checks on every pull request. A PR is not reviewable until CI
  is green.
- User-facing changes additionally require the manual visual check in
  `DESIGN.md` §B.12 — both modes, both palettes, real breakpoints, every state. A
  UI change that has only been typechecked is not finished.

## 6. Zero secrets policy

Secrets never enter the repository — not in code, tests, fixtures, docs,
comments, commit messages, PR descriptions or screenshots.

**Never commit:**

- `.env`, `.env.local` or any populated `.env.*` file (only `.env.example`, with
  empty or obviously fake values, is tracked)
- API keys or tokens (payment, email, storage, AI, maps, OAuth, …)
- database URLs containing real credentials
- session or signing secrets, private keys, certificates (`*.pem`)
- customer or production data

**Instead:**

- Read configuration from environment variables, validated in `src/lib/env.ts`.
- Use local `.env.local` for development; deployed environments read from
  company-managed secret storage.
- Add new variables to `.env.example` with an empty value and a comment, and to
  the environment schema.
- Never paste production secrets into AI tools or chat.

**If a secret is committed or pushed — even to a feature branch:**

1. Tell the Technical Lead immediately.
2. Treat the secret as compromised and rotate it at the provider. Deleting the
   commit is not enough; the value is already in history and may be cached.
3. Then remove it from the branch.

## 7. Pull requests

1. Push your branch and open a PR against `main`. The
   [pull request template](.github/pull_request_template.md) loads
   automatically — complete every section; mark items that do not apply as N/A
   rather than deleting them.
2. Keep PRs small and focused. A reviewer should be able to understand the
   change in one sitting; split large work into independently verifiable PRs.
3. Request review from Karan Patil.
4. Respond to every review comment, either with a change or a reply. Resolve a
   thread only once the reviewer is satisfied.
5. Once approved and green, the Technical Lead merges. Delete the branch after
   merge.

## 8. Documentation

If your change alters behaviour, architecture or a decision, update the relevant
document in the same PR — `PROJECT_STATE.md`, `SYSTEM_DESIGN.md`,
`REQUIREMENTS.md`, `docs/DATABASE.md`, or a new ADR in `docs/adr/` (copy
`0000-template.md`). Documentation that lags the code is treated as a defect.
