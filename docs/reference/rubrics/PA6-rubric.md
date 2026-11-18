# PA#6 — Final demo and individual oral · rubric

**CSC13114 · project milestone · teams of up to 3 · one mark for each member · 15% of the course · 100 points**

**When:** Thursday, December 24 and Thursday, December 31, 2026, 08:20–11:50, in the lecture room (cs2:G202). Each team has one slot. The order of teams and the slot times are posted on Classroom by Monday, December 21, 2026. In your slot, the team runs the final LeeTKOB build through its main flow, then the examiners question each member on the team's own code and decisions.

**The examiners are this class's teaching assistant and lab instructors**, one table each, working in parallel. The slot list says which table your team goes to.

**Each member receives one mark out of 100, in two parts:**

- **The final build — 40 points, the same for every member of the team.** The examiners check the build you demo against a fixed list (*The final build*, below): the eleven features of LeeTKOB (*The features you must implement*), the build you handed in with real data, failure cases, roles, and what you built beyond the brief.
- **Your explanation — 60 points, for each member.** There is no fixed number of questions or points per question; the examiners decide what to ask, and of whom. Members of the same team can get different marks.

The build is the one you handed in with `PA#5`; there is nothing new to build for this milestone. `PA#3`, `PA#4` and `PA#5` scored its parts one at a time. Here we score the whole product working together, and the questions find out what each of you can explain about it: your code, your commits, your decisions, your eval and guardrails, your incident, including the parts your assistant wrote and the reasons you kept them. Nothing here asks you to write code, on paper or anywhere else, or to recall it from memory.

---

## Before your slot

Commit `OWNERS.md` to your repository and post the link to that commit on this assignment by **Monday, December 21, 2026, 22:00**. It has two tables:

| Part of LeeTKOB | Who built it | Main commits or pull requests |
| --- | --- | --- |
| e.g. the queue and the judge worker | e.g. 23120002, with 23120003 on retries | links |

| Beyond the brief | Where to see it | The test that checks it |
| --- | --- | --- |
| e.g. a diff of a student's resubmission for the TA | the review queue | link |

The first table is not scored; it helps us choose questions about the parts you built. Without it, we choose from `git log` alone. The second is what we check for B5; leave it empty if there is nothing.

**Keep your deployment running the commit tagged `pa5` until your slot.** The `PA#5` marking window ends on December 23; `PA#6` needs the deployment too. Your `PA#5` walkthrough recording is the fallback if it does not answer (see *When the build cannot run*).

---

## What to bring

- **One laptop per team**, charged, with its charger and an adapter for an HDMI projector, with your repository cloned, the tag `pa5` checked out, and your tests, the eval and the checker's command line (brief section 6) ready to run. A second member's laptop, signed in the same way, is the first fallback.
- **The deployment already open** before you walk up: one browser window per account, signed in — the admin, the TA, two students in that TA's class, and a TA of another class — and your observability tools one click away.
- **A phone hotspot.** Do not count on the room's network.
- Your student ID card.

You may start from seed data: the accounts, the classes and other labs. The lab of the demo, its submissions, and everything that happens to them are created in front of us.

---

## How the slot runs

| Part | Time | Who |
| --- | --- | --- |
| Check the build | 1 min | We open the version endpoint or page footer of your deployment, and run `git log -1 --format=%H` on the laptop |
| Main flow and the other features | 8 min | The team, every role; we ask for the features the flow did not show, and for the reloads |
| Build checks | 2 min | We name two rules to try as failure cases, and one role or ownership check |
| Questions | about 4 min per member | The examiners, one member at a time |

A team of three takes about 23 minutes; a team of two, about 19. Be at the room from the start of your session: when a slot ends early, the next one starts. The examiners may ask questions during the demo too. Your teammates stay in the room and stay quiet while a member answers.

---

## The features you must implement

These are the features of LeeTKOB that your build must have. They come from the scope in section 4 of the brief and from the criteria of `PA#3`, `PA#4` and `PA#5` named after each one; the last column names the rules that apply to it. In the slot, the main flow below shows most of them; we then ask for any feature the flow did not show.

