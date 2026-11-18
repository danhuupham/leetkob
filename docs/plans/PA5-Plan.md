# PA#5 Agent-Executable Plan — Final Build, Running and Observed

**Milestone Weight & Deadline:** 3% of course mark (100 points) — *also produces frozen tag `pa5` worth 40% of `PA#6` (15% of course mark)*  
**Due Date:** **Wednesday, December 16, 2026, 22:00** *(Keep `pa5` up continuously Dec 17 – Dec 31, 2026!)*  
**Mandatory Shared Spec:** Read [`SHARED-CONTRACTS.md`](./SHARED-CONTRACTS.md) BEFORE writing any code.  
**Rubric Reference:** [`PA5-rubric.md`](../reference/rubrics/PA5-rubric.md) · [`FAQ.md`](../reference/FAQ.md)

> **TWO FATAL TRAPS IN `PA#5`:**
> 1. **Criterion 3 Log Leak Cap (`<= 4/20` pts):** If `MODEL_API_KEY`, a Bearer token, or a student's name/ID inside a logged prompt appears in **any** readable log line, Criterion 3 is capped at 4 points.
> 2. **`ACCESS.md` Packaging Rule:** `ACCESS.md` MUST be listed in `.gitignore` (**never committed to Git**) AND **included inside the submission `.zip`**.

---

## Task `T5.1` — Real-Time SSE Judge Status (`F3`) & Student Appeals (`F9`, `A1`–`A3`)
- **Owner:** `21120595` (Nguyễn Thành Vinh) · **Branch:** `feat/pa5-realtime-and-appeals` · **Size:** `5 SP`
- **Allowed Files:**
  - Create `migrations/004_pa5_appeals_obs.sql` (copy verbatim from [`SHARED-CONTRACTS.md`](./SHARED-CONTRACTS.md) §1.3)
  - Create `src/routes/events.js`, `src/routes/appeals.js`, `docs/contract/appeals.md`
  - Modify `src/routes/submissions.js`, `src/app.js`, `public/client.js`, `public/index.html`
  - Create `test/contract/appeals.contract.test.js`, `e2e/appeals-and-sse.spec.js`
