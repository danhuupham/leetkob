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

## 2026-11-09 — Auditing the starter CI workflow and writing `AGENTS.md` & `.github/workflows/ci.yml`
Tool: Antigravity (Gemini)
Asked for: Inspect `.github/workflows/ci.yml`, `package.json`, and `test/contract/publish.contract.test.js` in the starter (`a3e8fd6`), list every way the gate stays green on a broken build, and draft an honest workflow plus `AGENTS.md`, `.env.example`, `src/config.js`, and `scripts/scan-secrets.js`.
Kept:
- `.github/workflows/ci.yml` running on `pull_request` and `push` (`main` and `pa2` tag) on Node `22.13.0` with `npm ci`, `npm audit --audit-level=high`, `npm run check` (`gates` job), and Playwright Chromium (`e2e` job).
- `AGENTS.md` with the four required sections (`Stack`, `Commands`, `Conventions`, `Never`) and three permission tiers (`Allowed`, `Ask First`, `Never`), plus `.env.example` and `src/config.js` (`loadConfig` & `getSandboxEnv`).
Changed:
- Upgraded `scripts/scan-secrets.js` to run `git log -p --all` (with `fetch-depth: 0` in CI) in addition to scanning working-tree files, and used `fileURLToPath(new URL('..', import.meta.url))` instead of `.pathname` so the scanner works identically on Windows (`C:\...`) and Ubuntu CI (`/home/runner/...`).
- Added `npm run typecheck` (`tsc --noEmit` with `checkJs: true`, `strict: true` in `tsconfig.json`) so all four required checks — lint, format check, type check, and tests — run via one command locally and in CI.
Rejected:
- **Rejected the starter's silent CI steps (`a3e8fd6`):** Rejected `node-version: 20` (where `node --test "test/unit/**/*.test.js"` could not resolve the quoted glob and passed with 0 tests run), `npm install` (which ignores lockfile drift), `continue-on-error: true` on `npm run lint` (which hid the unused `legacyLimit` variable in `src/http.js:17`), `npm test || true` (which threw away any non-zero exit code), and running only on `push: branches: [main]` (after merge instead of blocking the PR).
- Rejected creating redundant assistant instruction files (`CLAUDE.md`, `.github/copilot-instructions.md`); consolidated all project rules and permission tiers into `AGENTS.md` alone.
By hand: Predicted the five starter CI traps before running the assistant, configured GitHub branch protection on `main` (`gates` and `e2e` required, `strict: true`, `enforce_admins: true`, `required_pull_request_reviews` enabled), and verified that `git push origin main` is rejected with `GH006`.

---

## 2026-11-09 — Writing `docs/contract/publish.md` and strict contract tests (`f8f54cb`)
Tool: Antigravity (Gemini)
Asked for: Expand `docs/contract/publish.md` to match the 5-section structure of `CONTRACT.md` in `IA#3` (`Conventions`, `Errors` as RFC 9457 Problem Details, `Resources`, `Endpoint` with role + ownership matrix, ordered evaluation steps, refusal invariant, and idempotency, plus `Versioning`), and make `test/contract/publish.contract.test.js` strict so every contract violation fails.
Kept:
- `docs/contract/publish.md` defining the complete role and ownership matrix (`401 unauthenticated`, `403 forbidden` for enrolled students of the class, `404 not-found` for TAs and students of other classes to prevent cross-class IDOR enumeration, `409 reviews-pending` with `pending` count, `400 invalid-json`, `400 validation`, and `200 OK` idempotent repeat behavior), aligned with `FAQ-01`, `FAQ-08`, `FAQ-09`, `FAQ-10`, and `FAQ-12`.
- 16 HTTP contract tests in `test/contract/publish.contract.test.js` and 8 unit tests in `test/unit/grades.test.js` (including `FAQ-11` deduplication of repeated constraint violations and `getSandboxEnv()` secret stripping).
Changed:
- Added explicit `assert.equal(app.publishedAt(2), null)` database reads after every `400`, `401`, `403`, `404`, and `409` refusal test in `test/contract/publish.contract.test.js`.
Rejected:
- **Rejected the `try/catch` wrapper in `test/contract/publish.contract.test.js` (`a3e8fd6` lines 41–49):** The starter test for `'it refuses while reviews are pending'` caught assertion errors and logged `console.log('skipping pending check:', err.message)`, making the test impossible to fail even when `POST /api/labs/1/publish` returned `200 OK` instead of `409`.
- **Rejected status-only assertions on `403` and `404` refusals (`a3e8fd6` lines 31–38):** Checking `r.status === 403` or `r.status === 404` without reading `app.publishedAt(2)` afterwards allowed a catastrophic bug in `src/app.js` to pass: `q.publish.run(lab.id)` executed *before* `!isStaff(me, lab.class_id)`, so a refused request from a student or another class's TA still published the lab in SQLite!
By hand: Audited every test in `test/contract/publish.contract.test.js` against `docs/contract/publish.md`, pushed commit `f8f54cb` to PR #1 without touching `src/app.js`, and verified that CI Run `42587382478` went red on the 8 contract violations and blocked merging PR #1 (`mergeStateStatus: BLOCKED`).

