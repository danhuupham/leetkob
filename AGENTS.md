# LeeTKOB — Project Rules (`AGENTS.md`)

## Stack
- Node.js `>=22.13` (ESM, `node:http`, `node:sqlite`), ESLint 9, Prettier 3, TypeScript 5 (`tsc --noEmit`), Playwright.
- LLM (`PA#3`+): Gemini 2.5 Flash on server only (`$0.25/lab` cap, `$5/month` provider cap). Sandbox: Docker (`g++ -std=c++17 -O2`, `--network none`, `--user 65534:65534`, `--read-only`).

## Commands
- `npm ci` · `npm start` · `npm run lint` · `npm run format:check` · `npm run typecheck` · `npm test` · `npm run contract` · `npm run scan` · `npm run check` · `npm run e2e`

## Conventions
- Named exports only; validate env once at startup in `src/config.js` and never read `process.env` in `src/server.js` or `src/app.js`.
- Return RFC 9457 `application/problem+json` on all `4xx`/`5xx`; never leak SQL, table names, or stack traces in `detail`.
- Check role + class ownership (`class_staff` / `enrollments`) **before** any SQL write (`403` for enrolled students, `404` for other classes; traced to [`f8f54cb`](https://github.com/danhuupham/leetkob/commit/f8f54cb) → [`3e1f53c`](https://github.com/danhuupham/leetkob/commit/3e1f53c), `AI-LOG.md` Entry 2).
- Root `DatabaseSync` on `server.__db` so V8 GC never finalizes prepared statements in `e2e` (traced to CI Run [`42586953474`](https://github.com/danhuupham/leetkob/actions/runs/42586953474) → [`3e1f53c`](https://github.com/danhuupham/leetkob/commit/3e1f53c), `AI-LOG.md` Entry 3).

## Never
- Never pass secrets (`MODEL_API_KEY`, `SESSION_SECRET`, `.env`) or host mounts (`-v`, `docker.sock`) into the C++ judge sandbox.
- Never call a live LLM API in unit, contract, or e2e tests.
- Never edit `test/`, `e2e/`, `docs/contract/`, `eval/`, or `labels.jsonl` to make a failing check pass.
- Never silence checks with `|| true`, `continue-on-error: true`, `.skip`, or `try/catch` around assertions (traced to [`a3e8fd6`](https://github.com/danhuupham/leetkob/commit/a3e8fd6) → [`2e82177`](https://github.com/danhuupham/leetkob/commit/2e82177) → [`f8f54cb`](https://github.com/danhuupham/leetkob/commit/f8f54cb), `AI-LOG.md` Entries 1–2).
- Never commit `.env` or live keys, or push directly to `main`.

## Permissions
- **Allowed:** Read tracked files; edit `src/` and `public/`; run `npm run check`, `npm run e2e`, `git status`, `git diff`, `git log`.
- **Ask First:** Edit `docs/contract/`, `test/`, `e2e/`, `.github/workflows/`, `src/db.js`, `.env.example`, or `package.json`; open/merge PRs; run live LLM evals.
- **Never:** Read/commit `.env` or live keys; expose secrets/network to the C++ sandbox; push straight to `main`; weaken tests, contracts, or eval labels.
