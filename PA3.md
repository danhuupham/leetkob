# PA#3 — Prototype with the LLM Feature Running (`LeeTKOB`)

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

> **Pending Screen Recording:** Live deployment is verified at [`https://leetkob-hcmus26.malaysiawest.cloudapp.azure.com`](https://leetkob-hcmus26.malaysiawest.cloudapp.azure.com). Populate `<TODO_RECORDING_URL>` below after recording the `<= 5 min` Criterion 1 walk-through, then merge to `main` and push tag `pa3`.

---

## 1. Required Submission Links & Deliverables

| Deliverable | Link / Evidence |
|---|---|
| **1. Public Repository** | [`https://github.com/danhuupham/leetkob`](https://github.com/danhuupham/leetkob) |
| **2. Live Deployment URL** | [`https://leetkob-hcmus26.malaysiawest.cloudapp.azure.com`](https://leetkob-hcmus26.malaysiawest.cloudapp.azure.com) *(Azure `malaysiawest`, `Standard_B2als_v2`, HTTPS via Caddy + separate `leetkob-worker` systemd host process)* |
| **3. Screen Recording (`<= 5 min`, Criterion 1 flow)** | `<TODO_RECORDING_URL>` |
| **4. Tag `pa3` & CI Run (with `gates`, `e2e`, `sandbox`)** | **Tag `pa3`:** [`https://github.com/danhuupham/leetkob/tree/pa3`](https://github.com/danhuupham/leetkob/tree/pa3) *(to be pushed after merging `PA3.md`)* · **Tag CI Runs:** [`https://github.com/danhuupham/leetkob/actions?query=branch%3Apa3`](https://github.com/danhuupham/leetkob/actions?query=branch%3Apa3) · **Latest `main` CI Run:** [`45121970141`](https://github.com/danhuupham/leetkob/actions/runs/45121970141) (`gates`, `e2e`, `sandbox` all green) · **Sandbox PR #15 CI Run:** [`45101429261`](https://github.com/danhuupham/leetkob/actions/runs/45101429261) |
| **5. Checker Command, Docker Build & `MODEL_OFF=1`** | [`src/cli/check-dataset.js`](src/cli/check-dataset.js) · [`Dockerfile.checker`](Dockerfile.checker) · [`README.md` §3](README.md#L104-L125) · [Section 3 below](#3-checker-command-docker-build-line--model_off1-switch) |
| **6. Committed Dev-Set Real-Model Run** | [`eval/runs/pa3-dev/`](eval/runs/pa3-dev/report.txt) (`predictions.jsonl`, `report.txt`, `call-log.jsonl`) · [Section 4 below](#4-committed-dev-set-real-model-evaluation-evalrunspa3-dev) |
| **7. Team Custom Eval Cases (`6` solutions, `12` pairs)** | [`eval/custom-cases/`](eval/custom-cases/labels.jsonl) (`problems/`, `solutions/`, `labels.jsonl` covering `trap`, `disguised`, `injection`, `style`) |
| **8. Self-Assessment & AI Log** | [`SELF_ASSESSMENT_REPORT.md`](SELF_ASSESSMENT_REPORT.md) · [`AI-LOG.md`](AI-LOG.md) |

---

## 2. Test Accounts & End-to-End Flow on the Deployment

### 2.1 Seeded Test Accounts (`src/db.js`)

The seed script ([`scripts/seed.js`](scripts/seed.js) / [`src/db.js`](src/db.js)) provisions synthetic non-PII accounts across two classes. All accounts carry no real user data, and backend + provider spending caps (`MODEL_MAX_COST_USD_PER_LAB=0.50` in [`src/config.js`](src/config.js) and a `$5.00 USD / month` hard cap on Google AI Studio / Cloud Billing) prevent abuse on the public deployment.

| User | Role | Class Scope | Bearer Token | Notes |
|---|---|---|---|---|
| `admin` | `admin` | Class 1 & Class 2 | `tok-admin` | Full administrative access across classes |
| `ta_a` | `ta` | Class 1 (`CSC13114-01`) | `tok-ta-a` | Primary TA for creating Class 1 `sort-merge` lab & reviewing its queue |
| `ta_b` | `ta` | Class 2 (`CSC13114-02`) | `tok-ta-b` | Secondary TA; receives `404 not-found` on Class 1 labs/queues |
| `stu1` | `student` | Class 1 (`CSC13114-01`) | `tok-stu1` | Enrolled student 1 in `ta_a`'s class |
| `stu2` | `student` | Class 1 (`CSC13114-01`) | `tok-stu2` | Enrolled student 2 in `ta_a`'s class |
| `stu3` | `student` | Class 2 (`CSC13114-02`) | `tok-stu3` | Enrolled student in `ta_b`'s class (`404 not-found` on Class 1 labs) |

### 2.2 End-to-End Walk-Through (Rubric Criterion 1)

1. **TA creates a lab (`POST /api/classes/1/labs`):** Sign in via UI or `Authorization: Bearer tok-ta-a`, create a lab in Class `1` with the `sort-merge` statement (`leetkob-eval/problems/sort-merge/statement.md`), test cases (`01`..`07`), constraints `C1` (`deduction: 3`) and `C2` (`deduction: 4`), and a future UTC deadline (`YYYY-MM-DD HH:mm:ss`). `GET /api/labs/:labId` exposes the statement, constraints, deductions, and `FAQ-06` `reviewNotice` while hiding `lab_tests`.
2. **Students submit C++ solutions (`POST /api/labs/:labId/submissions`):** Sign in as `stu1` (`tok-stu1`) / `stu2` (`tok-stu2`) and submit compliant, violation, and prompt-injection `sort-merge` solutions. Each request enqueues a durable row in `judge_jobs` (`status = 'queued'`) and returns immediately.
3. **Separate worker judges & checks (`scripts/worker.js`):** The host worker executes `g++ -std=c++17 -O2` and hidden tests inside the hardened `--network none` sandbox container ([`src/sandbox/runner.js`](src/sandbox/runner.js)). Only `AC` submissions proceed to syntax-aware hard rules ([`src/checker/hard-rules.js`](src/checker/hard-rules.js)) and then Gemini semantic judging ([`src/checker/llm-client.js`](src/checker/llm-client.js)) with comments and PII stripped ([`src/checker/sanitize.js`](src/checker/sanitize.js)).
4. **Student pre-publish visibility (`GET /api/submissions/:id`, `FAQ-02`, `FAQ-08`):** Polling shows `judgeStatus` (`queued` -> `running` -> `done`) and `testVerdict` / per-test verdicts (`AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`), with **zero** `constraintVerdicts`, `deductions`, or `mark` exposed before TA Publish.
5. **TA review queue & class isolation (`GET /api/labs/:labId/queue`, `FAQ-02`):** `ta_a` inspects counted submissions, flagged verdicts, exact evidence lines (`View code`), and TA deductions (`Mark Pass` / `Confirm Violation` via `POST /api/verdicts/:verdictId/review`). Note per `FAQ-02`: the review queue shows each student's latest counted submission, so 3 solutions can either be submitted across separate Class 1 students (`stu1`, `stu2`) or inspected after each submission (`GET /api/submissions/:id` returns staff details for every submission ID). Signing in as `ta_b` (`tok-ta-b`) returns `404 not-found`.

**Live Azure Deployment Verification (`https://leetkob-hcmus26.malaysiawest.cloudapp.azure.com`):**
- Verified Criterion 1 end-to-end on the live HTTPS deployment: created `sort-merge` lab (7 tests + `C1`/`C2`), confirmed cross-class TA `ta_b` receives `404` on lab and queue, judged `s01.cpp` (`AC`, `C1=pass [hard_rule]`, `C2=pass [model]`), `s04.cpp` (`AC`, `C1=violation [hard_rule]` deduction `3`, `C2=violation [model]` deduction `4` with evidence), and injection `s09.cpp` (`AC`, `C1=pass [hard_rule]`, `C2=violation [model]`, lab `costSpentUsd=0.0025165`) while hiding all verdicts/marks from students before Publish (`FAQ-08`).
- Verified Criterion 2 live on the same host: stopping `leetkob-worker` left a newly submitted `s01` job in `queued`, restarting `leetkob-worker` judged it once (`AC`, `2` verdicts), and live attack submissions failed inside the sandbox as required (`m1_network.cpp` -> `RE`, `m4_memory_1gib_readback.cpp` -> `MLE`, `m9_no_secrets.cpp` -> `RE`, `m9_include_env.cpp` -> `CE`). The VM SQLite database was then reset cleanly to seeded demo accounts (`labs` `1`–`3`).

---

## 3. Checker Command, Docker Build Line & `MODEL_OFF=1` Switch

All commands run purely from `statement.md` and `constraints.json` inside `<data>/problems/<pid>/` and `<data>/solutions/<pid>/*.cpp` (`src/cli/check-dataset.js` never opens `labels.jsonl`):

```bash
# Build the dataset checker image
docker build -f Dockerfile.checker -t leetkob-checker .

# Run containerized checker offline with no network and MODEL_OFF=1
docker run --rm --network none -e MODEL_OFF=1 -v "$PWD/leetkob-eval:/data:ro" leetkob-checker --data /data --out -

# Equivalent local offline verification against leetkob-eval and eval/custom-cases
MODEL_OFF=1 node src/cli/check-dataset.js --data leetkob-eval --out /tmp/off.jsonl
node leetkob-eval/eval.mjs --data leetkob-eval --predictions /tmp/off.jsonl

MODEL_OFF=1 node src/cli/check-dataset.js --data eval/custom-cases --out /tmp/custom-off.jsonl
node leetkob-eval/eval.mjs --data eval/custom-cases --predictions /tmp/custom-off.jsonl
```

**Observed `MODEL_OFF=1` Results (`eval.mjs` exit code `1` — valid format, `0` wrongful deductions, 100% of ban-list rules decided, `0` model calls / `0` network sockets):**

- **`leetkob-eval` (`102` pairs):** `0` wrongful deductions, `40.5% (15/37)` recall (every ban-list violation caught), `46.1% (47/102)` unsure rate (semantic constraints marked `unsure`), `0` model call log entries.
- **`eval/custom-cases` (`12` pairs across `6` solutions):** `0` wrongful deductions, `33.3% (2/6)` recall (all ban-list violations caught), `50.0% (6/12)` unsure rate, `0` model call log entries.

---

## 4. Committed Dev-Set Real-Model Evaluation (`eval/runs/pa3-dev/`)

Re-scoring the committed prediction file with `node leetkob-eval/eval.mjs --data leetkob-eval --predictions eval/runs/pa3-dev/predictions.jsonl`:

- **Exit status:** `0` (`PASS`)
- **Dataset:** `47` solutions, `102` `(solution, constraint)` pairs (`65` pass, `37` violation)
- **Wrongful deductions:** `0` (`ok`, target `= 0`)
- **Recall:** `97.3% (36/37)` (`ok`, target `>= 90.0%`; only miss: `dynamic-array/s05 C2 [disguised]`)
- **Unsure rate:** `0.0% (0/102)` (`ok`, target `<= 20.0%`)

| Tag | Pairs | Pass | Violation | Caught | Wrongful | Unsure |
|---|---:|---:|---:|---|---:|---:|
| `obvious` | 15 | 0 | 15 | `15/15` | 0 | 0 |
| `disguised` | 22 | 0 | 22 | `21/22` | 0 | 0 |
| `trap` | 14 | 14 | 0 | `-` | 0 | 0 |
| `injection` | 5 | 0 | 5 | `5/5` | 0 | 0 |
| `style` | 11 | 11 | 0 | `-` | 0 | 0 |
| `(none)` | 40 | 40 | 0 | `-` | 0 | 0 |

**Committed Artifacts & Cost Arithmetic:**
- [`eval/runs/pa3-dev/predictions.jsonl`](eval/runs/pa3-dev/predictions.jsonl) — `102` JSONL predictions.
- [`eval/runs/pa3-dev/report.txt`](eval/runs/pa3-dev/report.txt) — full `eval.mjs` output report.
- [`eval/runs/pa3-dev/call-log.jsonl`](eval/runs/pa3-dev/call-log.jsonl) — `39` live Gemini API calls (`39/39 status: "ok"`), each recording the Google `providerRequestId`, `model: "gemini-3-flash-preview"`, comment-stripped and PII-scrubbed `sanitizedPrompt`, `inputTokens`, `outputTokens`, `latencyMs`, and `costUsd`. Ban-list constraints were decided entirely by `src/checker/hard-rules.js` with `0` LLM calls.
- **Cost per 80-submission lab:**
  - **Measured (`gemini-3-flash-preview` at `$0.50 / 1M` input, `$3.00 / 1M` output including thinking tokens):** `38,522` input + `4,851` output tokens across `39` calls = `$0.033814 USD` (`$0.000867 / call`) -> **`~$0.069 USD`** per 80-submission lab (or `~$0.097 USD / lab` at `gemini-3.8-flash` rates; pre-run budget estimate `~$0.147 USD / lab`).
- **Dataset SHA-256 verification (`npm run verify:eval`):** `eval.mjs` (`c836edd8713521bb...`) and `labels.jsonl` (`262cda7b0ef5612e...`) are byte-for-byte intact; zero dev-set problem or solution IDs exist in `src/` or `frontend/`.

---

## 5. Sandbox Minimums (`M1`–`M9`) & Durable Queue (`Q1`) Evidence

1. **Docker Sandbox Minimums ([`Dockerfile.sandbox`](Dockerfile.sandbox), [`src/sandbox/runner.js`](src/sandbox/runner.js), [`test/sandbox/attacks.test.js`](test/sandbox/attacks.test.js) — `14/14` passing in CI `sandbox` job):**
   - `M1` No network (`--network none`): [`test/fixtures/attacks/m1_network.cpp`](test/fixtures/attacks/m1_network.cpp)
   - `M2` CPU time limit (`ulimit -S -t` / `-H -t`): [`test/fixtures/attacks/m2_cpu.cpp`](test/fixtures/attacks/m2_cpu.cpp)
   - `M3` Wall-clock container kill (`docker rm -f leetkob-judge-<uuid>`): [`test/fixtures/attacks/m3_wall_fork_pipe.cpp`](test/fixtures/attacks/m3_wall_fork_pipe.cpp)
   - `M4` Memory + swap limit with volatile 4 KiB page readback: [`test/fixtures/attacks/m4_memory_1gib_readback.cpp`](test/fixtures/attacks/m4_memory_1gib_readback.cpp)
   - `M5` Process limit (`--pids-limit 16`): [`test/fixtures/attacks/m5_pids_fork_bomb.cpp`](test/fixtures/attacks/m5_pids_fork_bomb.cpp)
   - `M6` Output size limit (`1 MiB` container + Node byte cap): [`test/fixtures/attacks/m6_output_flood.cpp`](test/fixtures/attacks/m6_output_flood.cpp)
   - `M7` Non-root user (`--user 65534:65534`, `--read-only`): [`test/fixtures/attacks/m7_non_root.cpp`](test/fixtures/attacks/m7_non_root.cpp)
   - `M8` No host mounts & no Docker socket: [`test/fixtures/attacks/m8_no_mounts_no_sock.cpp`](test/fixtures/attacks/m8_no_mounts_no_sock.cpp)
   - `M9` No secrets (`getSandboxEnv()`, inside-container `g++` compilation): [`test/fixtures/attacks/m9_no_secrets.cpp`](test/fixtures/attacks/m9_no_secrets.cpp) & [`test/fixtures/attacks/m9_include_env.cpp`](test/fixtures/attacks/m9_include_env.cpp)
2. **Durable Queue & Separate Worker (`Q1` — [`migrations/002_pa3_pipeline.sql`](migrations/002_pa3_pipeline.sql), [`src/worker.js`](src/worker.js), [`scripts/worker.js`](scripts/worker.js)):**
   - Verified offline by `AC1`–`AC6` in [`test/contract/queue.contract.test.js`](test/contract/queue.contract.test.js): queued while worker is stopped then judged on start, stale lease crash reclaim with unique `(submission_id, constraint_code)` upsert (judged once), non-`AC` skips checker (`FAQ-04`), bounded `maxAttempts = 3`, lease heartbeat renewal, and fenced state writes.

---

## 6. Per-Part TDD Commits & Pull Requests (`PA#3` Criterion 7)

All feature branches were merged into `main` with `--merge` (preserving separate test-first commits):

| Task | PR | Test Commit(s) | Implementation / Follow-up Commits | Merge Commit |
|---|---|---|---|---|
| **T3.1** Queue & Migration | [PR #18](https://github.com/danhuupham/leetkob/pull/18) | [`111f7c1`](https://github.com/danhuupham/leetkob/commit/111f7c1) | [`fa68bc0`](https://github.com/danhuupham/leetkob/commit/fa68bc0), [`743db8f`](https://github.com/danhuupham/leetkob/commit/743db8f), [`ff4c270`](https://github.com/danhuupham/leetkob/commit/ff4c270) | [`57bd1b2`](https://github.com/danhuupham/leetkob/commit/57bd1b2) |
| **T3.2** Docker Sandbox (`M1`–`M9`) | [PR #15](https://github.com/danhuupham/leetkob/pull/15) | [`15b23b6`](https://github.com/danhuupham/leetkob/commit/15b23b6) | [`57249b3`](https://github.com/danhuupham/leetkob/commit/57249b3), [`9c32b46`](https://github.com/danhuupham/leetkob/commit/9c32b46), [`4bf10ac`](https://github.com/danhuupham/leetkob/commit/4bf10ac) | [`bc21119`](https://github.com/danhuupham/leetkob/commit/bc21119) |
| **T3.3** Hard Rules Engine (`D1`) | [PR #12](https://github.com/danhuupham/leetkob/pull/12) | [`ecc4a32`](https://github.com/danhuupham/leetkob/commit/ecc4a32) | [`1a8de33`](https://github.com/danhuupham/leetkob/commit/1a8de33) | [`a0d43b4`](https://github.com/danhuupham/leetkob/commit/a0d43b4) |
| **T3.4** Guardrails & Gemini Client | [PR #13](https://github.com/danhuupham/leetkob/pull/13) | [`4a5fcf0`](https://github.com/danhuupham/leetkob/commit/4a5fcf0) | [`0a02dac`](https://github.com/danhuupham/leetkob/commit/0a02dac), [`ef79bf9`](https://github.com/danhuupham/leetkob/commit/ef79bf9), [`7e450b4`](https://github.com/danhuupham/leetkob/commit/7e450b4) | [`f499c4d`](https://github.com/danhuupham/leetkob/commit/f499c4d) |
| **T3.5** Checker CLI & First Eval | [PR #16](https://github.com/danhuupham/leetkob/pull/16) | [`810578e`](https://github.com/danhuupham/leetkob/commit/810578e) | [`12c0728`](https://github.com/danhuupham/leetkob/commit/12c0728), [`e588bb9`](https://github.com/danhuupham/leetkob/commit/e588bb9), [`157c568`](https://github.com/danhuupham/leetkob/commit/157c568), [`460c054`](https://github.com/danhuupham/leetkob/commit/460c054) | [`d01f445`](https://github.com/danhuupham/leetkob/commit/d01f445) |
| **T3.6** Web Flow & Compose | [PR #17](https://github.com/danhuupham/leetkob/pull/17) | [`b6c289f`](https://github.com/danhuupham/leetkob/commit/b6c289f)..[`fe9d16a`](https://github.com/danhuupham/leetkob/commit/fe9d16a) | [`a803b3d`](https://github.com/danhuupham/leetkob/commit/a803b3d), [`07acedc`](https://github.com/danhuupham/leetkob/commit/07acedc) | [`5644f84`](https://github.com/danhuupham/leetkob/commit/5644f84) |
| **UI** Vite + React Workspace & API Helpers | [PR #19](https://github.com/danhuupham/leetkob/pull/19) · [PR #20](https://github.com/danhuupham/leetkob/pull/20) | [`19bc624`](https://github.com/danhuupham/leetkob/commit/19bc624) | [`dd63ffa`](https://github.com/danhuupham/leetkob/commit/dd63ffa), [`16090df`](https://github.com/danhuupham/leetkob/commit/16090df), [`da7e2bb`](https://github.com/danhuupham/leetkob/commit/da7e2bb) | [`cc15f0c`](https://github.com/danhuupham/leetkob/commit/cc15f0c) · [`52d918b`](https://github.com/danhuupham/leetkob/commit/52d918b) |
