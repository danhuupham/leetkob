# PA#5 Implementation Plan — Final Build, Running and Observed

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Milestone Weight & Deadline:** 3% of course mark (100 points) — *also produces the frozen `pa5` build worth 40% of `PA#6` (15% of course mark)*  
**Due Date:** **Wednesday, December 16, 2026, 22:00**  
**Marking & Oral Uptime Window:** **Thursday, December 17 through Thursday, December 31, 2026** (must stay up running exact commit tagged `pa5`!)  
**Repository:** `https://github.com/danhuupham/leetkob` (Tag: `pa5`)  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

---

## 1. Objective & Desired Behavior

Complete LeeTKOB as an observable, load-tested production system running commit `pa5` over public HTTPS:
1. **Public HTTPS Deployment & Rollback Readiness (`Criterion 1` — 10 pts):** Always-on HTTPS deployment exposing `/api/version` and a page footer displaying the exact `pa5` Git commit SHA, backed by documented one-command deploy and rollback procedures (`IA#4` blue/green or tagged image rollback on persistent `/data` volume).
2. **Real-Time Judge Status, Publishing & Student Appeals (`Criterion 2` — 20 pts, `F3`, `F9`, `A1`–`A3`):**
   - Student pages update judge status (`queued` -> `compiling` -> `running` -> `AC`/`WA`/`TLE`/`MLE`/`RE`/`CE`) **live without a page reload** via Server-Sent Events (`SSE`).
   - Full appeal lifecycle aligned with Product Owner FAQ (`FAQ-08`..`FAQ-14`): appeals before Publish are refused (`409 not-published`, `A1`); cross-student appeals are refused (`404 not-found`, `A2`); after Publish, students view marks and confirmed deductions, file appeals, and TAs reject (with mandatory visible reason) or accept/reopen (recomputing published mark via `markFor` and recording immutable `who`, `when`, `why` audit history, `A3`).
3. **Structured Logs, Metrics, Distributed Traces, SLO & Fired Alert (`Criterion 3` — 20 pts, `F11`):**
   - Structured JSON logs (`level`, `time`, `service`, `submissionId`, `traceId`) containing **zero** API keys and **zero** student PII/names in logged prompts.
   - End-to-end distributed trace crossing process boundaries (`HTTP POST` -> `judge_jobs` queue -> `worker` -> `sandbox` -> `hard_rules` -> `gemini_call` [recording model, tokens, USD cost] -> `store_verdict`).
   - Read-only observability dashboard (request rate/errors, queue depth & oldest job age, judge latency, model calls/latency/errors/timeouts, `% unsure`, model spend vs. cap) + **1 formal SLO** with an alert rule that has **genuinely fired at least once** (evidence matched to logs).
4. **Concurrent 80-Submission Load Test (`Criterion 4` — 20 pts):** Containerized load runner (`load/Dockerfile` + `load/run.js`) using **80 distinct student accounts** submitting within **10 seconds** with all 9 sandbox minimums **enabled**, achieving `80/80` judged within 15 minutes, `0` duplicates, `0` `5xx`, and documenting in `load/RESULT.md` what saturated first and the commit that tuned it.
5. **Evidence-Backed Incident Post-Mortem (`Criterion 5` — 20 pts):** Real 7-section post-mortem (`docs/postmortem/<YYYY-MM-DD>-<slug>.md`) where every timeline timestamp links to verifiable logs/alerts/commits, tracing the mechanical root cause, fix commit + verification check, and `>= 1` completed detection/prevention follow-up.
6. **Pre-Tagging `PA#6` Readiness (`B5` — Beyond the Brief):** Because `PA#6` grades the frozen `pa5` tag (`B5` = 4/40 build points), ship and test one genuine **Beyond-the-Brief** capability before tagging `pa5`: **TA Submission Diff & Resubmission Constraint Comparison + Live Constraint Dry-Run Sandbox Tester during Lab Creation**.

---

## 2. Technical Impact Analysis

