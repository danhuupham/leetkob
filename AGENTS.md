# LeeTKOB — Agent Instructions (`AGENTS.md`)

This repository uses the same rules for all coding agents (Claude Code, Antigravity, Cursor, GitHub Copilot). See [`CLAUDE.md`](./CLAUDE.md) for the authoritative specification; the four core sections and three permission tiers are mirrored below.

## 1. Stack

- **Runtime & Backend:** Node.js `>=22.13` (ESM, native `node:http`, native `node:sqlite` `DatabaseSync`), zero runtime dependencies.
- **Quality Gate Tooling:** ESLint 9, Prettier 3, TypeScript 5 (`tsc --noEmit` with `checkJs: true`), Node test runner (`node:test`), Playwright (`@playwright/test`).
- **LLM Constraint Checker (`PA#3`+):** Google Gemini 2.5 Flash on the server only (`MODEL_MAX_COST_USD_PER_LAB=0.25`, provider hard cap `$5.00/month`).
- **Judge Sandbox (`PA#3`+):** Hardened Docker (`g++ -std=c++17 -O2`, `--network none`, `--user 65534:65534`, `--read-only`, `--cap-drop ALL`).

## 2. Commands

```bash
npm ci                  # Install exact lockfile dependencies
npm start               # Start server on http://localhost:3007
npm run lint            # ESLint check (eslint .)
npm run format:check    # Prettier check (prettier --check .)
npm run typecheck       # TypeScript/JSDoc check (tsc --noEmit)
npm test                # Unit tests (test/unit/**/*.test.js)
npm run contract        # Contract tests (test/contract/**/*.test.js)
npm run scan            # Secret scanner across working tree and git log -p --all
npm run check           # Full synchronous gate: lint + format:check + typecheck + test + contract + scan
npm run e2e             # Playwright browser journey (e2e/publish.spec.js)
```

## 3. Conventions

- Named exports only; no default exports in `src/`.
- Validate configuration once at startup in `src/config.js`; never read `process.env` inside routes.
- Return RFC 9457 Problem Details (`application/problem+json`) on all `4xx`/`5xx` errors; never leak SQL, table names, or stack traces in `detail`.
- Check **both** role and class/submission ownership (`class_staff` / `enrollments`) **before** executing any database write (`INSERT` / `UPDATE`) *(traced to `src/app.js` bug fixed in PR #1 & `AI-LOG.md` Entry 3)*.

## 4. Never

- **Never expose secrets (`MODEL_API_KEY`, `SESSION_SECRET`, `.env`) or host mounts inside the C++ judge sandbox.**
- **Never call a live LLM API in unit, contract, or e2e tests.**
- **Never edit `test/**`, `e2e/**`, `docs/contract/**`, `eval/**`, or `labels.jsonl` to make a failing check pass.**
- **Never swallow failures with `|| true`, `continue-on-error: true`, `.skip`, or `try/catch` around assertions** *(traced to `.github/workflows/ci.yml` and `test/contract/publish.contract.test.js` incidents fixed in PR #1 & `AI-LOG.md` Entries 1–2)*.
- **Never commit `.env` or live secrets, and never push directly to `main`.**

## 5. Permissions (Three Tiers)

- **Allowed:** Read tracked files; edit `src/` and `public/`; run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run contract`, `npm run scan`, `npm run check`, `npm run e2e`, `git status`, `git diff`, `git log`.
- **Ask First:** Modify `docs/contract/**`, `test/**`, `e2e/**`, `.github/workflows/**`, `src/db.js`, `.env.example`, or `package.json`; open/merge PRs; run live model evaluations.
- **Never:** Read/commit `.env` or live keys; pass secrets or network to the C++ sandbox; push straight to `main`; weaken tests, contracts, or eval labels to pass CI.
