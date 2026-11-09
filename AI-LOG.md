# AI-LOG.md — LeeTKOB (`PA#2`: Harness and Quality Gate)

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

**LLM Feature Data & Cost Declaration (AI-LOG Rule #6 & Brief §3, §5):**
- **Model & Provider:** Google Gemini `gemini-2.5-flash` (`MODEL_PROVIDER=gemini`, `MODEL_NAME=gemini-2.5-flash`), called exclusively from the server.
- **Data Leaving the System (`PA#3`+):** Only the lab problem statement, the TA's declared constraint text, and the C++ source code of an `Accepted` submission after stripping comments, student names, and student IDs (`FAQ-06`). No student PII, grades, or test inputs/outputs are sent to the model.
- **Cost & Spending Cap:** Checking one lab of 80 Accepted C++ submissions costs `~$0.012 USD` (`~1,200` input tokens + `~250` output tokens per semantic constraint check). `src/config.js` enforces a per-lab cap of `MODEL_MAX_COST_USD_PER_LAB=0.25`, and the provider API key has a hard monthly cap of `$5.00 USD/month` configured in Google Cloud Billing / AI Studio. Unit, contract, and e2e tests in CI never call the live model API.

---

## Entry 1 · 2026-11-09 — Making `.github/workflows/ci.yml` honest and building the harness (`2e82177`, `79d90f0`, `e45ebdd`)
Tool: Antigravity (Gemini)
Asked for: Draft an honest GitHub Actions workflow `.github/workflows/ci.yml` running on every pull request and push on Node `22.13.0`, plus `AGENTS.md`, `.env.example`, `src/config.js`, and `scripts/scan-secrets.js`.
Kept:
- `.github/workflows/ci.yml` with two required jobs (`gates` running `npm ci`, `npm audit --audit-level=high`, `npm run check`, and `e2e` running Playwright Chromium), `.env.example` (18 variables), `src/config.js` (`loadConfig` & `getSandboxEnv`), and `scripts/scan-secrets.js` scanning both working-tree files and `git log -p --all`.
Changed:
- In `scripts/scan-secrets.js`, replaced `new URL('..', import.meta.url).pathname` with `fileURLToPath(new URL('..', import.meta.url))` so the scanner resolves Windows drive paths (`C:\...`) without throwing `ENOENT`.
- In commit `e45ebdd`, rewrote the assistant's initial 883-word `AGENTS.md` down to a concise 26-line file and updated `src/server.js` and `src/app.js` to import `config` from `src/config.js` at startup instead of reading `process.env.PORT` directly.
Rejected:
- **Rejected AI-generated duplicate rules files (`2e82177` → `79d90f0`):** In `2e82177`, the assistant created three separate instruction files (`CLAUDE.md`, `AGENTS.md`, and `.github/copilot-instructions.md`). During review in `79d90f0`, we rejected maintaining three files that could drift out of sync and deleted `CLAUDE.md` and `.github/copilot-instructions.md` (`git rm`), keeping `AGENTS.md` as the single source of truth.
- **Rejected AI-generated verbose rules and uncalled `loadConfig()` (`79d90f0` → `e45ebdd`):** The assistant's first `AGENTS.md` was 883 words of prose and claimed `src/config.js` validated env vars at startup while `src/server.js` still read `process.env.PORT` directly without importing `src/config.js`. We rejected the long prose version and wired `config` into `src/server.js` and `src/app.js`.
By hand: Audited the starter's `.github/workflows/ci.yml` (`a3e8fd6`) before running the assistant and identified the five reasons it could never fail (`node-version: 20` failing glob discovery with 0 tests run, `npm install`, `continue-on-error: true` hiding `legacyLimit` in `src/http.js:17`, `npm test || true`, and running only on `push` to `main`). Configured branch protection on `main` (`gates` & `e2e` pinned to `app_id: 15368`, `enforce_admins: true`).

---

## Entry 2 · 2026-11-09 — Writing `docs/contract/publish.md` and strict contract tests (`f8f54cb`, `cf5d583`)
Tool: Antigravity (Gemini)
Asked for: Expand `docs/contract/publish.md` to match the 5-section structure of `CONTRACT.md` in `IA#3` and write HTTP contract tests in `test/contract/publish.contract.test.js` covering every rule.
Kept:
- `docs/contract/publish.md` (§1 Conventions, §2 RFC 9457 Errors, §3 Resources & Student Visibility Effects per `FAQ-08`/`FAQ-11`/`FAQ-13`, §4 Endpoint Role/Ownership Matrix, Ordered Evaluation Steps, and Idempotency, §5 Versioning) and 22 contract tests in `test/contract/publish.contract.test.js` + 8 unit tests in `test/unit/grades.test.js`.
Changed:
- Added `assert.equal(app.publishedAt(lab), null)` after every `400`, `401`, `403`, `404`, and `409` refusal test in `test/contract/publish.contract.test.js`.
- In `cf5d583`, added contract specification and tests for `409 deadline-not-passed` (`FAQ-12` Condition 1), `500 internal` (`app.breakDb()`), whitespace-only `Idempotency-Key` (`"    "`), wrong `Authorization` scheme (`Basic`), unknown `/api` routes without a token (`404`), and retrying the same `Idempotency-Key` after resolving a `409 reviews-pending`.
Rejected:
- **Rejected AI-generated process-local `usedIdempotencyKeys = new Set()` (`3e1f53c` → `e45ebdd`):** The assistant initially implemented `Idempotency-Key` tracking in `src/app.js` using an in-memory `Set` and left `Idempotency-Key` scope, TTL, and cross-user behavior unspecified in `docs/contract/publish.md`. We rejected the in-memory `Set` and replaced it with the SQLite `idempotency_keys (lab_id, key, user_id, published_at, created_at)` table in `src/db.js` with a 24-hour window.
- **Rejected AI-generated auth-before-route check (`3e1f53c` → `e45ebdd`):** In `3e1f53c`, the assistant placed `if (!me) return problem(res, 401, ...)` before route matching, causing unknown `/api` paths without a token to return `401` in violation of `docs/contract/publish.md` §2.2 (`404 not-found`). We rejected that order and moved route matching before `whoIs(req)`.
By hand: Found the starter's two test holes in `a3e8fd6` (`try/catch` swallowing `409 reviews-pending` on lines 41–49, and status-only `403`/`404` checks missing `q.publish.run` executing before `isStaff`), pushed `f8f54cb` to PR #1, and confirmed CI Run `42587382478` went red on 8 contract tests and blocked the merge.

---

## Entry 3 · 2026-11-09 — Fixing `src/app.js` and the Node 22.13 `DatabaseSync` V8 GC bug (`3e1f53c`)
Tool: Antigravity (Gemini)
Asked for: Fix `src/app.js` and `src/server.js` so all contract tests and the Playwright `e2e` job pass without modifying `test/` or `docs/contract/`.
Kept:
- Reordering `POST /api/labs/:labId/publish` in `src/app.js` so authentication, `labId` lookup, `isStaff(me, lab.class_id)` ownership, header/body validation, deadline check, and pending-review check all run **before** `q.publish.run(lab.id)`.
Changed:
- Rooted the SQLite `DatabaseSync` handle on `server.__db` in `src/app.js` and stored `const db = open();` in `src/server.js`. In CI Run `42586953474` (`2e82177`), passing an unrooted `open()` temporary into `createApp(open())` allowed V8 garbage collection on Node `22.13.0` to finalize `DatabaseSync` while its `StatementSync` prepared statements were still referenced by `handle()`, throwing `ERR_INVALID_STATE: statement has been finalized` during Playwright `e2e`.
Rejected:
- **Rejected AI suggestion to replace prepared statements with `db.exec()` string interpolation:** When diagnosing `ERR_INVALID_STATE: statement has been finalized`, the assistant initially suggested replacing `db.prepare(...)` calls with per-request `db.exec(...)` SQL strings. We rejected string-interpolated SQL and instead rooted `db` on `server.__db` to keep parameterized prepared statements alive.
By hand: Verified `git diff f8f54cb..3e1f53c -- test/ docs/contract/` was empty, pushed `3e1f53c`, verified CI Run `42587620425` turned green on both `gates` and `e2e`, and merged PR #1 (`45abf32`).

---

## Entry 4 · 2026-11-09 — Deliberate contract break (`PR #2`, `8168045`) and second-reader AI review
Tool: Antigravity (Gemini — fresh `research` subagent session for second-reader review)
Asked for: In a fresh session given only `docs/contract/publish.md` and the git diff of PR #2 (`8168045`), answered: *"What would you block in this pull request, and why? Quote the line."*
Kept:
- The second reader's block review ([PR #2 comment](https://github.com/danhuupham/leetkob/pull/2#issuecomment-6735900071)) quoting the deleted `if (pending > 0)` check in `src/app.js` and citing `docs/contract/publish.md` §4.3 Step 5 (`409 reviews-pending`), §2.2, and §4.1.
Changed:
- Kept `needsReview` referenced via `void` in `8168045` so ESLint, Prettier, TypeScript, and unit tests all passed in CI Run `42588038582`, isolating the red failure strictly to `npm run contract` (`✖ it refuses while reviews are pending — 200 !== 409`).
Rejected:
- **Rejected the second reader's false alarm on §5 (`/api/v2` versioning):** The second reader also claimed removing the `409` check required bumping the route path to `/api/v2/labs/{labId}/publish` under §5. We rejected that framing because publishing without TA review violates LeeTKOB's core human-gate invariant (`FAQ-12`) in any version, not a v2 migration.
By hand: Opened PR #2 (`https://github.com/danhuupham/leetkob/pull/2`), confirmed CI Run `42588038582` failed on `gates` and blocked merging even with `--admin` (`GraphQL: Required status check "gates" is failing`), and left PR #2 open as permanent evidence.
