# PA#6 Preparation & Defense Plan — Final Demo and Individual Oral

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Milestone Weight:** **15% of course mark** (100 points per member = **40 team build points** + **60 individual explanation points**)  
**Key Deadlines:**
- **`OWNERS.md` Commit & Classroom Link:** **Monday, December 21, 2026, 22:00**
- **Live Demo & Oral Defense Slots:** **Thursday, December 24** or **Thursday, December 31, 2026, 08:20–11:50** in room **`cs2:G202`**  
**Frozen Build Under Examination:** Exact commit tagged **`pa5`** on `https://github.com/danhuupham/leetkob`  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

---

## 1. Objective & Scoring Breakdown

Deliver a zero-hiccup **23-minute live defense** on tag `pa5` and ensure every team member earns in the **51–60 / 60** oral explanation band (with AI assistants strictly closed during questioning):

1. **Part 1 — Team Final Build (40 points, shared by all 3 members):**
   - **`B1` (22 pts — 2 pts × 11 features):** Demonstrate all 11 LeeTKOB features (`F1`–`F11`) live on the public `pa5` deployment in separate signed-in browser windows.
   - **`B2` (4 pts):** `/api/version` + footer matches `git log -1 --format=%H` of `pa5`; data persists across two examiner-requested page reloads; DevTools Network tab proves live API requests.
   - **`B3` (6 pts — 3 pts × 2 failure rules):** Execute two examiner-selected failure rules from `{T1, Q1, M1–M9, D1, G4, G5, H1–H3, A1–A3}` live, stopped by the **server** (not merely hidden UI) with unchanged DB state after reload.
   - **`B4` (4 pts):** Examiner-chosen cross-role / cross-class / cross-student URL or `curl` request refused by the API (`403` or `404`).
   - **`B5` (4 pts):** Beyond-the-brief feature listed in `OWNERS.md` (TA Side-by-Side Resubmission Diff & Verdict Delta Viewer) shown working live on `pa5` AND backed by an automated test.
2. **Part 2 — Individual Oral Explanation (60 points, scored individually per member):**
   - ~4 minutes per member covering **Area A** (*Read your code & what breaks if deleted*), **Area B** (*Why your team decided it + measured trade-offs*), **Area C** (*How you know it works + AI mistakes caught + post-mortem trace*), and **Area D** (*Predict & run the LLM checker CLI on an unseen C++ submission, explain human gate placement & error cost*).

---

## 2. Pre-Slot Deliverable: `OWNERS.md` Design (Due Dec 21, 22:00)

Commit `OWNERS.md` to `main` (without moving the `pa5` tag on the deployed server!) and post the commit link on Classroom by **Monday, December 21, 22:00**:

