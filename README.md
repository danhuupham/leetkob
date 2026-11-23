# LeeTKOB — C++ Lab Constraint Review, Sandbox Judge & Grade Publishing

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

**LeeTKOB** helps teaching assistants (TAs) judge C++ lab submissions in an isolated sandbox and verify, with line-level evidence, that Accepted submissions satisfy the assignment's algorithmic and syntax constraints before marks are published (`FAQ-01`–`FAQ-14`).

### Milestone Index

| Milestone | Tag | Submission Index & Evidence |
|---|---|---|
| **`PA#2`** — Harness, Quality Gate & Endpoint Contract | [`pa2`](https://github.com/danhuupham/leetkob/tree/pa2) | [`PA2.md`](PA2.md) · [`docs/contract/publish.md`](docs/contract/publish.md) · [`docs/assessments/PA2-SELF_ASSESSMENT_REPORT.md`](docs/assessments/PA2-SELF_ASSESSMENT_REPORT.md) |
| **`PA#3`** — Prototype with the LLM Feature Running | `pa3` *(upcoming)* | [`docs/plans/PA3-Plan.md`](docs/plans/PA3-Plan.md) (`PA3.md` at submission) |
| **`PA#4`** — Eval Gate, Guardrails, Human Gate & Red-Team | `pa4` *(upcoming)* | [`docs/plans/PA4-Plan.md`](docs/plans/PA4-Plan.md) (`PA4.md` at submission) |
| **`PA#5`** — Final Build, Observability & 80-User Load Test | `pa5` *(upcoming)* | [`docs/plans/PA5-Plan.md`](docs/plans/PA5-Plan.md) (`PA5.md` at submission) |
| **`PA#6`** — Final Demo & Individual Oral | `pa5` | [`docs/plans/PA6-Plan.md`](docs/plans/PA6-Plan.md) (`OWNERS.md` at submission) |

---

## 1. Quick Start (Fresh Clone to Green in < 2 Minutes)

**Prerequisites:** Node.js `>= 22.13.0` (built-in `node:sqlite` and `node:test`) and `npm`.

```bash
git clone https://github.com/danhuupham/leetkob.git
cd leetkob
cp .env.example .env
npm ci
npm run check
```

To also run the Playwright browser end-to-end test (`e2e/publish.spec.js`), install the Chromium browser binary once and run `npm run e2e`:

```bash
npx playwright install chromium        # On Ubuntu/Debian CI: npx playwright install --with-deps chromium
npm run e2e
```

To start the local server (`http://localhost:3007`):

```bash
npm start
```

---

## 2. One Command for Every Check (Local & CI)

Every check runs with one documented command locally and in GitHub Actions (`.github/workflows/ci.yml`), using the **exact same commands**:

| Check | Command | Tool / Scope |
|---|---|---|
| **Install (strict lockfile)** | `npm ci` | Installs exact versions from `package-lock.json` |
| **Lint** | `npm run lint` | `eslint .` (ESLint 10 flat config: `no-undef`, `no-unused-vars`, `eqeqeq`, `prefer-const`, `no-var`) |
| **Auto-format** | `npm run format` | `prettier --write .` (Prettier 3; excludes `leetkob-eval/` and `*.md`) |
| **Format check** | `npm run format:check` | `prettier --check .` (Prettier 3) |
| **Type check** | `npm run typecheck` | `tsc --noEmit` (TypeScript 7 with `checkJs: true`, `strict: true`) |
| **Unit tests** | `npm test` | `node --test --test-reporter=spec "test/unit/**/*.test.js"` (25 unit tests) |
| **Contract tests** | `npm run contract` | `node --test --test-reporter=spec "test/contract/**/*.test.js"` (22 contract tests) |
| **Secret scan (tree + history)** | `npm run scan` | `node scripts/scan-secrets.js` (scans working tree & `git log -p --all`) |
| **Eval dataset SHA-256 check** | `npm run verify:eval` | `node scripts/verify-eval.js` (verifies byte-for-byte SHA-256 of `leetkob-eval/`) |
| **All synchronous gates** | `npm run check` | Runs `lint` + `format:check` + `typecheck` + `test` + `contract` + `scan` + `verify:eval` |
| **End-to-end browser gate** | `npm run e2e` | `playwright test` (`e2e/publish.spec.js` in Chromium; requires `npx playwright install chromium`) |

---

## 3. LLM Provider, Cost per Lab & Spending Cap

In accordance with the LeeTKOB Class Brief (§3 & §5) and `PA#2`–`PA#5` Rubrics:

- **Model Provider & Model:** Google Gemini API — default `gemini-3.8-flash` (`MODEL_PROVIDER=gemini`, `MODEL_NAME=gemini-3.8-flash`; `$0.75 / 1M` input, `$3.75 / 1M` output including thinking tokens), with `--model` / `MODEL_NAME` override supporting `gemini-3-flash-preview` (`$0.50 / 1M` input, `$3.00 / 1M` output including thinking tokens), invoked exclusively from the backend server (`src/`).
- **Estimated & Measured Cost per Lab (80 submissions):**
  - **Budget estimate (`gemini-3.8-flash`):** ~80 Accepted C++ submissions (`~1,200` input + `~250` output/thinking tokens per semantic check) → `$0.072 + $0.075 =` **~$0.147 USD/lab**.
  - **Measured `PA#3` dev-set run (`eval/runs/pa3-dev/`, `gemini-3-flash-preview`, `39/39` `ok` calls):** `38,522` input tokens (`~988`/call) + `4,851` output+thinking tokens (`~124`/call, including `thoughtsTokenCount`) = **`$0.033814 USD`** (`$0.000867/call`) → **`~$0.069 USD`** per 80-submission lab (`~$0.097 USD/lab` at `gemini-3.8-flash` rates), well within the `$0.50/lab` cap.
- **Offline Dataset Checker CLI & Container (`MODEL_OFF=1`):**
  ```bash
  # Local offline run (0 network sockets, hard rules only)
  MODEL_OFF=1 node src/cli/check-dataset.js --data leetkob-eval --out /tmp/off.jsonl
  node leetkob-eval/eval.mjs --data leetkob-eval --predictions /tmp/off.jsonl

  # Containerized checker (--network none)
  docker build -f Dockerfile.checker -t leetkob-checker .
  docker run --rm --network none -e MODEL_OFF=1 -v "$PWD/leetkob-eval:/data:ro" leetkob-checker --data /data --out -
  ```
- **Per-Lab Application Cost Cap:** `MODEL_MAX_COST_USD_PER_LAB=0.50` (validated at startup by `src/config.js`; if a lab's cumulative token usage reaches `$0.50 USD`, remaining semantic checks fall back to verdict `unsure` with reason `cost-cap-exceeded` per `FAQ-09` so a TA reviews them manually).
- **Provider Hard Spending Cap:** The `MODEL_API_KEY` used for LeeTKOB has a **hard monthly spending cap of `$5.00 USD / month`** configured on the Google Cloud Billing / Google AI Studio project, with separate keys per environment (`development`, `CI`, `production`).
- **Zero Model Calls in Automated Tests:** Unit tests (`npm test`), contract tests (`npm run contract`), and e2e tests (`npm run e2e`) **never** call the live Gemini API and require no API key to pass on a fresh clone or in CI.

---

## 4. Team Workflow, Assistant Rules & Secrets

- **Team Workflow & Git Rules:** [`CONTRIBUTING.md`](CONTRIBUTING.md) defines per-member Git authorship (`<StudentID>@student.hcmus.edu.vn` for `PA#6`), one-part-per-PR TDD commit discipline, protected-path review rules, real-time `AI-LOG.md` logging, and production freeze protocols.
- **Assistant Rules File:** [`AGENTS.md`](AGENTS.md) defines our **Stack**, **Commands**, **Conventions & Team Workflow**, **Never** rules, and **Three-Tier Permissions** (`Allowed`, `Ask First`, `Never`).
- **Environment Template:** [`.env.example`](.env.example) documents all 18 configuration variables without secret values. `.env`, `marking.env`, and `ACCESS.md` are ignored by [`.gitignore`](.gitignore).
- **Startup Validation & Sandbox Isolation:** [`src/config.js`](src/config.js) validates all environment variables once at startup (`loadConfig()`, imported by [`src/server.js`](src/server.js) and [`src/app.js`](src/app.js)) and provides `getSandboxEnv()`, which strips `MODEL_API_KEY`, `SESSION_SECRET`, and all host environment variables before spawning the C++ judge sandbox.
- **Whole-History Secret Scanning:** `npm run scan` ([`scripts/scan-secrets.js`](scripts/scan-secrets.js)) scans both current files and `git log -p --all` in CI (`fetch-depth: 0`).

---

## 5. Repository Structure

| Path | Purpose |
|---|---|
| [`PA2.md`](PA2.md) | `PA#2` submission index (protected `main`, blocked PR, green fix commit, deliberate contract break PR, `pa2` tag CI run) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Team collaboration rules: Git authorship, 1-part-per-PR TDD workflow, `CODEOWNERS`, oral-readiness gate, and deployment freeze |
| [`AGENTS.md`](AGENTS.md) | Concise assistant rules file (Stack, Commands, Conventions, Never, and 3-tier permissions) |
| [`.env.example`](.env.example) | Environment variable template (18 variables committed with empty secrets) |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Required GitHub Actions workflows (`gates` and `e2e`) across PRs, `main`, and `pa*` tags |
| [`.github/CODEOWNERS`](.github/CODEOWNERS) | Code-owner review protection for `docs/contract/`, `test/`, `e2e/`, `leetkob-eval/`, `eval/`, `.github/`, and `AGENTS.md` |
| [`leetkob-eval/`](leetkob-eval/README.md) | Published read-only C++ dev set (`47` solutions, `102` pairs), `labels.jsonl`, and `eval.mjs` (locked with `-text` in `.gitattributes`) |
| [`docs/plans/`](docs/plans/MASTER-PLAN.md) | Agent-executable team plans (`MASTER-PLAN.md`, `SHARED-CONTRACTS.md`, `PA3-Plan.md`–`PA6-Plan.md`) |
| [`docs/reference/`](docs/reference/FAQ.md) | LeeTKOB Class Brief (`BRIEF.md`), Milestones (`MILESTONES.md`), Product Owners' FAQ (`FAQ.md`), and `PA#3`–`PA#6` rubrics (`rubrics/`) |
| [`docs/contract/publish.md`](docs/contract/publish.md) | Complete RFC 9457 API contract for `POST /api/labs/{labId}/publish` |
| [`docs/security/threat-model.md`](docs/security/threat-model.md) | LeeTKOB threat model across roles, sandbox, secrets, supply chain, and prompt injection |
| [`migrations/`](migrations/001_init.sql) | Sequential SQLite schema migrations applied via `npm run migrate` |
| [`src/app.js`](src/app.js) | Thin HTTP composition root wiring modular routes, static assets, and `500 internal` safety net |
| [`src/auth.js`](src/auth.js) | Shared Bearer token authentication, `class_staff` / `enrollments` ownership checks, and ID parsing |
| [`src/routes/`](src/routes/publish.js) | Domain-scoped route handlers (`health.js`, `queue.js`, `publish.js`) for conflict-free team development |
| [`src/grades.js`](src/grades.js) | Pure grading logic (`markFor` with `FAQ-11` deduplication, `needsReview`) |
| [`src/config.js`](src/config.js) | Startup config validation (`loadConfig`) and sandbox environment sanitizer (`getSandboxEnv`) |
| [`src/db.js`](src/db.js) | SQLite connection factory supporting persistent `WAL` databases and `:memory:` test fixtures (`migrate`, `seedDemoData`) |
| [`src/http.js`](src/http.js) | JSON / RFC 9457 `application/problem+json` helpers, route matcher (`matchRoute`), and safe static server (`serveStatic`) |
| [`src/server.js`](src/server.js) | HTTP server entrypoint using `config.databaseUrl` and graceful `SIGINT`/`SIGTERM` shutdown |
| [`public/`](public/index.html) | Browser UI (`index.html`, `styles.css`, `client.js`) |
| [`scripts/`](scripts/scan-secrets.js) | Standalone CLI utilities (`migrate.js`, `seed.js`, `scan-secrets.js`, `verify-eval.js`) |
| [`test/unit/grades.test.js`](test/unit/grades.test.js) | 8 unit tests for grading formulas, review queue filtering, and sandbox secret isolation |
| [`test/contract/publish.contract.test.js`](test/contract/publish.contract.test.js) | 22 HTTP contract tests verifying every status, problem slug, ownership rule, deadline check, refusal invariant, and idempotency rule in `docs/contract/publish.md` |
| [`e2e/publish.spec.js`](e2e/publish.spec.js) | Playwright end-to-end test: TA reviews pending violation and publishes grades |
| [`scripts/scan-secrets.js`](scripts/scan-secrets.js) | Secret scanner over working tree and full git commit history |
| [`AI-LOG.md`](AI-LOG.md) | Detailed log of AI assistant usage, changes, and rejections |
| [`SELF_ASSESSMENT_REPORT.md`](SELF_ASSESSMENT_REPORT.md) | Rubric-by-rubric self-assessment with concrete evidence links |
