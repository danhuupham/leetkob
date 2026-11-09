# Copilot Instructions — LeeTKOB

Follow [`CLAUDE.md`](../CLAUDE.md) and [`AGENTS.md`](../AGENTS.md) for all tasks in this repository:

- **Stack:** Node.js `>=22.13` (ESM, `node:http`, `node:sqlite`), ESLint 9, Prettier 3, TypeScript 5 (`tsc --noEmit` with `checkJs: true`), `node:test`, Playwright.
- **Commands:** `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run contract`, `npm run scan`, `npm run check`, `npm run e2e`.
- **Conventions:** Named exports only; RFC 9457 `application/problem+json` on all `4xx`/`5xx`; check role + `class_staff` / `enrollments` ownership **before** any SQL mutation; validate env vars once in `src/config.js`.
- **Never:** Never pass secrets (`MODEL_API_KEY`, `.env`) or host mounts into the C++ sandbox; never call a real LLM in unit/contract/e2e tests; never edit `test/`, `docs/contract/`, or `labels.jsonl` to make a check pass; never use `|| true`, `continue-on-error: true`, or `try/catch` around test assertions.
