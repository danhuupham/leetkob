# PA#6 Defense & Oral Playbook — Final Demo and Individual Oral

**Milestone Weight:** **15% of course mark** (100 points per member = **40 shared build points** + **60 individual oral points**)  
**Key Deadlines:**
- **`OWNERS.md` Commit & Classroom Link:** **Monday, December 21, 2026, 22:00**
- **Live Defense Slots:** **Thursday, December 24** or **Thursday, December 31, 2026, 08:20–11:50** in **`cs2:G202`**  
**Rubric Reference:** [`PA6-rubric.md`](../reference/rubrics/PA6-rubric.md)

> **FROZEN BUILD & NO-AI RULE:**
> 1. Your public deployment and laptop checkout MUST run the exact commit tagged **`pa5`** (Verify `/api/version` === `git log -1 --format=%H pa5`). Do **not** deploy code changes after December 16 (`OWNERS.md` may be committed on `main` for Classroom submission while the server stays on tag `pa5`).
> 2. **Close ALL AI assistants** (Antigravity, Copilot, Cursor, ChatGPT/Claude/Gemini tabs) before walking up. Repo, terminal, `git log`/`blame`/`diff`, tests, and dashboards stay **open**.

---

## 1. Exact `OWNERS.md` Template (Commit by Mon Dec 21, 22:00)

Create `OWNERS.md` at repository root with exact PR/commit links filled from `git log`:

```markdown
# LeeTKOB Ownership & Beyond-the-Brief Index (`PA#6`)

| Part of LeeTKOB | Who built it | Main commits or pull requests |
| --- | --- | --- |
| C++ AST hard rules (`src/checker/hard-rules.js`), sanitizer (`src/checker/sanitize.js`), Gemini 3.8 Flash client (`src/checker/llm-client.js`), CI `eval-gate`, structured logs/traces/alerts (`src/obs/`), incident post-mortem | `20120450` (Phạm Hữu Đan), with `23120256` on guardrails | `<links>` |
| Accounts/roles/classes & labs (`src/auth.js`, `src/routes/labs.js`), SQLite WAL queue & worker (`src/worker.js`), human gate 10% pass sampling & Publish contract (`src/routes/publish.js`), real-time SSE & appeals (`src/routes/events.js`, `src/routes/appeals.js`), HTTPS deployment | `21120595` (Nguyễn Thành Vinh), with `20120450` on contract tests | `<links>` |
| Hardened Docker C++ sandbox & 9 attack suites (`src/sandbox/runner.js`, `test/sandbox/`), 5 model guardrails `G1`–`G5` (`src/checker/guardrails.js`), dataset CLI checker (`src/cli/check-dataset.js`), 80-student load test (`load/`), resubmission diff (`src/routes/diff.js`) | `23120256` (Trần Đại Hiệp), with `21120595` on worker concurrency | `<links>` |