### Table 1 — Balanced Ownership Across the Three Members
*(Every member commits their owned modules under their own Git author identity across PA#2–PA#5 so `git log --author` matches `OWNERS.md` 1:1)*

| Part of LeeTKOB | Who built it | Main commits / pull requests |
|---|---|---|
| **Hard rules AST engine (`F5`), LLM sanitizer & Gemini pipeline (`F6`), CI `eval-gate` (`F10`), distributed tracing & post-mortem (`F11`)** | `20120450` (Phạm Hữu Đan), with `23120256` on guardrails | Link `PA#2`–`PA#5` PRs & commits |
| **Roles & class ownership (`F1`), labs (`F2`), durable SQLite WAL queue (`F3`), human gate & Publish contract (`F8`), real-time SSE & appeals (`F9`), HTTPS deployment** | `21120595` (Nguyễn Thành Vinh), with `20120450` on contract tests | Link `PA#2`–`PA#5` PRs & commits |
| **Hardened Docker C++ sandbox & 9 attack suites (`F4`), 5 model guardrails `G1`–`G5` (`F7`), dataset CLI checker (`F10`), 80-student load test, Beyond-the-Brief resubmission diff (`B5`)** | `23120256` (Trần Đại Hiệp), with `21120595` on worker concurrency | Link `PA#2`–`PA#5` PRs & commits |

### Table 2 — Beyond the Brief (`B5` — 4 Points)
| Beyond the brief | Where to see it | The test that checks it |
|---|---|---|
| **Side-by-side C++ resubmission code diff & per-constraint verdict delta viewer** for TAs reviewing iterative student submissions | TA Review Queue -> *Compare with previous submission* panel | `test/contract/diff.contract.test.js` & `e2e/resubmission-diff.spec.js` |

---

## 3. Minute-by-Minute Choreography for the 23-Minute Slot

### Pre-Walk-Up Setup (Before Slot Is Called at 08:20)
- **Primary Laptop + Backup Laptop:** Both plugged into power, HDMI adapter attached, tethered to a dedicated **4G/5G phone hotspot** (never rely on `cs2:G202` Wi-Fi), **all AI coding assistants / Copilot / Antigravity / ChatGPT tabs completely quit**.
- **5 Isolated Browser Profiles / Container Tabs Open & Signed In (with DevTools Network tab docked):**
  1. Profile 1: `admin`
  2. Profile 2: `ta_a` (Class 1 TA)
  3. Profile 3: `stu1` (Class 1 Student 1)
  4. Profile 4: `stu2` (Class 1 Student 2)
  5. Profile 5: `ta_b` (Class 2 TA — ready for `T1` / `B4` checks)
  6. Tab 6 (in `ta_a`/ops window): Observability Dashboard, Logs & Trace viewer, and CI `pa5` tag run.
- **Terminal Ready at Repo Root (`git checkout pa5`):** Pre-typed shell history ready for `git log -1 --format=%H`, `npm run check`, `node src/cli/check-dataset.js`, and `curl` failure commands.

### Live Slot Timeline
1. **Minute 0–1 — Build Verification (`B2`):**
   - Show `/api/version` + footer on public HTTPS URL matching `git log -1 --format=%H` (`pa5`) on laptop.
2. **Minute 1–9 — Main End-to-End Flow (`B1`: `F1`–`F11` + `B5`):**
   - **`ta_a` (`F1`, `F2`):** Create new `sort-merge` lab live in Class 1 with tests + 2 constraints (`C1`: `"Do not use \`std::sort\`"`, `-5` pts; `C2`: semantic merge-sort recursion constraint, `-5` pts). Show `ta_b` (`Profile 5`) cannot see it (`404`).
   - **`stu1` & `stu2` (`F3`, `F4`, `F5`, `F6`):** `stu1` submits compliant merge sort; `stu2` submits violating code (and a second resubmission to trigger `B5` diff!). Watch both pages transition `queued -> running -> AC` **live via SSE without reload**. Reload once when asked (`B2`).
   - **`stu2` early appeal (`A1`):** Click/send appeal before Publish -> server refuses with `409 not-published`.
   - **`ta_a` Review Queue & Publish (`F7`, `F8`, `B5`):** Show verdicts, exact evidence lines, TA deductions, `10%` sampled pass indicator, and `B5` resubmission diff. Attempt `POST /api/labs/:id/publish` before reviewing -> refused `409 reviews-pending` (`H2`). Review items -> press **Publish** -> `200 OK`.
   - **`stu1` & `stu2` Marks & Appeals (`F9`, `A2`, `A3`):** Reload both student windows (`B2`) -> read published marks (`10` and `5`). `stu2` files appeal -> `ta_a` rejects with reason (shown to `stu2`), then reopens/accepts per cited FAQ (`FAQ-13`/`FAQ-14`) showing updated mark + `who/when/why` audit trail. Try `stu1` appealing `stu2`'s submission -> `404 not-found` (`A2`).
   - **Observability & CLI Gate (`F10`, `F11`):** Copy `stu2`'s `submissionId` -> show structured JSON logs, full trace (`HTTP -> Queue -> Sandbox -> Hard Rules -> Gemini [tokens + cost] -> DB`), dashboard metrics, SLO & fired alert history, plus CI `eval-gate` check on `main`.
3. **Minute 9–11 — Examiner Failure Cases & Role/Ownership Checks (`B3`, `B4`):**
   - Keep a cheat-sheet script `scripts/demo-drills.md` mapping every rule label (`T1`, `Q1`, `M1`–`M9`, `D1`, `G4`, `G5`, `H1`–`H3`, `A1`–`A3`) to its exact 1-command `curl` or `test/fixtures/attacks/*.cpp` file so any two rules named by examiners can be demonstrated in `< 45 seconds`, followed by a browser reload proving DB integrity.
4. **Minute 11–23 — Individual Oral Turns (~4 min × 3 members):**
   - Teammates stay completely silent during each member's turn. Answer directly from open code, `git log`, `AI-LOG.md`, tests, and logs.

---

## 4. Individual Oral Mastery Matrix (Targeting 51–60 / 60 for Every Member)

Every team member must prepare and rehearse **all four areas**, both on their primary owned modules AND on the end-to-end system flow:

| Oral Area | What Examiners Ask | Required Rehearsal Drill for Đan (`20120450`), Vinh (`21120595`), and Hiệp (`23120256`) |
|---|---|---|
| **A. Read Your Code** | *"What does this line do, and what breaks if we delete it?"* / *"Walk one submission from upload to review queue: which file & function handles each step?"* | Each member traces `POST /api/labs/:id/submissions` (`src/app.js`) -> `judge_jobs` (`src/db.js`) -> `claimNextJob` (`src/worker.js`) -> `runInSandbox` (`src/sandbox/runner.js`) -> `checkHardRules` (`src/checker/hard-rules.js`) -> `callGemini` (`src/checker/llm-client.js`) -> `applyGuardrails` (`src/checker/guardrails.js`) -> `selectPassSample` (`src/grades.js`) -> `POST /api/labs/:id/publish` without hesitation, naming exact line numbers. |
| **B. Why Your Team Decided It** | *"Own Docker containers vs Judge0: why, and what did it cost?"* / *"SSE vs WebSockets vs Polling?"* / *"SQLite WAL queue vs Redis?"* / *"Why 403 vs 404 here?"* | Prepare concrete, **measured** answers: (1) Custom Docker container (`gcc:13.3-bookworm`) avoided Judge0's Ruby/Redis/Postgres 4-container RAM overhead (~1.8 GB saved on VPS) at the cost of implementing wall-clock container kill & stream caps ourselves; (2) SQLite WAL queue gave atomic submission+job transactions with 0 extra infra, handling 80 burst submissions in `<150ms`; (3) SSE over HTTP/2 gave one-way push in 35 lines of native `node:http` with automatic browser reconnect; (4) Cite exact `FAQ-01`..`FAQ-14` numbers. |
| **C. How You Know It Works** | *"Which test/check proves this works? Show it."* / *"What did your assistant get wrong here, and what caught it?"* / *"Retrace your post-mortem from first signal to root cause."* | Every member memorizes where to open: (1) their module's unit/contract/sandbox test and how to break 1 line to watch it fail; (2) at least 2 real `AI-LOG.md` *Rejected* entries from their commits; (3) the post-mortem's exact initial alert/log line, timeline, root cause mechanism, and detection follow-up. |
| **D. The LLM Feature on a Given Input** | Given an unseen Accepted `.cpp` + constraints: predict hard rule, model call, verdict + evidence lines, guardrail, review queue routing, and TA action -> run CLI checker live -> explain any delta + why gate sits at Publish + who pays if wrong. | Practice live 3-minute dry runs on 5 unseen C++ snippets: (1) check prefix `"Do not use/call"` + backticks first; (2) check AST traps; (3) check stripped comments & line numbers for semantic prompt; (4) run `node src/cli/check-dataset.js` live; (5) articulate why gating Publish reviews `100%` of deductions + `10%` passes while saving ~70% TA reading time, and quantify student GPA harm vs. unsampled false-negative slip rate. |

---

## 5. Risks & Contingencies

- 🔴 **High — Production Cold Start / Room Network Outage During Slot:**
  - *Mitigation:* Keep VPS warm (`curl https://<domain>/api/version` 10 minutes before slot); tether both laptops to independent mobile hotspots; also keep Docker Desktop running locally on `git checkout pa5` with seeded data so if public internet drops completely, retry #1 runs `pa5` locally on the laptop seamlessly (`PA#6` rubric §*When the build cannot run* step 2).
- 🔴 **High — Accidental AI Assistant Left Open During Oral:**
  - *Mitigation:* Run a pre-slot checklist closing Cursor/Antigravity/Copilot extensions, browser AI sidebars, and background tray apps on both laptops before entering `cs2:G202` (use plain VS Code with AI disabled or terminal + `vim`/`less`/GitHub web view).
- 🟡 **Medium — Uneven Git Commit Authorship (`git log --author`):**
  - *Mitigation:* Enforce from `PA#3` Day 1 (Nov 18) that Đan (`20120450`), Vinh (`21120595`), and Hiệp (`23120256`) each push their own feature branches with their verified Git email/name, and run a full 23-minute mock oral rehearsal on **Tuesday, December 22**.

---

## 6. Preparation Timeline & Readiness Checklist (Dec 17 – Dec 24)

- **Thu Dec 17 – Sat Dec 19:** Draft `OWNERS.md` linking every part and `B5` test; verify `git log --author` coverage for all 3 members.
- **Sun Dec 20 (by Mon Dec 21, 22:00):** Commit `OWNERS.md` to repo and submit commit URL on Classroom (verify production deployment still serves exact `pa5` commit SHA!).
- **Tue Dec 22:** Full timed **23-minute mock defense** (cold browser profiles, hotspot, HDMI screen, 2 random `B3` failure drills, 1 `B4` `curl` IDOR drill, and 1 unseen `.cpp` Area D drill per member).
- **Thu Dec 24 / Dec 31 (08:00 arrival at `cs2:G202`):** Bring student ID cards, 2 charged laptops, chargers, HDMI adapter, 2 phone hotspots, 5 signed-in windows, observability tab open, AI assistants closed.
