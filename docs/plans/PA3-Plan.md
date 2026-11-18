# PA#3 Agent-Executable Plan — Prototype with the LLM Feature Running

**Milestone Weight & Deadline:** 7% of course mark (100 points) · **Due Wednesday, November 25, 2026, 22:00**  
**Mandatory Shared Spec:** Read [`SHARED-CONTRACTS.md`](./SHARED-CONTRACTS.md) BEFORE writing any code.  
**Rubric Reference:** [`PA3-rubric.md`](../reference/rubrics/PA3-rubric.md) · [`FAQ.md`](../reference/FAQ.md)

> **CRITICAL SYLLABUS RULE (`PA#3` Rubric p.1 — 40-Point Zero Trap):**  
> If a model verdict changes a student's mark or reaches the student as a deduction with no TA `Publish` in between, OR if model output is used without schema validation (`G1`) and timeout (`G3`), **Criteria 4, 5, and 6 ALL score 0**.

---

## Global Rules for Every Task in `PA#3` (Weak-Model Checklist)

1. **Set Your Own Git Author First:** Verify `git config user.email` is `<YourStudentID>@student.hcmus.edu.vn`.
2. **One Task = One Branch = One PR (`--merge`):** Never mix two tasks in one commit. Never squash a `test(...)` commit and `feat(...)` commit together when merging (`gh pr merge --merge`).
3. **Tests Land First (or Same Commit):** Write the `AC1..ACn` tests first, watch them fail, then implement `src/` without loosening any test assertion.
4. **Never Touch Read-Only Files:** `git diff main -- leetkob-eval/ docs/contract/publish.md test/contract/publish.contract.test.js e2e/publish.spec.js` MUST stay empty unless explicitly noted.

---

## Task `T3.1` — SQLite Pipeline Migration & Durable Worker Queue (`Q1`)
- **Owner:** `21120595` (Nguyễn Thành Vinh) · **Branch:** `feat/pa3-queue` · **Size:** `3 SP`
- **Allowed Files:**
  - Create `migrations/002_pa3_pipeline.sql` (copy verbatim from [`SHARED-CONTRACTS.md`](./SHARED-CONTRACTS.md) §1.1)
  - Create `src/worker.js`
  - Create `test/contract/queue.contract.test.js`
- **Forbidden:** Do NOT call live Docker or live Gemini inside `queue.contract.test.js` (inject `sandboxRunner` and `constraintChecker` functions into `createWorker({ db, sandboxRunner, constraintChecker })`).
- **Exact Implementation Spec (`src/worker.js`):**
  1. Export `claimNextJob(db)`: atomically claim the oldest job where `status = 'queued'` OR `(status = 'running' AND locked_at <= datetime('now', '-60 seconds'))`:
     ```sql
     UPDATE judge_jobs
        SET status = 'running', locked_at = datetime('now'),
            started_at = COALESCE(started_at, datetime('now')), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM judge_jobs
         WHERE status = 'queued'
            OR (status = 'running' AND locked_at <= datetime('now', '-60 seconds'))
         ORDER BY id ASC LIMIT 1
      )
      RETURNING id, submission_id, attempts, trace_id;
     ```
  2. Export `processNextJob({ db, sandboxRunner, constraintChecker })`:
     - Claim job; if none, return `false`.
     - Mark `submissions.judge_status = 'running'`.
     - Run `sandboxRunner(...)` against `lab_tests` ordered by `ordinal ASC`.
     - If `testVerdict === 'AC'` AND the submission has `lab_constraints`, call `constraintChecker(...)` and store verdicts inside **one SQLite transaction** using `INSERT INTO constraint_verdicts (...) VALUES (...) ON CONFLICT(submission_id, constraint_code) DO UPDATE SET ...` (`UNIQUE(submission_id, constraint_code)` guarantees **exactly one set of verdicts** even if the worker crashed and re-ran the job!).
     - If `testVerdict !== 'AC'`, store zero `constraint_verdicts` (`FAQ-04`).
     - Update `submissions` (`judge_status = 'done'`, `test_verdict`, `test_results_json`) and `judge_jobs` (`status = 'done'`, `finished_at = datetime('now')`).
- **Runnable Test-First Acceptance Criteria (`test/contract/queue.contract.test.js`):**
  - `AC1`: Enqueuing a submission while worker is stopped leaves `judge_status = 'queued'` and `0` verdicts; starting the worker processes it to `judge_status = 'done'` (`Q1`).
  - `AC2`: If a worker crashes mid-job (`status = 'running'`, stale `locked_at`) and restarts, re-processing stores **exactly one** row per `(submission_id, constraint_code)` in `constraint_verdicts` (`Q1` "judged exactly once").
  - `AC3`: A `WA` or `CE` submission ends with `judge_status = 'done'` and **never** calls `constraintChecker` (`FAQ-04`).