---

## 2026-11-09 — Fixing `src/app.js` and diagnosing the Node 22.13 `DatabaseSync` GC bug (`3e1f53c`)
Tool: Antigravity (Gemini)
Asked for: Fix `src/app.js` and `src/server.js` so that all 16 contract tests, 8 unit tests, ESLint, Prettier, TypeScript `tsc --noEmit`, and the Playwright `e2e` job pass without editing `test/` or `docs/contract/`.
Kept:
- Reordered `POST /api/labs/:labId/publish` in `src/app.js` to follow `docs/contract/publish.md` §4.3: (1) authenticate token (`401`), (2) parse positive integer `labId` and look up lab (`404`), (3) verify `isStaff(me, lab.class_id)` (`403` for enrolled students, `404` for everyone else) **before** any write, (4) validate `Idempotency-Key` and JSON body (`400`), (5) check `pending > 0` (`409 reviews-pending` with `{ pending }`), and (6) atomically publish once and replay `Idempotent-Replayed: true` on `Idempotency-Key` retries.
Changed:
- Rooted the SQLite `DatabaseSync` instance on the HTTP server (`Object.defineProperty(server, '__db', { value: activeDb })` in `src/app.js` and `const db = open();` in `src/server.js`). In CI Run `42586953474` on Node `22.13.0`, passing an unrooted `open()` temporary into `createApp(open())` allowed V8 garbage collection to finalize the underlying `DatabaseSync` connection while `StatementSync` objects were still in use, crashing Playwright `e2e` with `ERR_INVALID_STATE: statement has been finalized`.
Rejected:
- Rejected the assistant's initial suggestion to use `db.exec(...)` string interpolation for queries instead of prepared statements; keeping `StatementSync` prepared statements and rooting `db` on `server.__db` fixed the GC lifecycle issue while preserving parameterized SQL safety.
By hand: Verified `git diff f8f54cb..3e1f53c -- test/ docs/contract/` was completely empty, pushed `3e1f53c` to PR #1, confirmed CI Run `42587620425` passed both `gates` and `e2e`, and merged PR #1 into `main` (`45abf32`).

---

## 2026-11-09 — Deliberate contract break (`PR #2`, `8168045`) and second-reader AI review
Tool: Antigravity (Gemini — fresh `research` subagent session for second-reader review)
Asked for: In a fresh session with only `docs/contract/publish.md` and the git diff of PR #2 (`8168045`), answered: *"What would you block in this pull request, and why? Quote the line."*
Kept:
- The second reader's exact block verdict posted on [PR #2 comment](https://github.com/danhuupham/leetkob/pull/2#issuecomment-6735900071), quoting the deleted `if (pending > 0) { return problem(res, 409, 'reviews-pending', ...); }` lines in `src/app.js` and citing `docs/contract/publish.md` §4.3 Step 5 (line 133), §2.2 (line 58), and §4.1 (lines 87, 99–102).
Changed:
- Kept `_unusedNeedsReview` referenced with `void` in `8168045` so that ESLint, Prettier, TypeScript, and unit tests all passed in CI Run `42588038582`, isolating the failure exclusively to `npm run contract` (`✖ it refuses while reviews are pending — 200 !== 409`).
Rejected:
- The second reader also claimed the diff violated §5 (`Breaking Changes Require /api/v2`). While true at a policy level, `8168045` was an implementation bug against the v1 contract rather than an intentional schema migration; the primary contract violation is §4.3 Step 5 (`409 reviews-pending`).
By hand: Created branch `test/deliberate-contract-break`, opened PR #2 (`https://github.com/danhuupham/leetkob/pull/2`), verified CI Run `42588038582` failed on `gates` and blocked merging even with `gh pr merge 2 --admin` (`GraphQL: Required status check "gates" is failing`), and left PR #2 open as live evidence.