| # | Feature | Who | What must work | Rules |
| --- | --- | --- | --- | --- |
| F1 | **Accounts, roles and classes** (brief 4.1; `PA#3` 1) | Admin, TA, Student | Accounts for the three roles; TAs belong to classes and each lab belongs to a class; each role sees only its own screens. A TA of another class cannot see a lab or its review queue. | T1 |
| F2 | **A lab with tests and constraints** (`PA#3` 1; `PA#5` 2) | TA | A lab in the TA's own class: its statement, its tests, and its constraints, each with the deduction the TA chose, one decided by a hard rule ("Do not use…") and one for the model. | T1 |
| F3 | **Submit and judge, in real time** (brief 4.2; `PA#3` 1–2; `PA#5` 2) | Student | A C++ submission goes onto a queue and a separate worker judges it against the TA's tests. The status on the student's page changes from queued to the final result without a reload. | Q1 |
| F4 | **The sandbox** (brief 5; `PA#3` 2) | Pipeline | Compiling and running happen inside the sandbox, and the nine minimums of the brief hold, each with an attack submission in your repository that runs in CI. | M1–M9 |
| F5 | **Hard rules first** (brief 3; `PA#3` 3) | Pipeline | Ban-list constraints are decided by syntax-aware code. The traps do not fire: the student's own `sort`, a banned name in a comment or a string, `<algorithm>` included only for `std::swap`. The model is not called for a constraint a hard rule decided. | D1 |
| F6 | **The model judges the semantic constraints** (brief 3; `PA#3` 4) | Pipeline | A real model, sent only the statement, the constraints and the code with comments and the student's identity removed, returns `pass`, `violation` or `unsure` for each constraint, with evidence lines. Nothing in its output sets a deduction. | G5 |
| F7 | **Guardrails on the model's output** (brief 3; `PA#3` 5; `PA#4` 3) | Pipeline, TA | Output that fails the schema, evidence that does not match the code, a timeout, and the cost cap per lab each turn the verdict into `unsure`, and the TA sees why. An injection submission ends as `violation` or `unsure`, never `pass`. | G1–G4 |
| F8 | **The review queue and Publish** (brief 3; `PA#3` 5; `PA#4` 4) | TA | The queue holds every `violation`, every `unsure` and a random 10% of the `pass` verdicts, each with its evidence and the TA's deduction. The TA reviews them and presses Publish, the only action that makes a deduction visible to a student. | H1–H3 |
| F9 | **Published marks and appeals** (brief 4.4; `PA#5` 2) | Student, then TA | After Publish, each student reads the mark and the deduction. A student appeals; the TA rejects it with a reason the student sees, or accepts it and the published mark changes. | A1–A3 |
| F10 | **The checker command and the eval gate** (brief 4.5, 6; `PA#3` 6; `PA#4` 1) | Team | One command line writes the prediction file from a dataset folder, with the model-off switch `MODEL_OFF=1`. A CI job runs the checker on the dev set and your own cases, then `eval.mjs`, and is a required check on `main`. | — |
| F11 | **Logs, metrics and traces** (`PA#5` 3) | Team | For a submission made in front of us: every log line by one id; its trace from the request through the queue, the sandbox, the hard rules and each model call to the stored verdict; the dashboard; the SLO and its alert. | — |

**The rules, by label.** For B3 we name two of the rules that can be tried on the running build.