| Beyond the brief | Where to see it | The test that checks it |
| --- | --- | --- |
| Side-by-side C++ resubmission code diff & per-constraint verdict delta viewer for TAs | TA Review Queue -> *Compare with previous submission* | `test/contract/diff.contract.test.js` |
```

---

## 2. Exact 23-Minute Live Slot Script (`B1`–`B5` = 40/40 Build Points)

### Pre-Slot Hardware & Browser Setup (08:05 AM)
- **Laptop 1 (Primary) + Laptop 2 (Identical Fallback):** Charged, plugged in, HDMI adapter tested, tethered to **4G/5G phone hotspot**, `git checkout pa5`, Docker running locally as emergency fallback, **all AI extensions/apps quit**.
- **5 Separate Browser Profiles Signed In (DevTools -> Network tab open):**
  1. `admin` · 2. `ta_a` (Class 1) · 3. `stu1` (Class 1) · 4. `stu2` (Class 1) · 5. `ta_b` (Class 2) + `/ops` Dashboard tab.

### Step-by-Step Execution
1. **Min 0–1 (`B2` — 4 pts):** Open `/api/version` + page footer on HTTPS deployment; run `git log -1 --format=%H` on laptop -> identical `pa5` SHA.
2. **Min 1–9 (`B1` Features `F1`–`F11` = 22 pts + `B5` = 4 pts):**
   - `ta_a`: Create lab from `sort-merge` (`statement.md`, tests, `C1` hard ban-list `-3` pts, `C2` semantic merge-sort `-4` pts) (`F1`, `F2`). Show `ta_b` gets `404` (`T1`).
   - `stu1`: Submit compliant merge sort -> watch status move `queued -> running -> AC` **without reload** (`F3`, `F4`).
   - `stu2`: Submit compliant-output `std::sort` violation (then resubmit once to populate `B5` diff!) -> watch real-time `AC` (`F3`, `F5`, `F6`).
   - `stu2`: Click Appeal before Publish -> server returns `409 not-published` (`A1`). Reload page on request (`B2`).
   - `ta_a`: Open Review Queue -> show hard-rule & Gemini verdicts, exact line evidence, TA deductions, `10%` sampled pass item, `unsure` guardrail reason, and open **`B5` Resubmission Diff** (`F7`, `F8`, `B5`).
   - `ta_a`: Attempt `Publish` while unreviewed -> `409 reviews-pending` (`H2`). Review items -> press **Publish** -> `200 OK`.
   - `stu1` & `stu2`: Reload (`B2`), read published marks (`10` and `7`, citing `FAQ-08`, `FAQ-11`).
   - `stu2`: File appeal on `C1` -> `ta_a` rejects with reason (visible to `stu2`, `FAQ-13`); show `stu2` cannot reopen (`409`, `FAQ-14`), then show `ta_a` post-publish adjustment or second constraint accept (`FAQ-12`, `A3`). Show `stu1` appealing `stu2` -> `404` (`A2`).
   - `/ops` Tab & Terminal (`F10`, `F11`): Search `stu2`'s `submissionId` -> show structured JSON logs, full waterfall trace (`HTTP -> Queue -> Sandbox -> Hard Rules -> Gemini [tokens + cost] -> DB`), metrics dashboard, SLO & fired alert, and CI `eval-gate`.
3. **Min 9–11 (`B3` = 6 pts & `B4` = 4 pts — Failure & Role Drills):**
   - Run whichever 2 rules examiners name (`T1`, `Q1`, `M1`–`M9` from `test/fixtures/attacks/`, `D1` trap + call log, `G4` low-cap lab, `G5` injection `.cpp`, `H1`–`H3` `curl`, `A1`–`A3`), then reload browser proving DB state did not corrupt.
   - Run examiner's `B4` cross-role / cross-class / cross-student URL or `curl` -> API returns `403` or `404`.

---

## 3. Individual Oral Cheat-Sheet (60/60 Points per Member)

Practice answering out loud in 60–90 seconds while pointing at exact files & line numbers:

- **Area A (Read Code):** Trace request -> `src/app.js` -> `src/routes/submissions.js` -> `judge_jobs` -> `src/worker.js` -> `src/sandbox/runner.js` -> `src/checker/hard-rules.js` -> `src/checker/sanitize.js` -> `src/checker/llm-client.js` -> `src/checker/guardrails.js` -> `src/grades.js` (`selectPassSample`) -> `src/routes/publish.js`. Always state **what breaks if a line is deleted** (e.g., deleting `docker rm -f` on timeout lets forked children hold stdout open forever; moving `auth.isStaff` below `q.publish.run` mutates `published_at` on refused requests).
- **Area B (Why This Decision):**
  - *Own Docker sandbox vs Judge0:* Saved ~1.8 GB RAM (no Ruby/Redis/Postgres containers on VPS) and gave direct control over `M1`–`M9`, at the cost of writing our own stream cap and container wall-clock reaper.
  - *SQLite WAL queue vs Redis:* Atomic enqueue inside the same SQLite transaction as `submissions` (`0` lost jobs, `<150ms` for 80 burst uploads), `0` extra containers; trade-off is single-node write ceiling (~thousands/sec, far above 80/lab).
  - *SSE vs WebSockets vs Polling:* Judge status is strictly server-to-client unidirectional; native `text/event-stream` took ~35 lines with zero npm packages and instant reconnect.
- **Area C (How You Know It Works):** Open the exact test file (`test/sandbox/attacks.test.js`, `test/unit/guardrails/g2-evidence.test.js`, `test/contract/publish.contract.test.js`), quote your `AI-LOG.md` *Rejected* entry (e.g., `gemini-2.5-flash` Dec 1 sunset, `DatabaseSync` V8 GC finalization, `scan-secrets.js` local `.env` walk), and walk through the post-mortem timeline from initial alert/log line to root-cause commit.
- **Area D (Live Unseen `.cpp` Walkthrough):**
  1. Read constraints: check `/^Do not (use|call)/i` + backticks -> decide which constraints `hard-rules.js` handles (`model` is NOT called for them!).
  2. For remaining semantic constraints: strip comments (preserving line numbers) + PII -> predict `gemini-3.8-flash` verdict & evidence lines -> check `G1`–`G5` -> state whether it enters TA queue (`100%` `violation`/`unsure` + `ceil(10%)` `pass`).
  3. Run `node src/cli/check-dataset.js` live and explain any difference from the code.
  4. State why human gate sits at **Publish** (reviews `100%` of deductions before irreversible student harm while saving ~70% TA reading time vs. reviewing every `pass`; quantify expected slipped false negatives `(1 - recall) * 0.90`).