### 2.1 Files & Modules to Create or Modify

| File / Directory | Action | Responsibility |
|---|---|---|
| `migrations/004_pa5_appeals_obs.sql` | Create | Add `appeals` (`id`, `submission_id`, `constraint_id`, `student_id`, `reason`, `status`, `created_at`) and `appeal_decisions` (`id`, `appeal_id`, `decided_by`, `decision`, `reason`, `decided_at` — append-only audit trail for `A3` & FAQ reopen rules); add `trace_id`, `enqueued_at`, `started_at`, `finished_at` on `judge_jobs`; add `telemetry_spans` & `structured_logs` ring/SQLite tables (or OTLP exporter to Grafana Cloud). |
| `src/events.js` & `src/app.js` | Create / Modify | Native `text/event-stream` SSE hub (`GET /api/submissions/:id/events`) + cross-process notification (worker notifies web via lightweight internal UNIX socket / SQLite `data_version` poll every `250ms` so multi-container `web` + `worker` push instant SSE updates without Redis!). |
| `src/appeals.js` & `docs/contract/appeals.md` | Create | Implement `POST /api/submissions/:id/appeals` and `POST /api/appeals/:appealId/decision` enforcing `A1` (`409` before publish), `A2` (`404` on non-owner student / cross-class TA), `A3` (`decided_by`, `decided_at`, mandatory `reason`, live mark recalculation). |
| `src/obs/logger.js`, `src/obs/tracer.js`, `src/obs/metrics.js` | Create | Redacting structured JSON logger (strips `AIza*`, `Bearer *`, student names/IDs), W3C `traceparent` / `traceId` propagator across HTTP -> SQLite `judge_jobs` -> Worker spans, Prometheus `/metrics` + read-only `/ops` inspector UI (or Grafana Cloud Tempo/Loki/Prometheus read-only viewer). |
| `src/obs/alerts.js` | Create | Evaluates SLO (*"95% of submissions reach a final judge result within 60s, and oldest queued job age < 45s"*) and dispatches webhook/email/persistent alert-history events when breached. |
| `src/diff.js` (`PA#6 B5` Beyond the Brief) | Create | Myers line-by-line C++ diff & verdict delta viewer in the TA Review Queue comparing a student's latest Accepted submission against their previous submission (with dedicated contract & Playwright tests). |
| `deploy/release.sh` & `deploy/rollback.sh` | Create | Image-tagged deploy (`APP_COMMIT=$(git rev-parse HEAD)`) with `/api/version` health verification and <15s one-command rollback (`IA#4` pattern). |
| `load/Dockerfile`, `load/run.js`, `load/RESULT.md` | Create | Self-contained container spawning 80 student tokens submitting within 10s (with `Idempotency-Key` + exponential backoff on `429`), SSE/poll completion tracker, p50/p95/drain/cost reporter, dashboard screenshot, bottleneck analysis, and tuning commit link. |
| `docs/postmortem/<YYYY-MM-DD>-<slug>.md` | Create | 7-section post-mortem of a real incident (or explicitly declared fault-injection rehearsal) with exact timezone-stamped log/alert/commit links. |
| `PA5.md`, `ACCESS.md` (gitignored!), `SELF_ASSESSMENT_REPORT.md` | Create | Complete submission index, 10-minute post-tag walkthrough video link, and gitignored `ACCESS.md` packaged inside the zip only. |

---

## 3. Load-Test Bottleneck Engineering (`80 Submissions in 10s`)