- **Copy-Paste Prompt for AI Assistant:**
  ```text
  Read AGENTS.md, CONTRIBUTING.md, and docs/plans/SHARED-CONTRACTS.md (§1.1 and §2).
  Implement Task T3.1 from docs/plans/PA3-Plan.md on branch feat/pa3-queue:
  1. Commit 1 (`test(queue)`): create migrations/002_pa3_pipeline.sql verbatim from SHARED-CONTRACTS.md §1.1 and write test/contract/queue.contract.test.js covering AC1, AC2, and AC3 using injected fake sandboxRunner and constraintChecker (no Docker, no network).
  2. Commit 2 (`feat(queue)`): implement src/worker.js (`claimNextJob`, `processNextJob`, `startWorkerLoop`) using named exports only so AC1-AC3 and `npm run check` pass without modifying any test.
  ```

---

## Task `T3.2` — Hardened Docker C++ Sandbox & 9 Attack Submissions (`M1`–`M9`)
- **Owner:** `23120256` (Trần Đại Hiệp) · **Branch:** `feat/pa3-sandbox` · **Size:** `5 SP`
- **Allowed Files:**
  - Create `Dockerfile.sandbox`
  - Create `src/sandbox/runner.js`
  - Create `test/fixtures/attacks/m1_network.cpp` .. `m9_secrets.cpp` (9 files)
  - Create `test/sandbox/attacks.test.js`
  - Modify `.github/workflows/ci.yml` (add `sandbox` job building `Dockerfile.sandbox` and running `node --test "test/sandbox/**/*.test.js"`) & `package.json` (`"test:sandbox"`)
- **Forbidden:** Never pass `-v`, `/var/run/docker.sock`, `--privileged`, `--env-file`, or `-e MODEL_API_KEY` to `docker run`.
- **Exact Implementation Spec:**
  1. **`Dockerfile.sandbox`:** Base `FROM gcc:13.3-bookworm`, create non-root check, `USER 65534:65534`, `WORKDIR /tmp`.
  2. **`src/sandbox/runner.js` (`runInSandbox` per `SHARED-CONTRACTS.md` §2.1):**
     - Pack `{ code, tests, cpuLimitSec }` as JSON piped to `docker run` via `stdin` (zero host bind mounts! `M8`).
     - Exact Docker flags:
       ```text
       docker run -i --rm --name leetkob-judge-<uuid>
         --network none
         --user 65534:65534
         --read-only
         --tmpfs /tmp:rw,exec,nosuid,nodev,size=32m
         --memory <memoryLimitMb>m --memory-swap <memoryLimitMb>m
         --pids-limit 16
         --cpus 1
         --cap-drop ALL
         --security-opt no-new-privileges
         <sandboxConfig.image>
         sh -c '...'
       ```
     - Spawn with `env: getSandboxEnv()` from `src/config.js` (`M9`).
     - Inside container `/tmp`: write `main.cpp`, compile with `timeout -s KILL 10s g++ -std=c++17 -O2 /tmp/main.cpp -o /tmp/main` (`M9`: compiling happens inside sandbox so `#include "/app/.env"` fails with `No such file`!).
     - Run each test with `ulimit -t <cpuLimitSec> && timeout -s KILL <wallLimitSec>s /tmp/main < /tmp/in.txt` (`M2`), capping collected stdout/stderr bytes in Node at `sandboxConfig.outputLimitBytes` (`1048576` bytes -> kill & return `'RE'`, `M6`).
     - Host-side wall-clock timer (`wallTimeLimitSec * 1000 + 1500` ms): on timeout, execute `docker rm -f leetkob-judge-<uuid>` so **the whole container and any forked child processes holding stdout pipes die immediately** (`M3`)!
     - Compare output token-by-token (`actual.trim().split(/\s+/)` vs `expected.trim().split(/\s+/)`, `leetkob-eval/README.md`).
  3. **Nine Attack Fixtures (`test/fixtures/attacks/`):**
     - `m1_network.cpp`: `socket(AF_INET, SOCK_STREAM, 0)` + `connect("1.1.1.1", 80)` -> fails (`errno != 0`), never connects.
     - `m2_cpu.cpp`: tight CPU busy-loop `volatile unsigned long long x=0; while(1) x++;` -> killed as `TLE`.
     - `m3_wall_fork_pipe.cpp`: forks child that sleeps `30s` holding stdout open while parent exits -> killed within wall limit (`< 6s`), container gone from `docker ps`.
     - `m4_memory_1gib_readback.cpp`: allocates `1024ULL * 1024 * 1024` bytes, writes `(i & 0xFF)` every `4096` bytes via `volatile unsigned char*`, sums all written page bytes and prints checksum -> killed by OOM (`MLE` or `RE`), never `AC`!
     - `m5_pids_fork_bomb.cpp`: `while(1) fork();` -> `fork()` returns `-1` (`EAGAIN`) at `pids-limit 16` and container is cleaned up.
     - `m6_output_flood.cpp`: writes `10 MiB` to `std::cout` -> stopped at `1 MiB` output cap (`RE`).
     - `m7_non_root.cpp`: checks `getuid()` / `geteuid()` -> equals `65534` (never `0`), writing `/etc/pwn` fails (`EROFS`).
     - `m8_no_mounts_no_sock.cpp`: checks `fopen("/var/run/docker.sock", "r")` and `fopen("/app/src/server.js", "r")` -> both `NULL`.
     - `m9_no_secrets.cpp`: checks `getenv("MODEL_API_KEY")` (`NULL`) AND a companion `m9_include_env.cpp` with `#include "/app/.env"` -> fails with `CE` without leaking any key.
