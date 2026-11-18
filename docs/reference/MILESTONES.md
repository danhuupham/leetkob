# Final project — milestones and rubrics

**CSC13114 · CQ2023/3 · LeeTKOB · 6 milestones · 40% of the course**

Your team builds LeeTKOB in the milestones PA#2 to PA#6; PA#1 was your own proposal. Each milestone is handed in on its own Classroom assignment, due at **22:00**, with its full rubric attached to that assignment. This page puts them together so you can plan the rest of the semester: what each milestone asks, when it is due, and what its rubric scores. When this page and a rubric disagree, the rubric is right.

---

## The six milestones

| | Milestone | Weight | Due | Status on November 17 |
| --- | --- | --- | --- | --- |
| PA#1 | Proposal and planning | 4% | Wednesday, October 7 | marked; feedback sent by email |
| PA#2 | Harness and quality gate | 4% | Wednesday, November 11 | closed; marks come by email and on Classroom |
| PA#3 | Prototype with the LLM feature running | 7% | Wednesday, November 25 | open now |
| PA#4 | Eval, guardrails, human gate and red-team | 7% | Wednesday, December 2 | assignment posted later on Classroom |
| PA#5 | Final build, running and observed | 3% | Wednesday, December 16 | assignment posted later on Classroom; marking window December 17–23 |
| PA#6 | Final demo and individual oral | 15% | sessions 14–15, Thursday, December 24 and Thursday, December 31 | `OWNERS.md` due Monday, December 21 |

**SEMINAR** (7%) is done by the same team but is not part of the project: it counts with the assignments and has its own assignment and rubric. The study is due **Sunday, November 29**; the teams chosen by the class vote present live in sessions 11–13 (December 3, 10 and 17).

**Three deadlines in eight days:** PA#3 on Wednesday, November 25, the SEMINAR study on Sunday, November 29, and PA#4 on Wednesday, December 2. Your PA#4 red team attacks the deployment you hand in with PA#3, so keep it running from November 25.

The milestones build on one another: PA#3 makes the pipeline run for real on a public deployment; PA#4 makes it trustworthy (the eval gate, the guardrails, the human gate) and attacks another team's deployment; PA#5 finishes the product, runs it where strangers can reach it and watches it; PA#6 scores that final build as a whole and asks each of you about it.

---

## The features of LeeTKOB you must implement

Every team builds these eleven features. They come from the scope in section 4 of the brief and from the criteria of PA#3, PA#4 and PA#5 named after each one; the last column names the rules that apply to it (the labels are explained in the next table). PA#6 checks all eleven in the final build. Stack, architecture, screens and wording are your team's choice; where the brief is silent, the product owners' FAQ decides how the product behaves.