Let's do the capacity math up front so `80/80` succeeds on the first marker run:
- **Arrival burst:** 80 HTTP `POST /api/labs/:labId/submissions` in 10s (`8 req/s`). With SQLite `WAL` + `synchronous = NORMAL` + `busy_timeout = 5000`, 80 durable enqueues finish in `< 150ms` total with **`0` `5xx` and `0` lost submissions**. Support `Idempotency-Key` on submission upload so any network retry never creates duplicates!
- **Sandbox & Worker Throughput:**
  - 1 C++ compile + 5 test cases in a pre-warmed/lightweight `gcc:13.3-bookworm` container takes `~0.8s–1.5s` wall time.
  - Sequential worker (`CONCURRENCY=1`) would take `80 × 1.5s = 120s` (violating a 60s SLO!).
  - Setting `WORKER_CONCURRENCY=6` on a 2–4 vCPU VPS drains all 80 sandbox runs in **`~16–22 seconds`** while peak RAM stays at `6 × 256 MB = 1.5 GB` (safely inside a 4 GB VPS without OOM!).
- **Gemini Rate Limit & Per-Lab Cost Cap:**
  - `gemini-2.5-flash` standard paid/billing-enabled tier allows `1,000+ RPM` (whereas unbilled free tier caps at `15 RPM`!). Enabling billing with a `$5/month` hard budget cap avoids `429` throttling, AND `llm-client.js` adds bounded concurrency (`MODEL_CONCURRENCY=8`) + `429` jittered retry before timeout, falling back gracefully to `unsure` (`cost-cap-exceeded` if lab hits `$0.25`) as explicitly blessed by the rubric!
- **Documented Optimization Cycle for `load/RESULT.md`:**
  - Run Baseline Load Test #1 with `WORKER_CONCURRENCY=1` (intentionally observing queue saturation, p95 > 90s, and firing our queue-age/latency SLO alert -> providing both real alert-firing evidence for Criterion 3 AND real saturation screenshot for Criterion 4!).
  - Commit worker pool tuning (`WORKER_CONCURRENCY=6` + reusable sandbox image pre-pull + bounded LLM semaphore), re-run Load Test #2, and record the p50/p95 drop (`~95s -> ~22s`) in `load/RESULT.md`.

---

## 4. Risks & Mitigations

- 🔴 **High — Logging Secrets or Student PII (Criterion 3 Hard Cap <= 4/20 pts):** If `MODEL_API_KEY` or a student's name/ID inside a logged prompt appears in any readable log line, Criterion 3 is capped at **4 points (losing 16 points)**.
  - *Mitigation:* Never log raw prompt bodies in general operational logs; run every log field through `redactSensitive()` (`AIza[0-9A-Za-z_-]+`, `Bearer \S+`, student names/IDs); add an automated test in `npm run check` that inspects emitted logs after a full submission flow and asserts zero matches for user tokens, student names, and API keys.
- 🔴 **High — Committing `ACCESS.md` to Public Git or Omitting It from Zip:** `ACCESS.md` must be **inside the zip** AND **never committed to git** (`.gitignore`).
  - *Mitigation:* Add `ACCESS.md` to `.gitignore` and `scripts/scan-secrets.js` tracked-file blocklist immediately; create a packaging script `scripts/package-pa5.js` that verifies `git ls-files ACCESS.md` is empty while including `ACCESS.md` in the final submission archive (or copy strictly after `git archive`/clone verify without committing). *Note carefully:* Because the rubric asks for "One zip file of the repository including `.git`" with `ACCESS.md` in the zip and listed in `.gitignore`, placing `ACCESS.md` as an untracked gitignored file in the working tree before zipping satisfies **both** requirements simultaneously!
- 🔴 **High — Deployment Drift or Downtime Dec 17–31:** Deploying any commit after `pa5` invalidates live marking of Criteria 2 & 3 (forcing fallback to recording, capped at 17/20) and breaks `PA#6` `B2`.
  - *Mitigation:* Freeze production strictly on tag `pa5` by Dec 16 20:00; configure systemd / Docker `restart: unless-stopped` + external uptime ping (UptimeRobot / Cloudflare health check) monitoring `/api/version` every 5 minutes until Dec 31.