| Label | Rule | From | Tried on the running build |
| --- | --- | --- | --- |
| T1 | A TA of another class cannot see a lab or its review queue | `PA#3` criterion 1 | a direct request |
| Q1 | A submission made while the worker is stopped is judged exactly once after it starts again | `PA#3` criterion 2 | stop the worker, submit, start it |
| M1–M9 | The nine sandbox minimums: M1 no network; M2 CPU time; M3 a wall-clock limit that kills the container; M4 memory, swap included; M5 processes; M6 output size; M7 a non-root user; M8 no host mounts and no Docker socket; M9 no secrets | `PA#3` criterion 2; brief 5 | an attack submission from your repository |
| D1 | Hard rules decide the ban-list constraints, the traps do not fire, and the model is not called for them | `PA#3` criterion 3 | a trap submission, then the call log |
| G1–G5 | The five guardrails: G1 schema; G2 evidence; G3 timeout; G4 cost cap per lab; G5 no deduction from the model | `PA#4` criterion 3 | G4 and G5 (a lab with a low cap, an injection submission); G1–G3 only by their tests, so they are not named for B3 |
| H1–H3 | The human gate: H1 the sample of passes is random and drawn by the server; H2 Publish is refused by the API while any queued verdict is unreviewed; H3 Publish is refused for a student and for a TA of another class | `PA#4` criterion 4 | direct requests |
| A1–A3 | Appeals: A1 refused before publishing; A2 refused on another student's submission; A3 a decision keeps who, when and why | `PA#5` criterion 2 | on the running build |

The load test (brief 4.6) is scored in `PA#5` only, not in the slot.

---

## The final build — 40 points, for the team

The demo is scored against the list at the end of this section. Every member of the team gets the same build points. The demo is also where the questions start.

**The main flow, on your deployment.** It is the walkthrough of `PA#5`, criterion 2, one lab from creation to an appeal: as a TA, create a lab with tests and two constraints, one that a hard rule decides and one for the model, each with a deduction (the dev-set problem `sort-merge` is fine) → as student 1, submit a compliant solution; as student 2, one that breaks a constraint; watch the judge status change on each student's page → as student 2, try to appeal before the lab is published → as the TA, open the review queue: the verdicts, their evidence lines and your deductions; try Publish while a verdict is unreviewed, then review them and press Publish → as each student, read the mark and the deduction → as student 2, appeal; as the TA, reject it with a reason, or accept it → open the logs and the trace of student 2's submission. We may hand you one more submission to send, for example an injection case. Where the brief is silent, your product follows the product owners' FAQ; name the entries you rely on.

Each account works in its own signed-in window, on the real deployment: when we ask you to reload, the data is still there, and the Network tab shows the requests to your API. Screens, layout, wording and architecture are your team's choice: we look at whether each feature works, not at how it looks.

**Failure cases.** We name two rules from the table above, for example: an attack submission from your repository that tries the network or reads the environment (M1, M9); a trap submission whose own `sort` must not be flagged (D1); an injection submission that asks for `pass` (G5); Publish with a verdict still unreviewed, sent as a direct request (H2); an appeal before publishing (A1). The server should stop it the way the rule says, with a message or an error that says what went wrong, and after a reload the data should be unchanged — stopped by the server, not only by a hidden button.

**The build you handed in.** Your deployment runs the commit tagged `pa5`, and its version endpoint or page footer shows that hash. Tell us before you start about any small change (a configuration value, a seed). A bug fixed after the `PA#5` deadline is not part of the demo: if the deployment runs a later commit, deploy `pa5` again before your slot, or run `pa5` on the laptop; you may tell us about the fix when you are questioned. If your `PA#5` was not accepted (more than 24 hours late), you demo the latest commit, and we note that it is not a build you handed in.

| # | We check | Points |
| --- | --- | --- |
| B1 | **The eleven features F1–F11** (table above), each shown on the running build, in the account's own signed-in window. 2 for a feature that works; 1 for one that works only in part, only after a restart or a second try, or only in the recording; 0 for one that is missing or faked (a status set in the front end, a stub instead of the real model, a row edited by hand in the database, a verdict typed in) | 22 |
| B2 | **The build you handed in, with real data:** the version endpoint or footer shows the commit of `pa5`; when we ask, a reload at two points keeps the data, and the Network tab shows the requests to your API | 4 |
| B3 | **Two rules** from the last column of the table, which we name and you try as a failure case: stopped by the server the way the rule says (an attack submission fails, a verdict ends as `violation` or `unsure`, a request is refused with the error your contract names), and the data unchanged after a reload. 3 each; 1 when only the screen stops it, or when only a test shows it | 6 |
| B4 | **Roles and ownership:** we try one screen or endpoint of another role, another class or another student, by its URL or with `curl`; the API refuses it | 4 |
| B5 | **Beyond the brief:** what your team built that the brief does not ask for, listed in `OWNERS.md`. 4 for one that works on the running build and has a test that checks it; 2 if it works but nothing checks it; 0 if there is none | 4 |
| | **Total** | **40** |

