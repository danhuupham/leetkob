# PA#3 Implementation Plan — Prototype with the LLM Feature Running

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Milestone Weight & Deadline:** 7% of course mark (100 points) · **Due Wednesday, November 25, 2026, 22:00**  
**Repository:** `https://github.com/danhuupham/leetkob` (Tag: `pa3`)  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

---

## 1. Objective & Desired Behavior

Deliver the first end-to-end production-deployed LeeTKOB pipeline where:
1. **Lab Authoring (`F1`, `F2`):** A TA signs in and creates a lab in their own class (e.g., `sort-merge`) with its problem statement, test cases (`stdin`/`expected_stdout`), and constraints (each carrying a TA-chosen deduction, mixing hard ban-list constraints and semantic constraints). Cross-class TAs receive `404 not-found` (`T1`).
2. **Queued Sandboxed C++ Judging (`F3`, `F4`):** A student submits C++17 source code. The HTTP handler persists the submission as `queued` and enqueues a job without blocking. A separate worker process compiles and executes the code inside a hardened Docker container satisfying all **9 sandbox minimums (`M1`–`M9`)**, guaranteeing **at-least-once execution with exactly-once verdict persistence (`Q1`)** across worker restarts.
3. **Hard Rules First (`F5`, `D1`):** Accepted (`AC`) submissions pass through syntax-aware C++ AST analysis for ban-list constraints (`"Do not use ..."` / `"Do not call ..."` with backticked identifiers/headers). Traps (student's own `sort` in a namespace/struct, banned tokens inside comments/strings, `<algorithm>` included solely for `std::swap`) never trigger false positives. Constraints decided by a hard rule **never** invoke the LLM.
4. **Sanitized Semantic LLM Check & First Guardrails (`F6`, `F7`, `F8`):** Remaining semantic constraints are evaluated on the backend via `gemini-2.5-flash` using comment-stripped and PII-redacted code, validated against a strict JSON schema (`G1`) and hard timeout (`G3`), with any failure falling back to `unsure`. Model output never sets deductions (`G5`). Verdicts and line-mapped evidence land **exclusively** in the TA's review queue; students before Publish see only test execution status (`FAQ-08`), and `POST /api/labs/:labId/publish` refuses while any review is pending (`409 reviews-pending`).
5. **Dataset Checker CLI & First Eval (`F10`):** A standalone CLI command packaged with a `Dockerfile` processes any dataset directory (`statement.md` + `constraints.json` + `.cpp` solutions) into `predictions.jsonl`, supports offline hard-rules-only execution via `MODEL_OFF=1` (`docker run --network none`), preserves the published dev set byte-for-byte, adds `>= 5` custom labelled cases (`trap` + `injection`), and commits one real Gemini dev-set run with request IDs and token/cost telemetry.

---

## 2. Technical Impact Analysis

### 2.1 Files & Modules to Create or Modify

| File / Directory | Action | Responsibility |
|---|---|---|
| `AGENTS.md` | Modify | Add PA#3 *Never* rules (never touch `eval.mjs`/`labels.jsonl`/dev `.cpp`, never hardcode dev-set IDs in prompts/rules, never loosen tests in green commits, never mount host paths or pass secrets to sandbox). |
| `migrations/001_pa2_base.sql`, `migrations/002_pa3_pipeline.sql` | Create | Persistent SQLite WAL schema: `classes`, `labs` (`statement`, `cost_spent_usd`), `lab_tests`, `lab_constraints`, `submissions` (`code`, `judge_status`, `test_verdict`), `judge_jobs` (durable queue), `constraint_verdicts` (`UNIQUE(submission_id, constraint_id)`, `evidence_json`, `source`, `unsure_reason`, `decision`), `model_calls`. |
| `src/db.js` & `scripts/migrate.js` | Modify / Create | Support file-backed SQLite (`DATABASE_URL=/data/leetkob.db`) with `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;` alongside `:memory:` for unit/contract tests. Separate migration CLI from server start. |
| `src/sandbox/runner.js` & `Dockerfile.sandbox` | Create | Hardened Docker execution wrapper (`--network none`, `--user 65534:65534`, `--read-only`, `--tmpfs /tmp:rw,exec,nosuid,size=32m`, `--memory 256m --memory-swap 256m`, `--pids-limit 16`, `--cpus 1`, `--cap-drop ALL`, `--security-opt no-new-privileges`, host wall-clock `docker rm -f` kill, `1 MiB` output stream cap, `getSandboxEnv()`). |
| `src/worker.js` | Create | Standalone queue consumer polling `judge_jobs` atomically, invoking `sandbox/runner.js`, then running `checker/pipeline.js` on `AC` submissions and persisting verdicts idempotently (`ON CONFLICT DO UPDATE`). |
| `src/checker/sanitize.js` | Create | Strips `//` and `/* ... */` comments while preserving exact 1-based original line numbers, and scrubs student IDs/names/emails before LLM prompt construction. |
| `src/checker/hard-rules.js` | Create | Syntax-aware C++17 AST analyzer (`web-tree-sitter` + `tree-sitter-cpp` WASM) parsing ban-list constraints (`/^Do not (use|call)\b/i` + backtick targets), tracking namespaces/`using` declarations, ignoring comments/strings, and returning exact `{ line, text }` evidence. |
| `src/checker/llm-client.js` | Create | Server-side `gemini-2.5-flash` client using native `fetch` + `AbortSignal.timeout(config.modelTimeoutMs)`, recording provider `responseId`/headers, input/output tokens, latency, USD cost, and sanitized prompt to `call-log.jsonl` and `model_calls`. |
| `src/checker/guardrails.js` | Create | Strict JSON schema validator (`G1`: rejects prose/markdown fences, unknown verdicts, missing/duplicate constraints -> `unsure`), timeout mapper (`G3` -> `unsure`), and deduction stripper (`G5`). (Also scaffolds `G2` exact evidence line check early to prevent hallucinations). |
| `src/checker/pipeline.js` | Create | Orchestrates Hard Rules -> (`MODEL_OFF=1` check) -> Semantic LLM Client -> Guardrails, ensuring hard-rule-decided constraints never call the model. |
| `src/cli/check-dataset.js` & `Dockerfile.checker` | Create | CLI entrypoint reading `<dataset>/` (`statement.md`, `constraints.json`, solutions) and writing `predictions.jsonl`; supports `MODEL_OFF=1` with zero network sockets. |
| `src/app.js` & `public/index.html` | Modify | Add endpoints & UI views for sign-in, TA lab creation (`POST /api/classes/:classId/labs`), student code submission (`POST /api/labs/:labId/submissions`), student submission status (`GET /api/submissions/:id` hiding constraint verdicts before Publish per `FAQ-08`), and enriched TA review queue (`GET /api/labs/:labId/queue` showing per-constraint verdict, evidence lines, and TA deduction). |
| `eval/dev/` & `eval/custom-cases/` & `eval/runs/pa3-dev/` | Create | Exact byte-for-byte copy of published `leetkob-eval` dev set + SHA-256 verification script (`scripts/verify-eval-integrity.js`); `>= 5` custom labelled cases (`trap`, `injection`); committed real Gemini run (`predictions.jsonl`, `report.txt`, `call-log.jsonl`). |
| `test/sandbox/attacks.test.js` & `test/fixtures/attacks/*.cpp` | Create | 9 adversarial C++ attack submissions (`M1`–`M9`) executed against the real Docker sandbox in CI. |
| `Dockerfile` & `compose.yaml` | Create | Production multi-container setup (`web` + `worker` sharing `/data` SQLite volume; `worker` uses a filtered Docker socket proxy or isolated runner daemon without exposing secrets/mounts inside student containers) + reverse proxy HTTPS config. |
| `.github/workflows/ci.yml` | Modify | Add `pa3` tag trigger, `verify-eval-integrity` step in `gates`, and a required `sandbox` job running the 9 Docker attack tests + `Dockerfile.checker` `MODEL_OFF=1` smoke check. |
| `PA3.md` & `SELF_ASSESSMENT_REPORT.md` | Create | Deployment URL, 5 test accounts, tag CI run link, checker commands, committed dev-set run link, `<= 5 min` fallback video link, and rubric self-assessment. |

### 2.2 Database & API Impact
- **DB Schema:** Backwards-compatible expansion of `PA#2` schema. `POST /api/labs/:labId/publish` contract (`docs/contract/publish.md`) remains 100% intact (`200`, `400`, `401`, `403`, `404`, `409 deadline-not-passed`, `409 reviews-pending`, `500`), with `pending` now counting unreviewed constraint verdicts (`violation` or `unsure`) across submissions in the lab.
- **External Dependencies:** Minimal addition — `web-tree-sitter` (plus pinned `tree-sitter-cpp.wasm`) for deterministic C++17 AST parsing; native Node 22 `fetch` for Gemini REST API (zero bloated SDK dependencies).

---

## 3. Risks & Mitigations

- 🔴 **High — Syllabus Zero-Score Trap (Rubric Syllabus Rule):** If any model verdict alters a student's mark before TA Publish, or if model output bypasses schema validation or timeout limits, Criteria 4, 5, and 6 **all score 0 (losing 40 points)**.
  - *Mitigation:* Student endpoints (`GET /api/submissions/:id`, `GET /api/labs/:labId`) SQL-select **only** `judge_status` and `test_verdict` when `labs.published_at IS NULL` (verified by contract tests). Wrap every model response in `validateModelOutput()` and `AbortSignal.timeout()` before returning from `llm-client.js`.
- 🔴 **High — Sandbox Escape or Compiler Dead-Code Elimination (`M3`, `M4`, `M8`, `M9`):** Fork-bomb children keeping stdout pipes open after process timeout (`M3`), `-O2` optimizing away an unread `1 GiB` allocation (`M4`), or `#include "/app/.env"` reading host/worker secrets during `g++` compilation (`M9`).
  - *Mitigation:* Compile **inside** the ephemeral `--network none` container via `stdin` pipe; kill via `docker rm -f <containerName>` on wall-clock timeout; write non-constant pattern across allocated pages and print a volatile byte sum in `m4_memory_1gib_readback.cpp`.
- 🔴 **High — Modifying Published Eval Files or Tuning Prompts to Dev-Set Names:** Touching `eval.mjs` (`c836edd8713521bb...`) or `labels.jsonl` (`262cda7b0ef5612e...`), or mentioning `sort-merge` / `s05` in prompts or rules.
  - *Mitigation:* Add `scripts/verify-eval-integrity.js` into `npm run check` verifying exact SHA-256 hashes of `eval.mjs`, `labels.jsonl`, and dev `.cpp` files, plus scanning `src/` for dev-set solution IDs.
- 🟡 **Medium — Hosting Platform Lack of Docker Sandbox Support:** PaaS free tiers (Render/Vercel/Fly shared) restrict nested `docker run --pids-limit --network none` containers and sleep on idle.
  - *Mitigation:* Deploy on an always-on Linux VPS (Oracle Cloud Free Tier / GCP `e2-micro` / Azure Student VM / Hetzner) running Docker Engine + Caddy automatic HTTPS, keeping the deployment live continuously from Nov 25 until PA#4/PA#6 completion.
- 🟡 **Medium — Commit Discipline Penalty (Criterion 7):** Mixing multiple parts in one mega-commit, committing tests after implementation, or rebasing history at the end.
  - *Mitigation:* Follow the strict 8-PR incremental TDD commit sequence in §5 below from day 1, never rewriting timestamps.

---

## 4. Effort Estimate & Team Ownership

**Total Story Points:** **21 SP** (broken down into 6 sub-deliverables of `2–5 SP` each; no single task exceeds `5 SP`).

| Sub-Task | Scope | Points (Fib) | Primary Owner | Backup / Reviewer | Target Date |
|---|---|---|---|---|---|
| **T3.1 — DB Migrations & Durable Job Queue** | Persistent SQLite WAL, `judge_jobs`, worker loop, `Q1` stop/submit/start test | **3 SP** | `21120595` (Vinh) | `20120450` (Đan) | Nov 19 |
| **T3.2 — Hardened C++ Docker Sandbox & 9 Attack Tests** | `Dockerfile.sandbox`, `src/sandbox/runner.js`, `M1`–`M9` `.cpp` attacks, CI `sandbox` job | **5 SP** | `23120256` (Hiệp) | `21120595` (Vinh) | Nov 20 |
| **T3.3 — Syntax-Aware Hard Rules Engine (`tree-sitter-cpp`)** | `src/checker/hard-rules.js`, trap tests (namespace `sort`, comments/strings, `std::swap`), `MODEL_OFF=1` | **5 SP** | `20120450` (Đan) | `23120256` (Hiệp) | Nov 21 |
| **T3.4 — Sanitizer, Gemini Client & First Guardrails (`G1`, `G3`, `G5`)** | Comment/PII stripper, `llm-client.js`, fake-model schema & timeout tests, call log & cost math | **3 SP** | `20120450` (Đan) | `21120595` (Vinh) | Nov 22 |
| **T3.5 — Checker CLI, `Dockerfile.checker` & Custom Cases** | `check-dataset.js`, `>= 5` custom cases (`trap`, `injection`), real dev-set Gemini run + `eval.mjs` report | **2 SP** | `23120256` (Hiệp) | `20120450` (Đan) | Nov 23 |
| **T3.6 — End-to-End Web Flow, VPS Deployment & Hand-In** | Lab creation UI/API, submission UI/API, review queue evidence UI, HTTPS deploy, 5-min video, `PA3.md` | **3 SP** | `21120595` (Vinh) | All 3 members | Nov 24–25 |

---

## 5. Strict Commit-by-Commit TDD Execution Sequence (Criterion 7)

Every feature lands via its own focused PR/commit where **tests land before or in the exact same commit as the implementation**, and **no test is loosened in a green commit**:

1. **Commit 1 (`chore(eval)`):** Import unmodified `leetkob-eval` dev set, add `scripts/verify-eval-integrity.js` (checking SHA-256 `c836edd8713521bb...` and `262cda7b0ef5612e...`), add `>= 5` custom labelled cases in `eval/custom-cases/`, and update `AGENTS.md` *Never* list.
2. **Commit 2 (`feat(sandbox)` — Tests + Code):** Add the 9 C++ attack fixtures (`test/fixtures/attacks/m1..m9.cpp`) and `test/sandbox/attacks.test.js` + `Dockerfile.sandbox` + `src/sandbox/runner.js` + CI `sandbox` job.
3. **Commit 3 (`feat(queue)` — Tests + Code):** Add `test/contract/queue.contract.test.js` (including worker-stopped -> submit -> worker-restarted -> judged **exactly once** `Q1` test) + SQLite WAL migrations + `src/worker.js`.
4. **Commit 4 (`test(hard-rules)` -> `feat(hard-rules)`):** Commit comprehensive unit tests for ban-list parsing and C++ traps (student's `my_ns::sort`, comments, string literals, `#include <algorithm>` for `std::swap`, unqualified `sort` with `using namespace std;`) FIRST, followed immediately by `src/checker/hard-rules.js` turning them green with zero test edits.
5. **Commit 5 (`test(limits)` -> `feat(limits)`):** Commit offline fake-model unit tests for schema validation (`G1` invalid JSON, markdown code fences, missing constraint -> `unsure`), timeout (`G3` -> `unsure`), and ignored model deduction (`G5`) FIRST, followed by `src/checker/guardrails.js` and `src/checker/sanitize.js`.
6. **Commit 6 (`feat(model-checker)`):** Add `src/checker/llm-client.js`, `src/checker/pipeline.js`, `src/cli/check-dataset.js`, and `Dockerfile.checker` (verified with `docker run --network none -e MODEL_OFF=1` producing 0 wrongful deductions on dev set).
7. **Commit 7 (`feat(web-flow)`):** Add TA lab creation, student C++ submission, student pre-publish status view (citing `FAQ-08`), TA review queue with line evidence & deductions, cross-class `404` contract tests, and Playwright E2E flow.
8. **Commit 8 (`docs(pa3)`):** Execute and commit one real `gemini-2.5-flash` dev-set run in `eval/runs/pa3-dev/` (`predictions.jsonl`, `eval-report.txt`, `call-log.jsonl` with provider request IDs), update `README.md` cost arithmetic for 80 submissions, update `AI-LOG.md` with real *Changed / Rejected* entries, add `PA3.md` and `SELF_ASSESSMENT_REPORT.md`, tag `pa3`.

---

## 6. Pre-Submission Verification Checklist

- [ ] `sha256sum` of `eval.mjs` starts with `c836edd8713521bb` and `labels.jsonl` starts with `262cda7b0ef5612e`.
- [ ] `docker run --rm --network none -e MODEL_OFF=1 ...` on dev set exits cleanly, `eval.mjs` exits `0` or `1` (never `2`), with **0 wrongful deductions** and all ban-list constraints decided.
- [ ] `call-log.jsonl` proves hard-rule constraints did not call Gemini, prompts contain zero comments and zero student IDs/names, and every Gemini call has a real provider request ID, token count, latency, and USD cost.
- [ ] All 9 sandbox attack tests run and pass in GitHub Actions CI on tag `pa3`.
- [ ] Public HTTPS deployment answers with the 5 accounts in `PA3.md` (`admin`, `ta_a` class 1, `ta_b` class 2, `stu1` & `stu2` class 1), spending cap is active (`$0.25/lab`, `$5/month`), and `<= 5 min` fallback recording is linked.
- [ ] Zip named `20120450-21120595-23120256_<total>.zip` includes `.git` and `SELF_ASSESSMENT_REPORT.md`, submitted via `@student.hcmus.edu.vn`.