- 🟡 **Medium — Trace Broken Across the Queue Boundary:** Many teams instrument HTTP only, so traces stop at `INSERT INTO judge_jobs` (dropping Criterion 3 to 12–17).
  - *Mitigation:* Persist `trace_id` and `parent_span_id` columns on `judge_jobs`; when `worker.js` claims the job, resume the exact `trace_id` and attach child spans `queue.wait`, `sandbox.run`, `checker.hard_rules`, `checker.llm_call` (with `model`, `input_tokens`, `output_tokens`, `cost_usd`), and `db.store_verdicts`.

---

## 5. Effort Estimate & Team Ownership

**Total Story Points:** **24 SP** across two full weeks (Dec 3 – Dec 16, split into 6 sub-tasks of `3–5 SP` each).

| Sub-Task | Scope | Points (Fib) | Primary Owner | Backup / Reviewer | Target Date |
|---|---|---|---|---|---|
| **T5.1 — Real-Time SSE Judge Status & Student Appeals (`F3`, `F9`, `A1`–`A3`)** | SSE stream without reload, appeals schema/API/UI, `FAQ-08`..`FAQ-14` citations, contract & Playwright tests | **5 SP** | `21120595` (Vinh) | `20120450` (Đan) | Dec 4–7 |
| **T5.2 — Structured Logs, Cross-Queue Tracing, Dashboard & SLO Alert (`F11`)** | Redacting JSON logger, HTTP->Queue->Worker->Sandbox->LLM trace spans, metrics dashboard, SLO + fired alert | **5 SP** | `20120450` (Đan) | `23120256` (Hiệp) | Dec 5–9 |
| **T5.3 — `PA#6 B5` Beyond-the-Brief Feature (Resubmission Diff + Tests)** | Line-by-line C++ submission diff & verdict comparison in TA Review Queue + automated contract/e2e test | **3 SP** | `23120256` (Hiệp) | `21120595` (Vinh) | Dec 8–10 |
| **T5.4 — 80-Student Dockerized Load Test & Worker Concurrency Tuning** | `load/Dockerfile` & `load/run.js` (80 students in 10s), baseline saturation run -> worker pool fix -> `load/RESULT.md` | **5 SP** | `23120256` (Hiệp) | `20120450` (Đan) | Dec 10–12 |
| **T5.5 — Production `pa5` Release, `/api/version`, Rollback Drill & Video** | HTTPS deploy, commit hash footer/endpoint, rollback verification, continuous `<= 10 min` walkthrough video after `pa5` tag | **3 SP** | `21120595` (Vinh) | All 3 members | Dec 13–15 |
| **T5.6 — 7-Section Incident Post-Mortem, `AI-LOG.md` & Packaging** | `docs/postmortem/YYYY-MM-DD-*.md` with log/commit evidence + completed detection follow-up, measured lab cost in `AI-LOG.md`, `PA5.md`, `ACCESS.md` | **3 SP** | `20120450` (Đan) | All 3 members | Dec 14–16 |

---

## 6. Pre-Submission Verification Checklist

- [ ] `GET https://<domain>/api/version` and page footer match `git rev-parse pa5` exactly.
- [ ] Walkthrough recording (`<= 10 min`, recorded **after** tagging `pa5`) demonstrates all 6 steps of Criterion 2 continuously, including no-reload status transitions, refused pre-publish appeal (`A1`), Publish, appeal reject + accept/reopen (`A3`), and refused cross-student appeal (`A2`).
- [ ] Searching a single `submissionId` returns structured JSON logs across both `web` and `worker` with zero secrets/PII, and opens a single unbroken trace from HTTP request through queue, sandbox, hard rules, and Gemini call (with model, tokens, USD cost).
- [ ] SLO alert has fired at least once with alert timestamp matching structured logs.
- [ ] Running `docker build -t leetkob-load load/ && docker run --rm leetkob-load ...` against the public HTTPS URL completes `80/80` submissions in `< 15 min` with sandbox minimums ON, `0` duplicates, and `0` `5xx`.
- [ ] `ACCESS.md` is listed in `.gitignore`, absent from `git log --all --stat`, and present inside `20120450-21120595-23120256_<total>.zip` alongside `SELF_ASSESSMENT_REPORT.md`.