- **Copy-Paste Prompt for AI Assistant:**
  ```text
  Read AGENTS.md, CONTRIBUTING.md, and docs/plans/SHARED-CONTRACTS.md (§2.1 and §4 Rules 5-6).
  Implement Task T3.2 from docs/plans/PA3-Plan.md on branch feat/pa3-sandbox:
  1. Commit 1 (`test(sandbox)`): create the 9 C++ attack programs in test/fixtures/attacks/ (making sure m4_memory_1gib_readback.cpp touches every 4KB page via volatile pointer and reads/prints a checksum) and test/sandbox/attacks.test.js verifying all 9 sandbox minimums M1-M9.
  2. Commit 2 (`feat(sandbox)`): create Dockerfile.sandbox, implement src/sandbox/runner.js (`runInSandbox`) with compilation inside the container and host-side `docker rm -f <containerName>` wall-clock kill, and add the `sandbox` CI job in .github/workflows/ci.yml.
  ```

---

## Task `T3.3` — Syntax-Aware Hard Rules Engine (`D1`)
- **Owner:** `20120450` (Phạm Hữu Đan) · **Branch:** `feat/pa3-hard-rules` · **Size:** `5 SP`
- **Allowed Files:**
  - Add `web-tree-sitter` (+ `tree-sitter-cpp` WASM asset) in `package.json` (or deterministic C++17 lexer + scope/AST resolver if WASM is bundled)
  - Create `src/checker/sanitize.js` (per `SHARED-CONTRACTS.md` §2.2)
  - Create `src/checker/hard-rules.js` (per `SHARED-CONTRACTS.md` §2.3)
  - Create `test/unit/hard-rules.test.js`
