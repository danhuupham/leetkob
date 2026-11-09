# LeeTKOB — Agent Rules (`AGENTS.md`)

This file defines the project harness for **LeeTKOB** (C++ lab submission constraint review, TA review queue, and grade publishing gate). Every coding assistant must follow these rules.

## 1. Stack

- **Runtime & Backend:** Node.js `>=22.13` (native ES modules, native `node:http`, native `node:sqlite` `DatabaseSync`), zero runtime npm dependencies.
- **Quality Gate Tooling:** ESLint 9 (`eslint.config.js`), Prettier 3 (`.prettierrc.json`), TypeScript 5 (`tsc --noEmit` with `checkJs: true` in `tsconfig.json`), Node native test runner (`node --test`), Playwright (`@playwright/test`).
- **LLM Constraint Checker (`PA#3`+):** Google Gemini 2.5 Flash called exclusively from the server with a hard provider spending cap of `$5.00/month` and per-lab cap `MODEL_MAX_COST_USD_PER_LAB=0.25`.
- **Judge Sandbox (`PA#3`+):** Hardened Docker container (`g++ -std=c++17 -O2`, `--network none`, `--user 65534:65534`, `--read-only`, `--cap-drop ALL`, `--pids-limit 16`, `--memory 256m`).
- Do not add any package to `package.json` without asking first.

## 2. Commands

Run these exact commands locally and in CI (`.github/workflows/ci.yml`):

```bash
npm ci                  # Install exact lockfile dependencies
npm start               # Start LeeTKOB server on http://localhost:3007
npm run lint            # ESLint static check (eslint .)
npm run format:check    # Prettier formatting check (prettier --check .)
npm run typecheck       # TypeScript/JSDoc type check (tsc --noEmit)
npm test                # Unit tests (test/unit/**/*.test.js)
npm run contract        # Contract tests for docs/contract/publish.md
npm run scan            # Secret scan over working tree and full git log -p --all
npm run check           # Full synchronous gate: lint + format:check + typecheck + test + contract + scan
npm run e2e             # Playwright browser journey (e2e/publish.spec.js)
```

## 3. Conventions

- Use named exports only; no default exports in `src/`.
- Read and validate environment variables once at startup in `src/config.js`; never read `process.env` directly inside route handlers.
- Every `4xx` and `5xx` response must be RFC 9457 Problem Details (`Content-Type: application/problem+json`) with `type` (`https://leetkob.example/problems/<slug>`), `title`, `status`, and a safe `detail` sentence (never leak SQL queries, table names, stack traces, or file paths).
- Enforce **both** role (`admin`, `ta`, `student`) **and** ownership (`class_staff` for TAs, `enrollments` / `student_id` for students) on every endpoint. A TA or student of another class gets `404 not-found` (indistinguishable from a non-existent resource); an enrolled student of the lab's class calling a staff endpoint gets `403 forbidden`.
- **Incident-Traced Rule #1 (SQL Mutation Order):** Execute state-mutating SQL (`INSERT` / `UPDATE`) **only after** authentication, role, class-ownership, and pending-review checks succeed. A refused `4xx` call must leave `published_at` unchanged in SQLite *(traced to `src/app.js` bug exposed in commit [`f8f54cb`](https://github.com/danhuupham/leetkob/commit/f8f54cb) / CI run [`42587382478`](https://github.com/danhuupham/leetkob/actions/runs/42587382478) and fixed in [`3e1f53c`](https://github.com/danhuupham/leetkob/commit/3e1f53c), `AI-LOG.md` Entry 3, where `q.publish.run(lab.id)` ran before `isStaff(me, lab.class_id)` and published the lab on a `403`/`404` refusal)*.
- **Incident-Traced Rule #2 (`node:sqlite` Handle Lifetime):** Always retain the `DatabaseSync` instance on the HTTP server (`server.__db = db`) rather than passing an unrooted `open()` temporary into `createApp(open())` *(traced to CI run [`42586953474`](https://github.com/danhuupham/leetkob/actions/runs/42586953474) on commit [`2e82177`](https://github.com/danhuupham/leetkob/commit/2e82177) and fixed in [`3e1f53c`](https://github.com/danhuupham/leetkob/commit/3e1f53c), `AI-LOG.md` Entry 4, where V8 garbage-collected the `DatabaseSync` object during Playwright e2e startup and threw `ERR_INVALID_STATE: statement has been finalized`)*.

## 4. Never (LeeTKOB Hard Boundaries)

- **Never pass any secret (`MODEL_API_KEY`, `SESSION_SECRET`, `.env`) or host mount (`-v`, `/var/run/docker.sock`) into the C++ judge sandbox.** Untrusted student C++ code can call `getenv("MODEL_API_KEY")` or `#include "/app/.env"`; the sandbox must use `getSandboxEnv()` with `--network none`.
- **Never make a real model / LLM API call in unit, contract, or e2e tests.** All automated tests in `test/` and `e2e/` must use deterministic offline data/stubs so CI never spends money or leaks keys.
- **Never edit a test (`test/**`, `e2e/**`), a contract (`docs/contract/**`), the eval dataset (`eval/**`), or `labels.jsonl` to make a failing check pass.** When a check goes red, fix `src/` only.
- **Incident-Traced Rule #3 (No Silent Gate Bypass):** **Never silence CI steps or test assertions with `|| true`, `continue-on-error: true`, `.skip`, or `try/catch` blocks.** *(Traced to starter defects in [`a3e8fd6`](https://github.com/danhuupham/leetkob/commit/a3e8fd6) exposed in commits [`2e82177`](https://github.com/danhuupham/leetkob/commit/2e82177) & [`f8f54cb`](https://github.com/danhuupham/leetkob/commit/f8f54cb), `AI-LOG.md` Entries 1–2, where `.github/workflows/ci.yml` hid `src/http.js` lint errors behind `continue-on-error: true` and `npm test || true` on Node 20, and `test/contract/publish.contract.test.js` wrapped the `409 reviews-pending` assertion in a `try/catch` that logged `'skipping pending check'` and passed while `src/app.js` published labs with unreviewed violations.)*
- **Never commit `.env` or live API keys, and never push directly to `main`.** If any key enters git history, rotate it immediately at the provider and record the rotation in `AI-LOG.md`.

## 5. Assistant Permissions (Three Tiers)

| Tier | Scope | Actions |
|---|---|---|
| **Tier 1 — Allowed** *(run without asking)* | Read & local verification | Read any tracked file; edit implementation code in `src/` and `public/`; run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run contract`, `npm run scan`, `npm run check`, `npm run e2e`, `git status`, `git diff`, `git log`. |
| **Tier 2 — Ask First** *(human approval required)* | Contracts, tests, deps & git | Edit `docs/contract/**`, `test/**`, `e2e/**`, `.github/workflows/**`, `src/db.js`, or `.env.example`; add/remove npm dependencies in `package.json`; create branches, open/merge PRs, or run the CLI eval runner against a live model API key. |
| **Tier 3 — Never** *(strictly forbidden)* | Secrets, sandbox & gate integrity | Read, log, or commit `.env` or real API keys; pass secrets, network access, root privileges, or host mounts into the C++ sandbox; push directly to `main` or bypass branch protection; weaken/delete tests, contracts, or `labels.jsonl` to turn a red check green. |
