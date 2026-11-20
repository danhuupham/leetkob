# AI-LOG.md — LeeTKOB

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

**LLM Feature Data & Cost Declaration (AI-LOG Rule #6 & Brief §3, §5):**
- **Model & Provider:** Google Gemini `gemini-3.8-flash` (`MODEL_PROVIDER=gemini`, `MODEL_NAME=gemini-3.8-flash`; migrated from `gemini-2.5-flash` ahead of its December 1, 2026 API sunset), called exclusively from the server.
- **Data Leaving the System (`PA#3`+):** Only the lab problem statement, the TA's declared constraint text, and the C++ source code of an `Accepted` submission after stripping comments, student names, and student IDs (`FAQ-06`). No student PII, grades, or test inputs/outputs are sent to the model.
- **Cost & Spending Cap:** At `gemini-3.8-flash` standard pricing through Dec 31, 2026 (`$0.75 / 1M` input tokens, `$3.75 / 1M` output tokens), checking one lab of 80 Accepted C++ submissions (`~1,200` input tokens + `~250` output tokens per semantic constraint check = `96,000` input + `20,000` output tokens) costs `$0.072 + $0.075 = ~$0.147 USD` (~15 cents per lab). `src/config.js` enforces a per-lab cap of `MODEL_MAX_COST_USD_PER_LAB=0.50`, and the provider API key has a hard monthly cap of `$5.00 USD/month` configured in Google Cloud Billing / AI Studio. Unit, contract, and e2e tests in CI never call the live model API.

---

# Milestone `PA#2` — Harness and Quality Gate

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

---

# Milestone `PA#3` — Prototype with the LLM Feature Running

## Entry 5 · 2026-11-18 — Multi-milestone repository scaffold & team collaboration rules
Tool: Antigravity (Gemini)
Asked for: Standardize the repository from a `PA#2`-only slice into a shared `PA#2`–`PA#6` project setup and write team collaboration rules (`CONTRIBUTING.md`, `AGENTS.md`, `.gitignore`, `.github/CODEOWNERS`, `.github/workflows/ci.yml`, `scripts/scan-secrets.js`).
Kept:
- `CONTRIBUTING.md` defining per-member `<StudentID>@student.hcmus.edu.vn` Git authorship (`PA#6`), one-part-per-PR test-first commit discipline (`PA#3` Criterion 7 & `PA#4` Criterion 3), merge-commit preservation (`--merge` instead of squash on TDD PRs), `CODEOWNERS` protection on `/leetkob-eval/` & `/eval/`, `.gitattributes` (`eol=lf` and `leetkob-eval/** -text` to prevent Windows CRLF hash corruption), `scripts/verify-eval.js` SHA-256 gate, `docs/plans/`, `docs/reference/FAQ.md`, CI tag trigger `pa*`, and `.gitignore` coverage for `*.env` (`marking.env`), `ACCESS.md`, and SQLite WAL files.
Changed:
- Updated `scripts/scan-secrets.js` to enumerate `git ls-files --cached --others --exclude-standard` (plus an explicit check rejecting any git-tracked `.env`, `marking.env`, or `ACCESS.md`), because the `PA#2` `readdirSync` walk scanned gitignored local `.env` files on developer machines and would fail `npm run check` once a real `MODEL_API_KEY` is placed in local `.env` for `PA#3` development.
Rejected:
- **Rejected squash-merge default for multi-commit TDD PRs:** Standard team templates recommend squashing every PR into one commit, which would collapse separate `test(...)` → `feat(...)` or per-guardrail commits into a single mixed commit and forfeit `PA#3` Criterion 7 / `PA#4` Criterion 3 marks. Documented `--merge` preservation in `CONTRIBUTING.md` §2 instead.
By hand: Relocated the working repository to `Project/leetkob`, verified `git check-ignore -v` on `.env`, `marking.env`, `ACCESS.md`, and `.env.example`, and preserved tag `pa2` and open `PR #2` untouched.

---

## Entry 6 · 2026-11-18 — Modular `src/` & `migrations/` refactoring and upgrading to `gemini-3.8-flash`
Tool: Antigravity (Gemini)
Asked for: Refactor the monolithic `PA#2` slice (`src/app.js`, `src/db.js`, `public/index.html`) so three teammates can build `PA#3`–`PA#5` without merge conflicts, and verify the latest Gemini Flash model and pricing.
Kept:
- Extracted `migrations/001_init.sql`, `scripts/migrate.js`, and `scripts/seed.js` with file-backed SQLite `WAL` + `busy_timeout = 5000` support in `src/db.js` (preserving default `:memory:` behavior for `open()` so all `PA#2` unit/contract/e2e tests run untouched).
- Split `src/app.js` into `src/auth.js`, `src/http.js` (`matchRoute`, traversal-safe `serveStatic`), `src/routes/health.js`, `src/routes/queue.js`, and `src/routes/publish.js`, and separated `public/styles.css` + `public/client.js`.
- Upgraded default model from `gemini-2.5-flash` to `gemini-3.8-flash` (`$0.75/1M` input, `$3.75/1M` output -> `~$0.147/lab`, `MODEL_MAX_COST_USD_PER_LAB=0.50`).
Changed:
- Kept `matchRoute()` executing strictly before `auth.requireAuth()` so unknown `/api/*` paths without an `Authorization` header continue returning `404 not-found` per `docs/contract/publish.md` §4.3 Step 1.
Rejected:
- **Rejected keeping `gemini-2.5-flash`:** Checking Google AI Studio's official model lifecycle documentation revealed `gemini-2.5-flash` is deprecated and shuts down API access on **December 1, 2026** — the exact day before the `PA#4` deadline (December 2, 2026). Switched proactively to `gemini-3.8-flash`.
- **Rejected creating empty placeholder files for `sandbox/`, `checker/`, and `worker.js` during refactoring:** `PA#3` Rubric Criterion 7 grades one subsystem per commit with tests landing no later than implementation; pre-creating empty stubs now would muddy commit attribution.
By hand: Verified `git diff main -- test/ e2e/ docs/contract/ leetkob-eval/` is completely empty and confirmed all 8 unit tests, 22 contract tests, and Playwright `e2e` pass.

---

## Entry 7 · 2026-11-18 — Task `T3.3`: 1:1 line-preserving C++17 sanitizer & syntax-aware ban-list hard rules (`ecc4a32`, `1a8de33`)
Tool: Antigravity (Gemini)
Asked for: Implement `PA#3` Task `T3.3` test-first on branch `feat/pa3-hard-rules`: `test/unit/hard-rules.test.js` (`AC1`–`AC6`), `src/checker/sanitize.js` (`sanitizeCode`), and `src/checker/hard-rules.js` (`parseBanListConstraint`, `evaluateHardRule`).
Kept:
- `test/unit/hard-rules.test.js` committed first (`ecc4a32`) before any implementation file, covering comment/spliced-comment/raw-string traps (`AC1`), user-defined functions/namespaces/structs & member `.find` traps (`AC2`), `<algorithm>` header swap-only trap (`AC3`), `using namespace`, namespace aliases, `#define` macros, `typedef`/`using` aliases (`AC4`), loop keywords (`AC5`), and full `leetkob-eval` verification (`AC6`: `0` wrongful deductions and `100%` recall across all ban-list pairs).
- `src/checker/sanitize.js` guaranteeing `originalLines.length === strippedLines.length` across multi-line block comments, backslash-spliced `//` comments, C++17 `R"delim(...)delim"` raw string literals, and student PII scrubbing.
- `src/checker/hard-rules.js` (`1a8de33`) implementing C++17 lexical, `#include`/`#define` (`##` token-pasting), nested scope, `using`, alias, and arity-aware user-declaration resolution with zero dev-set problem IDs.
Changed:
- In `src/checker/hard-rules.js` (`isShadowedByUserSymbol`), the assistant initially skipped `cur.userVars` and `cur.userTypes` whenever `cur.aliases.has(name)` was true; because every `=` variable initializer (`int rend = 0;`) recorded an entry in `scope.aliases`, `AC2` failed by flagging `+ rend` as banned `rend`. Since `scanTokensForTarget` already evaluates `lookupAlias` before checking shadowing, we removed the `!cur.aliases.has(name)` guard so non-tainted local variables like `int rend = 0;` properly shadow unqualified `rend` without modifying `test/unit/hard-rules.test.js`. Also removed an unused `aDepth` counter caught by ESLint (`prefer-const`).
- Scoped 7–10 digit PII scrubbing in `src/checker/sanitize.js` to preserve `[10000005]` array bounds and standard competitive-programming constants (`1000000007`, `998244353`) outside string literals so fixed-size array capacities remain visible to semantic checks.
Rejected:
- **Rejected bundling `web-tree-sitter` + `.wasm` binary in `package.json`:** Adding a runtime WASM parser dependency risked path-resolution failures inside `Dockerfile.checker` (`--network none` build/run) and added opaque Emscripten glue harder to trace line-by-line in the `PA#6` oral defense. Implemented a pure-JS C++17 lexer and lexical-scope resolver with `0` runtime npm dependencies instead.
- **Rejected naive `'` character-literal lexing and empty-backtick ban-list matching:** Treating every `'` as opening a character literal breaks C++14 digit separators (`const int MAX_VAL = 1'000'000;`), and classifying `"Do not use ..."` prose without backticks as a ban-list rule would return `pass` with an empty target list instead of routing to the semantic model. Handled `pp-number` digit separators and required `bannedTargets.length > 0`.
By hand: Verified `git diff ecc4a32..1a8de33 -- test/` is empty (0 bytes loosened in tests), verified zero dev-set IDs in `src/`, and confirmed `npm run check` (16/16 unit, 22/22 contract) and `npm run e2e` pass.

---

## Entry 8 · 2026-11-18 — Task `T3.4`: Guardrails (`G1`, `G2`, `G3`, `G5`), Gemini 3.8 Flash client & checker pipeline (`4a5fcf0`, `0a02dac`, `ef79bf9`)
Tool: Antigravity (Gemini)
Asked for: Implement `PA#3` Task `T3.4` test-first on branch `feat/pa3-model-and-limits`: offline fake-model tests in `test/unit/limits.test.js` (`AC1`–`AC4`), guardrails in `src/checker/guardrails.js`, Gemini HTTP client in `src/checker/llm-client.js`, and orchestration pipeline in `src/checker/pipeline.js`.
Kept:
- `test/unit/limits.test.js` committed first (`4a5fcf0`), testing schema validation `G1` (`AC1`), wall-clock timeout `G3` (`AC2`), exact source-line evidence mapping `G2` & deduction stripping `G5` (`AC3`), and comment/PII stripping, hard-rule LLM bypass, `MODEL_OFF=1`, and `x-goog-api-key` header isolation (`AC4`).
- `src/checker/guardrails.js` (`0a02dac`) implementing `parseAndValidateModelResponse` (`G1`), `validateAndMapEvidence` (`G2`), `withModelTimeout` / `isTimeoutError` (`G3`), and `stripModelDeductions` (`G5`).
- `src/checker/llm-client.js` & `src/checker/pipeline.js` (`ef79bf9`) invoking `gemini-3.8-flash` (`$0.75/1M` input, `$3.75/1M` output), passing `MODEL_API_KEY` exclusively via the `x-goog-api-key` request header, and recording structured call logs (`providerRequestId`, `model`, `inputTokens`, `outputTokens`, `latencyMs`, `costUsd`, `sanitizedPrompt`).
Changed:
- During mutation review of `src/checker/guardrails.js`, we noticed the assistant's initial `parseAndValidateModelResponse` constructed `{ verdict, unsureReason, rawEvidence, rationale }` by cherry-picking properties, which meant commenting out `stripModelDeductions` (`G5`) would still pass `AC3` (`'deduction' in validRes[0] === false`) and violate the `PA#4` Criterion 3 mutation-testing rule. We updated `ParsedConstraintEntry` to retain `rawFields` and routed the final result through `stripModelDeductions(entry.rawFields, baseResult)` so deleting `G5` immediately leaks `deduction` and fails `AC3`.
- Added `FetchLike` JSDoc typing in `src/checker/llm-client.js` and `collectOrderedResults` in `src/checker/pipeline.js` to satisfy `tsc --noEmit` (`strict: true`) without modifying a single byte of `test/unit/limits.test.js` after `4a5fcf0`.
Rejected:
- **Rejected passing `MODEL_API_KEY` in the URL query string (`?key=...`):** Standard Gemini REST quickstarts pass `?key=${apiKey}` in the URL, which leaks the secret into HTTP error objects, proxy logs, and stack traces. Enforced `'x-goog-api-key'` request headers exclusively and added an explicit assertion in `AC4` (`assert.equal(seenUrl.includes('key='), false)`).
- **Rejected trusting `fetch` `AbortSignal` alone for `G3` timeout:** A custom or misbehaving transport that ignores `signal` would hang forever if awaited directly; wrapped transport execution in `Promise.race` inside `withModelTimeout()` so the wall-clock timer always rejects after `modelTimeoutMs`.
By hand: Verified `git diff 4a5fcf0..ef79bf9 -- test/` is empty (0 bytes modified in tests after the test commit), ran `npm run check` (20/20 unit, 22/22 contract) and `npm run e2e`, and verified zero dev-set IDs in `src/`.

---

## Entry 9 · 2026-11-21 — Task `T3.5`: Custom Eval Cases, Dataset Checker CLI, `Dockerfile.checker` & First Real Eval (`810578e`, `12c0728`, `e588bb9`)
Tool: Antigravity
Asked for: Implement `PA#3` Task `T3.5` on branch `feat/pa3-checker-cli`: create `eval/custom-cases/` (`>= 6` Accepted solutions covering `trap`, `disguised`, `injection`, `style`) first (`810578e`), then implement `src/cli/check-dataset.js` & `Dockerfile.checker` (`12c0728`) with `MODEL_OFF=1` and `--network none` verification, and run our first live dev-set evaluation saved to `eval/runs/pa3-dev/` (`e588bb9`).
Kept:
- `eval/custom-cases/` committed first (`810578e`) with 6 C++17 solutions (`sort-merge/s01..s03`, `binary-search/s01..s03`), all verified to compile with `g++ -std=c++17 -O2` and pass every `.in`/`.out` test in Docker (`leetkob-sandbox:test`). Live evaluation on `eval/custom-cases` with `gemini-3-flash-preview` scored `0` wrongful deductions, `100.0% (6/6)` recall, and `0.0%` unsure (`PASS`).
- `src/cli/check-dataset.js` & `Dockerfile.checker` (`12c0728`) discovering problems/solutions strictly from `problems/<pid>/` and `solutions/<pid>/*.cpp` (never reading `labels.jsonl`), passing `AC1` (`MODEL_OFF=1` on `leetkob-eval`: `0` wrongful, `40.5%` recall on ban-lists), `AC2` (`eval/custom-cases`), and `AC3` (`docker run --rm --network none -e MODEL_OFF=1 leetkob-checker`).
- `eval/runs/pa3-dev/` (`e588bb9`) recording `predictions.jsonl` (`102` pairs), `call-log.jsonl` (`39` entries: `32` `ok` with real `providerRequestId`s and `0` comment/PII leaks + `7` `http_error`s after Free Tier key exhaustion), and `report.txt`: **`0` wrongful deductions**, **`83.8% (31/37)` recall**, **`6.9% (7/102)` unsure rate**. Measured token/cost over the `32` `ok` calls: `31,349` input tokens (`~980`/call) + `3,871` output tokens (`~121`/call) = **`$0.038028 USD`** (`$0.001188/call` → **`~$0.095 USD`** for an 80-submission lab, well inside `MODEL_MAX_COST_USD_PER_LAB=0.50`).
Changed:
- Initial `gemini-3.8-flash` live probes hit `HTTP 503 UNAVAILABLE` high-demand spikes and `>30s` default deep-thinking latency (`model-timeout` at `10000ms`), while Free Tier keys hit `20 requests/day/project`. Updated `src/checker/llm-client.js` to set `thinkingConfig: { thinkingLevel: 'LOW' }` (reducing per-call latency to `~1.5–2.0s` avg `2010ms`), support comma-separated `MODEL_API_KEY` rotation across projects with an `exhaustedKeys` set on `429 GenerateRequestsPerDay`, and switched our live `pa3-dev` CLI run to `--model gemini-3-flash-preview` as directed.
- Added general Rule 6 in `buildSemanticPrompt` (`Evaluate each constraint independently on its own criteria...`) after an initial partial run produced `1` wrongful deduction (`dynamic-array/s04 C3`) where `std::vector` violated `C1`/`C2` but satisfied `C3` ("A program that allocates nothing passes this constraint"); re-running dropped wrongful deductions to **`0`**.
- Removed a 15s/30s `evaluateItemWithRetry` `setTimeout` loop added briefly in `src/cli/check-dataset.js`, because retrying exhausted `20/day` Free Tier quotas stalled the CLI for ~19 minutes without overwriting output; kept fast key rotation and fail-fast daily-quota handling in `llm-client.js` instead.
Rejected:
- **Rejected setting `thinkingLevel: 'MINIMAL'` for `gemini-3.8-flash`:** Checking the official Gemini API documentation confirmed `gemini-3.8-flash` only supports `low`, `medium`, and `high` (`minimal` returns an error), whereas `LOW` works cleanly across both `gemini-3-flash-preview` and `gemini-3.8-flash`.
- **Rejected restoring `FetchLike` JSDoc above `sleepWithSignal`:** An earlier edit placed the `FetchLike` JSDoc above a helper function, causing `tsc --noEmit` (`TS2322`) to fail in `test/unit/limits.test.js:279`; moved the JSDoc directly onto `callGeminiModel` without loosening any test types.
By hand: Verified `git diff -- leetkob-eval/` is empty, `npm run verify:eval` and `npm run scan` pass with zero secrets in `eval/runs/pa3-dev/call-log.jsonl`, and `npm run check` (`20/20` unit, `22/22` contract) passes after all edits.