- **Forbidden:** NEVER mention any dev-set problem ID (`sort-merge`, `binary-search`, `s01`, `s05`, etc.) in `src/checker/`. Rules MUST work purely from any `constraint.text`!
- **Exact Implementation Spec (`src/checker/hard-rules.js`):**
  1. **Ban-List Detection (`parseBanListConstraint`):**
     - Matches `/^\s*Do not (?:use|call)\b/i.test(text)`. If false -> return `{ isBanList: false, bannedTargets: [] }`.
     - Extract every `` `([^`]+)` `` token from `text` (ignoring composite hyphenated prose notes by taking each backticked token: e.g., `` `do`-`while` `` yields `'do'` and `'while'`).
  2. **AST / Token Resolution Rules (`evaluateHardRule`):**
     - Parse C++17 source with `tree-sitter-cpp` (comments & string/char/raw-string literals are automatically separate AST nodes and **ignored**!).
     - Categorize each banned target `T`:
       - **Control-flow keywords (`for`, `while`, `do`, `goto`):** match AST `for_statement`, `for_range_loop` (for `for`), `while_statement` (for `while`), `do_statement` (for `do`), `goto_statement` (for `goto`).
       - **Headers (`<...>`):** match `preproc_include` whose path equals `T`. *(Note: if `T` is `std::sort`, `#include <algorithm>` alone for `std::swap` is **NOT** a violation!)*
       - **Member methods (`rbegin`, `rend`, `crbegin`, `crend`):** match member `field_expression` (`obj.rbegin()`, `ptr->rbegin()`) OR `std::rbegin(...)` / `rbegin(...)` under `using namespace std;`, UNLESS called on a user-defined struct/class that defines its own `rbegin` method in the file!
       - **Qualified identifiers (`std::sort`, `std::ranges::sort`, `std::vector`, `std::__gcd`, `boost::integer::gcd`, etc.) & C globals (`qsort`, `bsearch`, `__gcd`):**
         - Collect in-file `using namespace ...;`, `using ns::name;`, `namespace alias = ...;`, `#define ALIAS TARGET` macros, and `using Alias = ...` / function-pointer aliases (`auto fn = std::sort;`).
         - Collect user-defined functions, structs/classes, namespaces, and local variables declared in the submission.
         - Flag a line (`1-based`) as a violation iff:
           1. Explicit qualified usage matches `T` (e.g., `std::sort`, `::std::sort`, or resolved namespace alias `rg::sort`), OR
           2. Unqualified usage matches the leaf name of `T` (e.g., `sort(...)`, `vector<int>`) **AND** the enclosing scope has `using namespace <prefix>;` or `using <T>;` **AND** no user-defined symbol with that leaf name is declared in the student's enclosing namespace/class/function scope, OR
           3. A `#define` macro or `auto`/`typedef`/`using` alias binds a student identifier to `T` (record **both** the alias definition line and every expansion/call line in `evidence` so `eval.mjs` `evidenceHits` always matches!).
     - Populate each evidence item as `{ line: lineNum, text: originalLines[lineNum - 1] }`, sorted by `line ASC` and deduplicated by `line`.
- **Runnable Test-First Acceptance Criteria (`test/unit/hard-rules.test.js`):**
  - `AC1 (Comment & String Trap)`: `// std::sort(a, a+n);` and `const char* s = "std::sort";` return `pass`.
  - `AC2 (User Function / Namespace Trap)`: `namespace my { void sort(int* a, int n) {} }` called as `my::sort(a, n)` or own `void sort(vector<int>& a)` without calling `std::sort` returns `pass`.
  - `AC3 (Header Trap)`: `#include <algorithm>` used only for `std::swap(a[i], a[j])` under `"Do not call ... \`std::sort\`"` returns `pass`.
  - `AC4 (Using-Namespace & Disguised Alias Violation)`: `using namespace std; sort(a, a+n);` AND `#define S std::sort` + `S(a, a+n);` both return `violation` with exact 1-based line numbers and original line text.
  - `AC5 (Loop Keyword & Container Rules)`: Range-based `for (int x : a)` triggers `"Do not use loop statements: \`for\`..."`, while variable `int enforce = 1;` does not.
  - `AC6 (Zero Wrongful Deductions on Dev Set with MODEL_OFF=1)`: Running `evaluateHardRule` across all ban-list constraints of `leetkob-eval` yields **0 wrongful deductions**.
- **Copy-Paste Prompt for AI Assistant:**
  ```text
  Read AGENTS.md, CONTRIBUTING.md, and docs/plans/SHARED-CONTRACTS.md (§2.2, §2.3, §4 Rules 3-4).
  Implement Task T3.3 from docs/plans/PA3-Plan.md on branch feat/pa3-hard-rules:
  1. Commit 1 (`test(hard-rules)`): write test/unit/hard-rules.test.js covering AC1 through AC6 (including comment/string traps, user-defined sort trap, <algorithm> std::swap trap, using-namespace, macro/alias disguise, and loop keywords).
  2. Commit 2 (`feat(hard-rules)`): implement src/checker/sanitize.js (preserving exact 1:1 line count) and src/checker/hard-rules.js using web-tree-sitter C++ AST parsing without referencing any dev-set problem names. Ensure `npm run check` passes.
  ```

---

## Task `T3.4` — First Guardrails (`G1`, `G3`, `G5`) & Gemini 3.8 Flash Semantic Client
- **Owner:** `20120450` (Phạm Hữu Đan) · **Branch:** `feat/pa3-model-and-limits` · **Size:** `3 SP`
- **Allowed Files:**
  - Create `src/checker/guardrails.js`
  - Create `src/checker/llm-client.js`
  - Create `src/checker/pipeline.js`
  - Create `test/unit/limits.test.js`