A behaviour taken from the product owners' FAQ is not "beyond the brief": it is part of the feature it belongs to. The build points are the same for every member of the team, including a member whose part is not the one that failed.

---

## What you may be asked about

Anything in your team's repository and your team's decisions — not lecture theory; that is what the exam is for. The examiners choose the questions, how many, and which part of the system each member is asked about. They prepare from your repository at `pa5`, its `git log`, `AI-LOG.md`, the post-mortem and `OWNERS.md`, and they may ask follow-ups on anything you say or anything the demo showed. Each member gets different questions.

| Area | What the questions are about |
| --- | --- |
| A | Read your code |
| B | Why your team decided it |
| C | How you know it works |
| D | The LLM feature on a given input |

The examples under each area show the kind of question; they are not a fixed list, and a member is not necessarily asked about every area.

### A. Read your code

We point at a commit, a diff or a few lines **you** built, or a line the demo just ran, and ask what they do.

- *What does this line do, and what breaks if we delete it?*
- *This commit changed the retry of the judge worker. What did it do before?*
- *Walk one submission from the upload to the review queue: which file handles each step?*

A strong answer says what the code **does**, not what it was meant to do, and what would break without it.

### B. Why your team decided it

A decision your repository shows, and the alternative you did not take.

- *Your own containers or Judge0: why, and what does your choice cost you?*
- *How do real-time results reach the browser? What else did you consider?*
- *Your endpoint contract returns this status for this error. Why this one, and what does a client do with it?*
- *Which product owners' FAQ answer did you rely on here, and what would you have built without it?*

A strong answer names the alternative you actually considered, gives a reason with a fact from your own system (a number, a limit, an incident), and says what the choice costs or what would make you change it. "It is popular" or "it is faster", with nothing measured, is weaker. "The assistant chose it" is weaker still.

### C. How you know it works

On a part **you** built, on a step of the demo, or on the incident in your post-mortem.

- *Which test, check, eval case, CI run or log line shows that this works? Show it.*
- *What did your assistant get wrong in this part, and what caught it? (Your `AI-LOG.md` and commits are the starting point.)*
- *In your incident, which signal came first, and which log line or trace led you to the cause?*

A strong answer points at the exact check and shows it running or its CI run, says what mistake it would catch, and retraces the incident from detection to cause with the actual logs or traces. "We tried it and it worked" or "CI is green", without saying what CI checks for this part, is a weak answer.

### D. The LLM feature on a given input

The examiners may give you an input file: an Accepted C++ submission and the lab's constraints. You may read your code first. Then:

1. Say what your system will do with it: which hard rule fires, whether the model is called and for which constraint, the verdict and its evidence lines, which guardrail applies, whether it lands in the review queue, and what the TA must do before marks are published.
2. Run it through your checker's command line.
3. Explain any difference between what you said and what happened.

*Follow-ups: Why does the human gate sit at Publish and not on every verdict? Who pays if this verdict is wrong after publishing, and how much?*

A strong answer matches the run, or explains the difference from the code; says why the gate sits where it does and not elsewhere; and says who pays when this verdict is wrong. "A human checks everything" is not a reason for where the gate sits.

If the examiners give you an input, the run uses your model key, once.

---

## Your explanation — 60 points, for each member

The examiners give each member the points in the band that best describes that member's whole turn. How they get there — how many questions, which areas, how much a follow-up weighs — is theirs to decide.