| # | Feature | Who | What must work | Rules |
| --- | --- | --- | --- | --- |
| F1 | **Accounts, roles and classes** (brief 4.1; PA#3 1) | Admin, TA, Student | Accounts for the three roles; TAs belong to classes and each lab belongs to a class; each role sees only its own screens. A TA of another class cannot see a lab or its review queue. | T1 |
| F2 | **A lab with tests and constraints** (PA#3 1; PA#5 2) | TA | A lab in the TA's own class: its statement, its tests, and its constraints, each with the deduction the TA chose, one decided by a hard rule ("Do not use…") and one for the model. | T1 |
| F3 | **Submit and judge, in real time** (brief 4.2; PA#3 1–2; PA#5 2) | Student | A C++ submission goes onto a queue and a separate worker judges it against the TA's tests. The status on the student's page changes from queued to the final result without a reload. | Q1 |
| F4 | **The sandbox** (brief 5; PA#3 2) | Pipeline | Compiling and running happen inside the sandbox, and the nine minimums of the brief hold, each with an attack submission in your repository that runs in CI. | M1–M9 |
| F5 | **Hard rules first** (brief 3; PA#3 3) | Pipeline | Ban-list constraints are decided by syntax-aware code. The traps do not fire: the student's own `sort`, a banned name in a comment or a string, `<algorithm>` included only for `std::swap`. The model is not called for a constraint a hard rule decided. | D1 |
| F6 | **The model judges the semantic constraints** (brief 3; PA#3 4) | Pipeline | A real model, sent only the statement, the constraints and the code with comments and the student's identity removed, returns `pass`, `violation` or `unsure` for each constraint, with evidence lines. Nothing in its output sets a deduction. | G5 |
| F7 | **Guardrails on the model's output** (brief 3; PA#3 5; PA#4 3) | Pipeline, TA | Output that fails the schema, evidence that does not match the code, a timeout, and the cost cap per lab each turn the verdict into `unsure`, and the TA sees why. An injection submission ends as `violation` or `unsure`, never `pass`. | G1–G4 |
| F8 | **The review queue and Publish** (brief 3; PA#3 5; PA#4 4) | TA | The queue holds every `violation`, every `unsure` and a random 10% of the `pass` verdicts, each with its evidence and the TA's deduction. The TA reviews them and presses Publish, the only action that makes a deduction visible to a student. | H1–H3 |
| F9 | **Published marks and appeals** (brief 4.4; PA#5 2) | Student, then TA | After Publish, each student reads the mark and the deduction. A student appeals; the TA rejects it with a reason the student sees, or accepts it and the published mark changes. | A1–A3 |
| F10 | **The checker command and the eval gate** (brief 4.5, 6; PA#3 6; PA#4 1) | Team | One command line writes the prediction file from a dataset folder, with the model-off switch `MODEL_OFF=1`. A CI job runs the checker on the dev set and your own cases, then `eval.mjs`, and is a required check on `main`. | — |
| F11 | **Logs, metrics and traces** (PA#5 3) | Team | For a submission made in front of us: every log line by one id; its trace from the request through the queue, the sandbox, the hard rules and each model call to the stored verdict; the dashboard; the SLO and its alert. | — |

The load test with 80 submissions (brief 4.6) is scored in PA#5 only. The public deployment (brief 4.7) is where the features run.

**The rules, by label.** In PA#6 the examiners name two of them for you to try as failure cases (B3), from those that can be tried on the running build.

| Label | Rule | From | Tried on the running build |
| --- | --- | --- | --- |
| T1 | A TA of another class cannot see a lab or its review queue | PA#3 criterion 1 | a direct request |
| Q1 | A submission made while the worker is stopped is judged exactly once after it starts again | PA#3 criterion 2 | stop the worker, submit, start it |
| M1–M9 | The nine sandbox minimums: M1 no network; M2 CPU time; M3 a wall-clock limit that kills the container; M4 memory, swap included; M5 processes; M6 output size; M7 a non-root user; M8 no host mounts and no Docker socket; M9 no secrets | PA#3 criterion 2; brief 5 | an attack submission from your repository |
| D1 | Hard rules decide the ban-list constraints, the traps do not fire, and the model is not called for them | PA#3 criterion 3 | a trap submission, then the call log |
| G1–G5 | The five guardrails: G1 schema; G2 evidence; G3 timeout; G4 cost cap per lab; G5 no deduction from the model | PA#4 criterion 3 | G4 and G5 (a lab with a low cap, an injection submission); G1–G3 only by their tests, so they are not named for B3 |
| H1–H3 | The human gate: H1 the sample of passes is random and drawn by the server; H2 Publish is refused by the API while any queued verdict is unreviewed; H3 Publish is refused for a student and for a TA of another class | PA#4 criterion 4 | direct requests |
| A1–A3 | Appeals: A1 refused before publishing; A2 refused on another student's submission; A3 a decision keeps who, when and why | PA#5 criterion 2 | on the running build |

---

## Where your features are scored

- **PA#3** scores the first real run of the pipeline on your deployment: the lab, submitting, the queue and the sandbox, the hard rules, the model, the first limits and the review queue, and the checker command (F1–F8, F10), plus about ten attack submissions of our own.
- **PA#4** scores whether it can be trusted: the eval gate (F10), the held-out run, the guardrails (F7), the human gate (F8), and your red-team report on another team.
- **PA#5** scores the finished product running in public: publishing, appeals and real-time results (F3, F9), logs, metrics and traces (F11), the load test and one incident post-mortem.
- **PA#6** scores the **whole final build** working together (40 of the 100 points): each of the eleven features F1–F11, two rules, roles, and **what your team built beyond the brief** (B5).

---

## For every milestone

- **Teams of up to 3**, the same team all semester. One member submits for the team.
- **One zip** of your team repository **including `.git`**, with the tag of the milestone (`pa3`, `pa4`, `pa5`) on the commit you submit, pushed. The repository stays **public**. Name the zip after the student IDs, in ascending order, **and the total you give yourselves**: `<StudentID1>-<StudentID2>-<StudentID3>_<total>.zip`, for example `23120001-23120002-23120003_84.zip`. PA#6 has no zip (see below).
- `SELF_ASSESSMENT_REPORT.md` inside: one row per criterion of the rubric, the marks you claim and the evidence — a file, a commit, a pull request or a CI run — adding up to the number in the file name, and a short *what we did not manage*.
- `PA3.md`, `PA4.md`, `PA5.md` at the root, with the links each rubric asks for.
- `AI-LOG.md`: one file for the whole project, with real *Changed* and *Rejected* entries for each milestone's parts. `Tool: none` is a valid entry.
- **Commit history** counts where a rubric scores it: one commit per part, tests no later than the code they test. A history split or rebuilt after the work was finished does not count as one commit per part; it scores at the level for commits that mix several parts.
- **Late work (PA#3–PA#5):** up to 2 hours late loses 20% of the mark, 2 to 24 hours late loses 50%, and work more than 24 hours late is not accepted. The late factor applies after the honesty adjustment.
- Turn in from your `<StudentID>@student.hcmus.edu.vn` account.

---

## Honesty adjustment (PA#1–PA#5)

Your self-assessment is compared with the mark you actually earn, on the same 100-point scale.

| Gap: your total − the mark | Adjustment |
| --- | --- |
| within ±10 | none |
| +11 to +20 | −3 |
| +21 to +30 | −6 |
| more than +30 | −10 |
| −21 or worse | −3 |
| no `SELF_ASSESSMENT_REPORT.md` | −10, and the file-name total is ignored |

A criterion you claim with no evidence line counts as claimed and not done. The adjustment never takes a mark below 0.

---

## PA#3 — Prototype with the LLM feature running · 7% · due Wednesday, November 25

- **The whole pipeline, for real:** a TA creates a lab with constraints; a student submits; the code goes onto a queue and a separate worker judges it in a sandbox that meets the nine minimums, each with an attack submission that runs in CI
- **Hard rules first, then the model**, with its output checked against a schema and a time limit; the verdicts, with evidence, land in the TA's review queue and never reach a student without the TA
- **The checker command** with a Dockerfile and the model-off switch `MODEL_OFF=1`, and a first committed run on the dev set
- **A public deployment from here on:** keep it running until the PA#4 marks are out, because another team attacks it in PA#4. `PA3.md` holds the URL, the test accounts, the CI run and a recording of up to 5 minutes
- **The syllabus rule:** if a model verdict reaches a student's mark with no TA in between, or the model's output is used with no schema check and no time limit, criteria 4, 5 and 6 score 0

| # | Criterion | Points |
| --- | --- | --- |
| 1 | The flow, end to end, on your deployment | 15 |
| 2 | Queue and sandbox | 20 |
| 3 | Hard rules first | 15 |
| 4 | The model judges the semantic constraints | 20 |
| 5 | First limits, and the review queue | 10 |
| 6 | The checker command and a first eval | 10 |
| 7 | Tests first, one part per commit | 5 |
| 8 | `AI-LOG.md` | 5 |

---

## PA#4 — Eval, guardrails, human gate and red-team · 7% · due Wednesday, December 2

- **The eval gates CI:** a required check on `main` that runs your checker on the dev set and at least 10 cases of your own with the real model, then `eval.mjs`; a pull request it blocked; three repeated runs of one commit
- **The held-out run:** we run your checker command once on the held-out set; the thresholds of section 3 of the brief (0 wrongful deductions, recall ≥ 90%, `unsure` ≤ 20%) decide the band
- **The five guardrails** of section 3, each with a test that uses a fake model, **and the human gate:** Publish refused by the API while any queued verdict is unreviewed
- **A red-team report** on the deployment of the team the lecturer assigns you, at least 8 attacks across at least 5 categories
- Hand in also `PA4.md` (with the section *Where we stop it*) and `marking.env`, attached beside the zip, never in git

| # | Criterion | Points |
| --- | --- | --- |
| 1 | The eval gates CI | 20 |
| 2 | The held-out run | 20 |
| 3 | The guardrails of section 3 | 20 |
| 4 | The human gate | 15 |
| 5 | Red-team report on another team | 20 |
| 6 | `AI-LOG.md` | 5 |

---

## PA#5 — Final build, running and observed · 3% · due Wednesday, December 16

- **The final build**, tagged `pa5`, on a public deployment over HTTPS that shows its commit, up through the marking window (Thursday, December 17 to Wednesday, December 23) and until your PA#6 slot
- **Publishing, appeals and real-time results**, which we walk through ourselves; **logs, metrics and traces** with one SLO and an alert that has fired
- **A load test** of 80 submissions from 80 student accounts within 10 seconds, which we run again; **one incident post-mortem** of a real event
- Hand in also `PA5.md`, `load/RESULT.md`, a walkthrough recording of at most 10 minutes (it is also the fallback for PA#6), and `ACCESS.md` in the zip but never committed

| # | Criterion | Points |
| --- | --- | --- |
| 1 | A public deployment of `pa5` | 10 |
| 2 | Publishing, appeals and real-time results | 20 |
| 3 | Logs, metrics and traces | 20 |
| 4 | Load test: 80 submissions at once | 20 |
| 5 | One incident post-mortem | 20 |
| 6 | `AI-LOG.md` | 10 |

---

## PA#6 — Final demo and individual oral · 15% · sessions 14–15, Thursday, December 24 and Thursday, December 31

- **Before your slot**, by Monday, December 21, 22:00: commit `OWNERS.md` (who built which part, and what your team built beyond the brief) and post the link to that commit on the PA#6 assignment. Keep the deployment running `pa5` until your slot
- **In your slot**, 08:20–11:50 in cs2:G202, the team runs the final build through its main flow, then the examiners question each member on the team's own code and decisions. The examiners are this class's teaching assistant and lab instructors
- **Each member gets one mark out of 100, in two parts: the final build, 40 points, the same for the whole team** (table below), and **your explanation, 60 points, for each member.** The assistant stays closed while you answer; the repository, terminal, tests and dashboards stay open. Nobody asks you to write code, from memory or on paper
- There is no `SELF_ASSESSMENT_REPORT.md` and no honesty adjustment in PA#6

| # | The final build — 40, for the team | Points |
| --- | --- | --- |
| B1 | The eleven features F1–F11, each on the running build: 2 if it works, 1 if only in part, after a retry or only in the recording, 0 if missing or faked | 22 |
| B2 | The deployment runs `pa5`; a reload at two points keeps the data; the Network tab shows the requests | 4 |
| B3 | Two rules we name from the feature table, tried as failure cases and stopped by the server (1 instead of 3 if only the screen stops it, or only a test shows it) | 6 |
| B4 | One screen or endpoint of another role, another class or another student, refused by the API | 4 |
| B5 | What your team built beyond the brief, listed in `OWNERS.md`: 4 if it works and a test checks it, 2 if it works but nothing checks it | 4 |

| Points | Your explanation — 60, for each member |
| --- | --- |
| 51–60 | Correct and specific across what you are asked: you find the place on screen without help, point at the file, line, commit, log or trace, and handle follow-ups, including on the LLM feature, the guardrails and the human gate. |
| 39–50 | Mostly correct, but you need hints to find the place, stay general, or answer the follow-ups only in part. |
| 24–38 | Partly correct: you read code aloud without explaining it, or describe what it should do and get what it actually does wrong. |
| 9–23 | Mostly wrong, or "the assistant wrote it" with no explanation. |
| 0–8 | You cannot explain the parts you built, or you are absent without a documented reason. |

Code you cannot explain counts against your explanation points, even if it runs, whoever or whatever wrote it. It does not change your team's marks for PA#2 to PA#5, nor the build points.