- **Exact Implementation Spec:**
  1. **`src/checker/guardrails.js`:**
     - `G1 Schema`: Parse `rawText` with `JSON.parse` directly (reject markdown ` ```json ` fences or leading prose -> return `unsure` with `unsureReason: 'schema-invalid'`). Expected top-level shape:
       `{ "results": [ { "constraint": "C2", "verdict": "pass" | "violation" | "unsure", "evidence": [ { "line": 12, "text": "..." } ], "rationale": "..." } ] }`.
       If any requested constraint is missing, duplicated, or has an unknown `verdict` -> downgrade that constraint (or batch) to `unsure` (`'schema-invalid'`).
     - `G2 Evidence Pre-Check`: Verify `1 <= e.line <= originalLines.length`, `strippedLines[e.line - 1].trim().length > 0`, and normalized code match; rewrite `e.text = originalLines[e.line - 1]`. If a `violation` has `0` valid evidence lines -> downgrade to `unsure` (`'evidence-mismatch'`).
     - `G3 Timeout`: Catch `TimeoutError` / `AbortError` from `AbortSignal.timeout(config.modelTimeoutMs)` -> return `unsure` (`'model-timeout'`).
     - `G5 No Model Deduction`: Delete/ignore any `deduction`, `points`, or `mark` property in model output.
  2. **`src/checker/llm-client.js` & `src/checker/pipeline.js`:**
     - Run `evaluateHardRule` on every constraint first. Log zero LLM calls for constraints decided by hard rules!
     - If `modelOff` (`process.env.MODEL_OFF === '1'`), return `{ verdict: 'unsure', source: 'model', unsureReason: 'model-off', evidence: [] }` for remaining semantic constraints without opening any network connection.
     - Otherwise call `POST https://generativelanguage.googleapis.com/v1beta/models/${config.modelName}:generateContent` with `x-goog-api-key` header and sanitized prompt (`statement` + unresolved semantic `constraints` without deductions + `sanitized.numberedPromptCode` with comments & student PII stripped).
     - Append structured call metadata (`providerRequestId`, `model`, `inputTokens`, `outputTokens`, `latencyMs`, `costUsd`, `sanitizedPrompt`) to `callLogWriter` / `model_calls`.
- **Runnable Test-First Acceptance Criteria (`test/unit/limits.test.js` — Fake Model, Zero Network):**
  - `AC1 (Schema G1)`: Markdown-fenced JSON, invalid JSON, unknown verdict `'guilty'`, or duplicate constraint ID from fake model -> becomes `verdict: 'unsure'`, `unsureReason: 'schema-invalid'`.
  - `AC2 (Timeout G3)`: Fake model delaying `200ms` with `modelTimeoutMs: 30` -> aborts and returns `verdict: 'unsure'`, `unsureReason: 'model-timeout'`.
  - `AC3 (Deduction Stripped G5)`: Fake model returning `{"deduction": 99}` does not alter TA's declared deduction.
  - `AC4 (PII & Comment Stripping + Hard-Rule Bypass)`: Recorded prompt in fake transport contains zero `//` or `/*` comments and zero student IDs/names, and excludes constraints already resolved by `hard-rules.js`.
- **Copy-Paste Prompt for AI Assistant:**
  ```text
  Read AGENTS.md, CONTRIBUTING.md, and docs/plans/SHARED-CONTRACTS.md (§2.2, §2.4).
  Implement Task T3.4 from docs/plans/PA3-Plan.md on branch feat/pa3-model-and-limits:
  1. Commit 1 (`test(limits)`): write offline unit tests in test/unit/limits.test.js covering AC1, AC2, AC3, and AC4 using a fake model transport and zero network calls.
  2. Commit 2 (`feat(model-checker)`): implement src/checker/guardrails.js, src/checker/llm-client.js (`gemini-3.8-flash`), and src/checker/pipeline.js so AC1-AC4 and `npm run check` pass.
  ```

---

## Task `T3.5` — Dataset Checker CLI, `Dockerfile.checker`, Custom Cases & First Real Eval
- **Owner:** `23120256` (Trần Đại Hiệp) · **Branch:** `feat/pa3-checker-cli` · **Size:** `2 SP`
- **Allowed Files:**
  - Create `src/cli/check-dataset.js` & `Dockerfile.checker`
  - Create `eval/custom-cases/` (`problems/`, `solutions/`, `labels.jsonl` — at least **6 solutions** named `<problem>/s01.cpp`.. matching `/^[a-z0-9-]+\/s\d+$/`, tagged with at least `trap`, `injection`, `disguised`)
  - Create `eval/runs/pa3-dev/` (`predictions.jsonl`, `report.txt`, `call-log.jsonl` from 1 real `gemini-3.8-flash` run on `leetkob-eval`)
- **CRITICAL WEAK-MODEL TRAP (`SHARED-CONTRACTS.md` §4 Rule 1):**  
  `src/cli/check-dataset.js` MUST discover problems from `<dataDir>/problems/<pid>/statement.md` + `constraints.json` and `<dataDir>/solutions/<pid>/*.cpp`. **NEVER read `labels.jsonl` in `check-dataset.js`!**
- **Exact CLI Contract:**
  ```bash
  node src/cli/check-dataset.js --data <dataset-folder> --out <predictions.jsonl> [--call-log <call-log.jsonl>]
  # With MODEL_OFF=1: runs hard rules only, writes "unsure" for semantic constraints, opens 0 network sockets.
  ```
- **Runnable Acceptance Criteria:**
  - `AC1`: `MODEL_OFF=1 node src/cli/check-dataset.js --data leetkob-eval --out /tmp/off.jsonl && node leetkob-eval/eval.mjs --data leetkob-eval --predictions /tmp/off.jsonl` exits `0` or `1` (never `2`), reports **0 wrongful deductions**, and decides 100% of ban-list constraints.
  - `AC2`: `node leetkob-eval/eval.mjs --data eval/custom-cases --predictions ...` exits `0` or `1` (never `2`), confirming all custom cases compile with `g++ -std=c++17 -O2`, pass their tests, and follow `labels.jsonl` format.
  - `AC3`: `docker build -f Dockerfile.checker -t leetkob-checker . && docker run --rm --network none -e MODEL_OFF=1 -v "$PWD/leetkob-eval:/data:ro" leetkob-checker --data /data --out -` writes valid JSONL with `--network none`.

---

## Task `T3.6` — End-to-End Web Flow, Public HTTPS Deployment & `PA3.md`
- **Owner:** `21120595` (Nguyễn Thành Vinh) · **Branch:** `feat/pa3-web-flow` · **Size:** `3 SP`
- **Allowed Files:**
  - Create `src/routes/labs.js`, `src/routes/submissions.js`
  - Modify `src/routes/queue.js`, `src/routes/publish.js`, `src/app.js`, `public/index.html`, `public/client.js`, `public/styles.css`
  - Create `Dockerfile`, `compose.yaml` (`web` + `worker` sharing `/data` volume)
  - Create `test/contract/flow.contract.test.js`, `PA3.md`, update `SELF_ASSESSMENT_REPORT.md` & `AI-LOG.md`
- **Exact Visibility & Ownership Rules (`SHARED-CONTRACTS.md` §3):**
  - `POST /api/classes/:classId/labs`: TA creates lab (`title`, `statement`, `deadlineAt`, `tests`, `constraints` with `deduction`). Cross-class TA gets `404 not-found` (`T1`).
  - `POST /api/labs/:labId/submissions`: Student submits C++ (`<= 65536` bytes, before `deadline_at`), creates `submissions` (`queued`) + `judge_jobs`.
  - `GET /api/submissions/:id`: Before `published_at`, student receives **only** `{ id, labId, judgeStatus, testVerdict, testResults }` — **ZERO `constraint_verdicts` or `mark`** (`FAQ-08`, Syllabus Rule!).
  - `GET /api/labs/:labId/queue`: TA of the lab's class sees counted `AC` submissions (`FAQ-02`) with per-constraint `{ verdictId, constraintCode, verdict, source, unsureReason, evidence, deduction, taDecision }`. Cross-class TA gets `404 not-found` (`T1`).
  - `POST /api/labs/:labId/publish`: Refuses (`409 reviews-pending`) while any `violation` or `unsure` verdict on a counted submission lacks a TA decision (keeping 100% compatibility with `PA#2`'s `submissions` table rows too!).
- **Final `PA#3` Hand-In Checklist:**
  - [ ] Deploy on public HTTPS VPS (`admin`, `ta_a` class 1, `ta_b` class 2, `stu1` & `stu2` class 1), verify Criterion 1 walk-through (`sort-merge` lab + compliant, violation, injection submissions), record `<= 5 min` backup video.
  - [ ] Tag `pa3`, push tag, verify CI `gates` + `e2e` + `sandbox` all green on tag `pa3`.
  - [ ] Package `20120450-21120595-23120256_<total>.zip` (including `.git` and `SELF_ASSESSMENT_REPORT.md`).
