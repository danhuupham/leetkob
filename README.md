# LeeTKOB — Harness, Quality Gate & Endpoint Contract (`PA#2`)

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

**LeeTKOB** helps teaching assistants (TAs) verify, with line-level evidence, that Accepted C++ lab submissions follow the assignment's algorithmic and syntax constraints before marks are published (`FAQ-01`–`FAQ-14`).

This repository contains the **project harness**, **enforced CI quality gate**, **TA review queue & grade publishing slice**, and the **executable API contract** for `POST /api/labs/{labId}/publish` ([`docs/contract/publish.md`](docs/contract/publish.md)). See [`PA2.md`](PA2.md) for direct links to the protected `main` branch, blocked red PRs, green fix commits, deliberate contract break PR, and `pa2` tag CI run.

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
| **Lint** | `npm run lint` | `eslint .` (ESLint 9 flat config) |
| **Format check** | `npm run format:check` | `prettier --check .` (Prettier 3) |
| **Type check** | `npm run typecheck` | `tsc --noEmit` (TypeScript 5 with `checkJs: true`, `strict: true`) |
| **Unit tests** | `npm test` | `node --test --test-reporter=spec "test/unit/**/*.test.js"` |
| **Contract tests** | `npm run contract` | `node --test --test-reporter=spec "test/contract/**/*.test.js"` |
| **Secret scan (tree + history)** | `npm run scan` | `node scripts/scan-secrets.js` (scans working tree & `git log -p --all`) |
| **All synchronous gates** | `npm run check` | Runs `lint` + `format:check` + `typecheck` + `test` + `contract` + `scan` |
| **End-to-end browser gate** | `npm run e2e` | `playwright test` (`e2e/publish.spec.js` in Chromium) |

---

## 3. LLM Provider, Cost per Lab & Spending Cap

In accordance with the LeeTKOB Class Brief (§3 & §5) and `PA#2` Rubric (Criterion 2):

- **Model Provider & Model:** Google Gemini API — `gemini-2.5-flash` (`MODEL_PROVIDER=gemini`, `MODEL_NAME=gemini-2.5-flash`), invoked exclusively from the backend server (`src/`).
- **Estimated Cost per Lab:** A typical lab has ~80 Accepted C++ submissions (`~1,200` input tokens and `~250` output tokens per semantic constraint check after hard rules filter obvious violations). At `gemini-2.5-flash` pricing (`$0.15 / 1M` input tokens, `$0.60 / 1M` output tokens), checking one full lab of 80 submissions costs **~$0.012 USD** (well under 2 cents per lab).
- **Per-Lab Application Cost Cap:** `MODEL_MAX_COST_USD_PER_LAB=0.25` (enforced by `src/config.js`; if a lab's cumulative token usage reaches `$0.25 USD`, remaining semantic checks fall back to verdict `unsure` with reason `cost-cap-exceeded` per `FAQ-09` so a TA reviews them manually).
- **Provider Hard Spending Cap:** The `MODEL_API_KEY` used for LeeTKOB has a **hard monthly spending cap of `$5.00 USD / month`** configured on the Google Cloud Billing / Google AI Studio project, with separate keys per environment (`development`, `CI`, `production`).
- **Zero Model Calls in Automated Tests:** Unit tests (`npm test`), contract tests (`npm run contract`), and e2e tests (`npm run e2e`) **never** call the live Gemini API and require no API key to pass on a fresh clone or in CI.

---

## 4. Assistant Rules, Permissions & Secrets

- **Rules File:** [`AGENTS.md`](AGENTS.md) defines our **Stack**, **Commands**, **Conventions**, **Never** rules, and **Three-Tier Permissions** (`Allowed`, `Ask First`, `Never`).
- **Environment Template:** [`.env.example`](.env.example) documents all configuration variables without secret values. `.env` is ignored by [`.gitignore`](.gitignore).
- **Startup Validation & Sandbox Isolation:** [`src/config.js`](src/config.js) validates all environment variables once at startup (`loadConfig()`) and provides `getSandboxEnv()`, which strips `MODEL_API_KEY`, `SESSION_SECRET`, and all host environment variables before spawning the C++ judge sandbox.
- **Whole-History Secret Scanning:** `npm run scan` ([`scripts/scan-secrets.js`](scripts/scan-secrets.js)) scans both current files and `git log -p --all` in CI (`fetch-depth: 0`).

---

## 5. Repository Structure

| Path | Purpose |
|---|---|
| [`PA2.md`](PA2.md) | Submission index with links to the repo, branch protection, blocked PR, green fix commit, deliberate contract break PR, and `pa2` tag CI run |
| [`AGENTS.md`](AGENTS.md) | Assistant rules file (Stack, Commands, Conventions, Never, and 3-tier permissions) |
| [`.env.example`](.env.example) | Environment variable template (committed with empty secrets) |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Required GitHub Actions workflows (`gates` and `e2e`) |
| [`docs/contract/publish.md`](docs/contract/publish.md) | Complete RFC 9457 API contract for `POST /api/labs/{labId}/publish` |
| [`docs/security/threat-model.md`](docs/security/threat-model.md) | LeeTKOB threat model across roles, sandbox, secrets, supply chain, and prompt injection |
| [`src/app.js`](src/app.js) | HTTP routes for the TA review queue, review decisions, and grade publishing |
| [`src/grades.js`](src/grades.js) | Pure grading logic (`markFor` with `FAQ-11` deduplication, `needsReview`) |
| [`src/config.js`](src/config.js) | Startup config validation and sandbox environment sanitizer (`getSandboxEnv`) |
| [`src/db.js`](src/db.js) | In-memory SQLite schema and seed data (`node:sqlite` `DatabaseSync`) |
| [`src/http.js`](src/http.js) | JSON and RFC 9457 `application/problem+json` response helpers |
| [`test/unit/grades.test.js`](test/unit/grades.test.js) | Unit tests for grading formulas, review queue filtering, and sandbox secret isolation |
| [`test/contract/publish.contract.test.js`](test/contract/publish.contract.test.js) | HTTP contract tests verifying every status, problem slug, ownership rule, refusal invariant, and idempotency rule in `docs/contract/publish.md` |
| [`e2e/publish.spec.js`](e2e/publish.spec.js) | Playwright end-to-end test: TA reviews pending violation and publishes grades |
| [`scripts/scan-secrets.js`](scripts/scan-secrets.js) | Secret scanner over working tree and full git commit history |
| [`AI-LOG.md`](AI-LOG.md) | Detailed log of AI assistant usage, changes, and rejections |
| [`SELF_ASSESSMENT_REPORT.md`](SELF_ASSESSMENT_REPORT.md) | Rubric-by-rubric self-assessment with concrete evidence links |