- **Exact Implementation Spec:**
  1. **Real-Time Judge Status Without Reload (`GET /api/submissions/:id/events`):**
     - Authenticate (`EventSource` sends `?token=` ONLY if needed, or better: use `fetch` streaming reader with `Authorization: Bearer <token>` in `public/client.js` so tokens NEVER appear in URLs or access logs!).
     - Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` *(CRITICAL: `X-Accel-Buffering: no` prevents Nginx/Caddy reverse proxies from buffering SSE chunks in production!)*.
     - Poll SQLite `SELECT judge_status, test_verdict, test_results_json FROM submissions WHERE id = ?` every `250ms` inside the SSE stream (so cross-process `worker` updates reach `web` immediately with zero Redis dependency!), emit `data: {...}\n\n` whenever `judge_status` changes, and close stream once `judge_status === 'done'`.
  2. **Appeals & Post-Publish Mark Adjustments (`FAQ-12`, `FAQ-13`, `FAQ-14`):**
     - `POST /api/submissions/:id/appeals` (`{ constraintCode, explanation }`):
       - Ownership check first: non-owner student or other class -> `404 not-found` (`A2`).
       - If `lab.published_at IS NULL` -> `409 not-published` (`A1`).
       - If `datetime('now') > datetime(lab.published_at, '+7 days')` -> `409 appeal-window-closed` (`FAQ-13`).
       - Verify `constraintCode` is a confirmed deduction (`ta_decision = 'violation'` or upheld `violation`) on this student's counted submission -> else `400 validation`.
       - Require `explanation.trim().length >= 5` -> else `400 validation`.
       - If an appeal already exists for `(submission_id, constraint_code)` -> `409 appeal-already-exists` (**per `FAQ-14`: students CANNOT reopen a rejected appeal!** Cite `FAQ-13` and `FAQ-14` explicitly in `PA5.md`!).
     - `POST /api/appeals/:appealId/decision` (`{ decision: 'accepted' | 'rejected', reason }`):
       - Staff of class (`isStaff`) only -> else `403`/`404`.
       - Require non-empty `reason.trim()`.
       - Record `status = decision`, `decided_by = me.id`, `decision_reason = reason`, `decided_at = datetime('now')` (`A3`).
       - If `'accepted'`, overturn that constraint's deduction (`ta_decision = 'pass'`, log in `verdict_audit_logs`) so `markFor()` immediately reflects the increased published mark!
     - `POST /api/submissions/:id/adjust-mark` (`{ newMark, reason }`, `FAQ-12` & `FAQ-14`):
       - Allows TA to correct a mark after rejecting an appeal if TA later realizes an error, recording `old_mark`, `new_mark`, `actor_id`, `reason`, `created_at` in `mark_adjustments` (`A3`).
- **Runnable Test-First Acceptance Criteria (`test/contract/appeals.contract.test.js`):**
  - `AC1 (A1 Early Appeal)`: Student appealing before `published_at` receives `409 not-published`.
  - `AC2 (A2 Cross-Student IDOR)`: `stu1` appealing `stu2`'s submission receives `404 not-found` and creates 0 rows.
  - `AC3 (A3 Reject + Audit + FAQ-14 No Student Reopen)`: TA rejects appeal with reason -> student sees reason; student attempting a second appeal on the same constraint receives `409 appeal-already-exists` (`FAQ-14`), while TA can adjust via `adjust-mark` (`FAQ-12`) with full `who/when/why` audit trail.
  - `AC4 (No-Reload Real-Time Browser Test)`: Playwright `e2e/appeals-and-sse.spec.js` submits C++ code and asserts `page.reload()` is **not** called while status transitions from `queued` to `AC`.
- **Copy-Paste Prompt for AI Assistant:**
  ```text
  Read AGENTS.md, CONTRIBUTING.md, docs/reference/FAQ.md (FAQ-08, FAQ-12, FAQ-13, FAQ-14), and docs/plans/SHARED-CONTRACTS.md (§1.3 and §3).
  Implement Task T5.1 from docs/plans/PA5-Plan.md on branch feat/pa5-realtime-and-appeals:
  1. Commit 1 (`test(appeals)`): create migrations/004_pa5_appeals_obs.sql and write test/contract/appeals.contract.test.js covering AC1-AC3.
  2. Commit 2 (`feat(appeals-sse)`): implement SSE streaming (`X-Accel-Buffering: no`), src/routes/appeals.js, and UI updates + e2e/appeals-and-sse.spec.js (AC4).
  ```

---

## Task `T5.2` — Structured Logs, Distributed Traces Across Queue, Dashboard & Fired SLO Alert (`F11`)
- **Owner:** `20120450` (Phạm Hữu Đan) · **Branch:** `feat/pa5-observability` · **Size:** `5 SP`
- **Allowed Files:**
  - Create `src/obs/logger.js`, `src/obs/tracer.js`, `src/obs/metrics.js`, `src/obs/alerts.js`, `src/routes/ops.js`
  - Modify `src/app.js`, `src/worker.js`, `src/sandbox/runner.js`, `src/checker/pipeline.js`
  - Create `test/unit/observability.test.js`
- **Exact Implementation Spec:**
  1. **Redacting Structured JSON Logger (`src/obs/logger.js`):**
     - Output one JSON line per event: `{ time, level, service: 'web' | 'worker', traceId, submissionId, labId, msg, ...fields }`.
     - Mandatory `redactSensitive(str)` scrubs `/AIza[0-9A-Za-z_-]+/g`, `/Bearer\s+\S+/gi`, `/tok-[A-Za-z0-9_-]+/g`, student names, and student IDs before writing!
  2. **End-to-End Trace Across the Queue (`src/obs/tracer.js`):**
     - On `POST /api/labs/:labId/submissions`, generate `traceId = crypto.randomBytes(16).toString('hex')`, write span `http.submit` to `trace_spans`, and store `trace_id` on `submissions` and `judge_jobs`.
     - In `worker.js`, read `job.trace_id` and record child spans in `trace_spans`:
       - `queue.wait` (`started_at_ms - enqueued_at_ms`)
       - `sandbox.run` (duration + `testVerdict`)
       - `checker.hard_rules` (duration + decided constraint count)
       - `checker.llm_call` (duration + `{ model, inputTokens, outputTokens, costUsd, status }`)
       - `db.store_verdicts` (duration)
  3. **Read-Only Ops Dashboard (`GET /ops` + `/api/ops/*` authenticated with dedicated `tok-ops-readonly` token for `ACCESS.md`):**
     - Searchable structured logs by `submissionId`;
     - Visual waterfall trace viewer for any `submissionId` / `traceId`;
     - Live metrics cards: HTTP request rate & `4xx`/`5xx` error count, queue depth & oldest queued job age (seconds), judge latency (`p50`/`p95`), model calls (count, latency, errors, timeouts), `% unsure` share, and per-lab model USD spend vs. `$0.50` cap;
     - **SLO & Alert Engine (`src/obs/alerts.js`):** Formal SLO: *"95% of submissions reach a final judge result within 60 seconds, and oldest queued job age stays below 45 seconds."* Persist breaches in `alert_events` (`status = 'firing'`) + webhook/log alert so markers inspect real fired alert history matching log timestamps!
- **Runnable Test-First Acceptance Criteria (`test/unit/observability.test.js`):**
  - `AC1 (Zero Secret/PII Leak)`: Passing `MODEL_API_KEY=AIzaSyTest123...`, `Bearer tok-stu1`, and student name/ID into logger outputs `[REDACTED]` and passes regex leak scan.
  - `AC2 (Unbroken Cross-Queue Trace)`: Submitting -> worker processing produces all 6 linked spans sharing the exact same `traceId`, including `model`, `tokens`, and `costUsd` on `checker.llm_call`.
  - `AC3 (Alert Firing)`: Injecting a job older than `45s` or `p95 > 60s` transitions the SLO alert to `'firing'` and records an `alert_events` row.

---

## Task `T5.3` — `PA#6 B5` Beyond-the-Brief Feature (Built Before `pa5` Freeze!)
- **Owner:** `23120256` (Trần Đại Hiệp) · **Branch:** `feat/pa5-resubmission-diff` · **Size:** `3 SP`
- **Why in `PA#5`:** `PA#6` (`B5` = 4/40 build pts) grades the exact `pa5` commit with zero post-`PA#5` code changes allowed.
- **Exact Spec:**
  - Add `GET /api/submissions/:id/diff` (`isStaff` only; `403`/`404` for students and other-class TAs!): returns line-by-line Myers diff between this student's current submission and their immediately preceding submission in the same lab, plus side-by-side per-constraint verdict delta (`violation -> pass`, etc.).
  - Render a *"Compare with previous submission"* drawer in the TA Review Queue UI (`public/client.js`).
  - Write `test/contract/diff.contract.test.js` (checking diff output + `403`/`404` authorization) so `OWNERS.md` links both the live feature and its automated test!

---

## Task `T5.4` — 80-Student Concurrent Dockerized Load Test (`load/`)
- **Owner:** `23120256` (Trần Đại Hiệp) · **Branch:** `feat/pa5-load-test` · **Size:** `5 SP`
- **Allowed Files:** `load/Dockerfile`, `load/run.js`, `load/RESULT.md`, plus `src/worker.js` concurrency pool (`WORKER_CONCURRENCY=6`) & `submission_idem_keys` support.
- **Exact Rubric Requirements (`PA#5` Criterion 4):**
  - `load/Dockerfile` runs standalone given only `BASE_URL` and credentials env/args (zero host volume mounts!).
  - Seed/provide **80 distinct student accounts** (`load_stu_01`..`load_stu_80`) enrolled in the load-test class.
  - Dispatch all 80 `POST /api/labs/:labId/submissions` requests **within 10 seconds** (`Promise.all` in paced batches over `0..8s`), each carrying a unique `Idempotency-Key` and retrying `429` with jittered backoff so **0 submissions are lost and 0 are duplicated**.
  - **Keep all 9 sandbox minimums ON!**
  - Poll until all 80 reach `judge_status === 'done'` (must finish well under 15 minutes; target `< 90s` with `WORKER_CONCURRENCY=6`).
  - Print exact summary: `accepted`, `finalJudged` (`80/80`), `failedByStatus`, `duplicated` (`0`), `p50Ms`, `p95Ms`, `queueDrainSec`, `modelCallsCount`, `modelCostUsd`.
  - Run **Baseline #1** (`WORKER_CONCURRENCY=1`) to capture real queue saturation screenshot + trigger our SLO alert (feeding Criterion 3 & 5!), then commit `WORKER_CONCURRENCY=6` tuning and record **Run #2** in `load/RESULT.md`.

---

## Task `T5.5` & `T5.6` — `GET /api/version`, `pa5` Release/Rollback, Post-Mortem & Packaging
- **Owners:** `21120595` (Vinh) & `20120450` (Đan) · **Size:** `6 SP`
- **Checklist:**
  1. Expose `GET /api/version` returning `{ commit: config.appCommit }` (baked at Docker build time via `ARG APP_COMMIT=$(git rev-parse HEAD)`) and render the short/full SHA in `public/index.html` footer.
  2. Write `docs/postmortem/<YYYY-MM-DD>-<slug>.md` with all **7 required sections** (`Summary`, `Impact`, `Timeline` with timezone + log/alert/commit links on every line, `Detection`, mechanical `Root cause`, `Fix` commit + check, `Follow-up` with `>= 1` completed detection improvement linked).
  3. Update `AI-LOG.md` with real *Changed / Rejected* entries for deployment, dashboards/alerts, load script, post-mortem, and **actual measured USD cost of 1 lab from production metrics**.
  4. Tag `pa5`, deploy exact `pa5` image over HTTPS, verify `/api/version` matches `git rev-parse pa5`, record continuous **`<= 10 min` walkthrough video** of all 6 steps of Criterion 2 **after** tagging `pa5`.
  5. Place untracked `ACCESS.md` (listed in `.gitignore`! Verify `git ls-files ACCESS.md` is empty!) in the root directory before creating `20120450-21120595-23120256_<total>.zip`.