| Points | What it looks like |
| --- | --- |
| 51–60 | Correct and specific across what you are asked. You find the place on screen without help and point at the file, line, commit, log or trace you are talking about. You handle follow-ups, including on the LLM feature, the guardrails and the human gate. |
| 39–50 | Mostly correct, but you need hints to find the place, stay general, or answer the follow-ups only in part. Or you explain correctly why a step of the demo failed. |
| 24–38 | Partly correct: you read code aloud without explaining it, or describe what it should do and get what it actually does wrong. |
| 9–23 | Mostly wrong, or "the assistant wrote it" with no explanation. |
| 0–8 | You cannot explain the parts you built, or you are absent without a documented reason. |

A step of the demo that failed is counted in the build points, not here; here we score the explanation, including your explanation of why it failed.

---

## How you answer

- You may open any file, search, run `git log`, `git blame` and `git diff`, run the tests, the eval and the checker, and open your deployment and dashboards.
- **The assistant stays closed during your turn:** what we mark is your own explanation of the system, which is the one thing the syllabus keeps supervised. Everything else on the laptop stays open.
- Ask us to repeat or rephrase a question at any time.
- *"I don't know, but this is where I would look"*, followed by looking and finding it, is a real answer and earns marks. A confident guess does not.
- **Nobody asks you to write code**, from memory or on paper. If a question asks what you would change, say it and point at the line.
- **Teammates do not answer for you.** An answer from a teammate counts for nothing, and you get a different question instead.

---

## What we write down

For every team the examiner records the build checks and the reason for every build point lost; for every member, what was asked (the file, line, commit or log entry), the explanation points, and **the reason for them**. That sheet is the record of your oral. Your result email gives your mark and those reasons.

Questions about your mark: reply to the result email within 7 days. We answer from the sheet.

---

## Absence, lateness, and when the build cannot run

- A team that is not ready when its slot is called moves to the end of that session's list, once.
- A member not present for the team's slot scores 0, unless they send a documented reason (a medical certificate, or a clash on the official exam timetable) before the slot or within 2 working days after it. They then get one new slot, keep the team's build points, and are questioned in that slot.

When the build cannot run:

1. If the laptop fails, switch to the second laptop, signed in the same way.
2. If the deployment does not answer within 3 minutes (a cold start counts), the questions go ahead on time (we read the code on the laptop), and the team gets one retry at the end of the same session, on the deployment or on `pa5` running on the laptop.
3. If the retry fails too, we play your `PA#5` walkthrough recording, and for a failure case you show us the line in the code where the rule is enforced and its test. A feature that the recording shows but the build could not run earns 1 of its 2 points; a rule shown this way earns 1 of its 3; a check the recording cannot show (B2, B4) earns none.

---

## What the oral does not change

The syllabus says that **any part of the project that a student cannot explain earns no marks, even if it works.** In this course that rule works through this mark: what you cannot explain counts against your explanation points. Your team's `PA#2` – `PA#5` marks and the build points do not change because of the questions.

The product owners are examined the same way, on the same scale, as every other team.

---

## Nothing to self-assess

There is no zip, no total in a file name and no `SELF_ASSESSMENT_REPORT.md` for `PA#6`, so there is no honesty adjustment: nothing in it is self-scored. The only thing you post on this assignment is the link to `OWNERS.md`. The product owners' bonus (brief, top) is added separately and is not part of this rubric.

---

## How the 100 becomes your course mark

Each member's mark is `build points + explanation points`, out of 100. `PA#6` is 15% of the course: `mark / 100 × 15`. A member whose team scores 34 for the build and who scores 48 for the explanation has 82, and earns 12.3 of the 15 percentage points (1.23 on the 10-point scale). Members of one team share the build points and can receive different marks.

---

## Notes

- Same team as `PA#5`.
- Prepare by reading your own repository: your commits, the `AI-LOG.md` entries for your part, the post-mortem, and the code of the main flow, your teammates' parts too. Rehearse the demo once from a cold start, on the deployment and the laptop you will bring.
- Commit under your own name during the semester. Questions about *your* commits start from `git log --author`, and commits under a teammate's name are their questions, not yours.
- A question on a line your assistant wrote is a normal question: the code in your repository is your team's code.
