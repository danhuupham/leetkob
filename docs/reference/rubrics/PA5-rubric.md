# PA#5 — Final build, running and observed · rubric

**CSC13114 · project milestone, teams of up to 3 · 3% of the course · 100 points**

The product is LeeTKOB: read the class brief again before you start. This checkpoint marks the product finished and running where strangers can reach it, and whether your team can see what it is doing: when 80 students submit in the last minute before a deadline, and when something breaks.

Use your assistant for all of it. What we mark is what we can see ourselves: the public URL, a walkthrough we do on it, the trace of a request we make, a load test we run again, and a post-mortem we can check against your logs and commits.

The review queue and the gate before Publish were marked in `PA#4`. Here they only have to keep working, so that we can get to publishing and appeals.

**Due Wednesday, December 16, 2026, 22:00.** One submission per team.

**Marking window: Thursday, December 17 to Wednesday, December 23, 2026, 22:00.** Keep the deployment up, and running the commit tagged `pa5`, until the window closes.

---

## What is scored

| # | Criterion | Points |
| --- | --- | --- |
| 1 | A public deployment of `pa5` | 10 |
| 2 | Publishing, appeals and real-time results | 20 |
| 3 | Logs, metrics and traces | 20 |
| 4 | Load test: 80 submissions at once | 20 |
| 5 | One incident post-mortem | 20 |
| 6 | `AI-LOG.md` | 10 |

---

## 1. A public deployment of `pa5` — 10 points

Any host is fine, free tiers included. We need a URL that answers over HTTPS during the marking window, and the accounts in `ACCESS.md` (see *What you hand in*).

| Points | What it looks like |
| --- | --- |
| 9–10 | Up on both our attempts. A version endpoint or page footer shows the commit hash of `pa5`. The accounts in `ACCESS.md` work for every role. `PA5.md` says how the deployment is made (one command or the host's documented steps), where each environment's configuration lives, and how to go back to the previous release. |
| 5–8 | Up on both attempts, but the version is not shown or is not `pa5`, or an account is missing, or there is no documented way back. |
| 1–4 | Up on only one of our two attempts, or served over plain HTTP. |
| 0 | Down on both attempts (see *If your deployment is down*). |

A tunnel to a team member's machine counts if it is up when we try. It usually is not.

---

## 2. Publishing, appeals and real-time results — 20 points

We do this walkthrough ourselves on your deployment, with the accounts in `ACCESS.md` and C++ solutions we bring:

1. As a TA, create a lab with tests and two constraints, one that a hard rule decides and one for the model, each with a deduction.
2. As student 1, submit a compliant solution. As student 2, submit one that breaks a constraint. Watch the judge status on each student's page. Then, as student 2, try to appeal before the lab is published.
3. As the TA, work through the review queue and press Publish.
4. As each student, read the published mark and the deduction.
5. As student 2, appeal. As the TA, reject it with a reason; then, if your product owners' FAQ allows it, reopen and accept it.
6. As student 1, try to appeal student 2's submission.

Where the brief is silent (what a student sees before publishing, whether an appeal can be reopened), your deployment follows the product owners' FAQ. Cite the entries you rely on in `PA5.md`.

| Points | What it looks like |
| --- | --- |
| 18–20 | Every step works as the brief and the FAQ describe. The judge status changes on the student's page **without a reload**, from queued to the final result. After publishing, an accepted appeal changes the published mark and keeps a record of who decided, when and why; a rejected appeal shows its reason to the student. The early appeal in step 2 and the appeal in step 6 are refused, with the errors your contract names. |
| 12–17 | Every step works, but one is rough: the status needs a reload, an appeal decision keeps no reason or no author, or a step departs from the FAQ with no cited decision. |
| 5–11 | Publishing works, but appeals are missing or broken; or results appear only after a reload and one more step fails. |
| 0–4 | The walkthrough cannot get past submitting and judging on the deployment. |

---

## 3. Logs, metrics and traces — 20 points

Any tools are fine: a hosted free tier, a self-hosted stack, or pages you built. Give us read-only access in `ACCESS.md`. During the walkthrough we note the id of a submission and the time, then:

- find every log line for that submission by one id;
- open its trace, which should run from the HTTP request through the queue, the judge in the sandbox, the hard rules and each model call to the stored verdict;
- open the dashboard: request rate and errors, queue depth and the age of the oldest job, judge time, model calls (count, latency, errors and timeouts), the share of `unsure`, and model spend against your cap;
- read the service level objective (SLO) written in `PA5.md`, and the alert that watches it.

| Points | What it looks like |
| --- | --- |
| 18–20 | All of the above. Log lines are structured (level, time, service, id). The trace crosses the queue into the worker and shows the duration of each step, and the model span shows the model and its tokens or cost. One SLO, for example *95% of submissions get a judge result within 60 seconds*, with an alert on it that has **fired at least once**: a notification or alert history whose time matches your logs. |
| 12–17 | Logs and dashboard as above, but the trace stops at the queue, or there is no SLO or no alert, or the alert never fired, or model spend is missing. |
| 5–11 | Searchable logs and some metrics, no traces. |
| 0–4 | Console output only, or we cannot get in with the access you gave. |

The model API key, or a student's name or ID inside a logged prompt, in any log line we can read: this criterion scores at most 4.

---

## 4. Load test: 80 submissions at once — 20 points

The brief asks LeeTKOB to hold up when 80 submissions arrive in the last minutes before a deadline. Put the load script in `load/`, with a `Dockerfile`, so that it runs as a container given only the base URL and the credentials it needs. Write the exact command in `PA5.md`.

The script must use **80 different student accounts**, each submitting once to the same lab, all 80 sent within 10 seconds. It reports, for the run: how many submissions were accepted, how many reached a final judge result, how many failed and with what status, how many were created twice, the time from submitting to the judge result (p50 and p95), how long the queue took to drain, how many submissions reached the model, and what those calls cost.

Hand in `load/RESULT.md`: the date and time of your run, the URL and commit it ran against, the script's output, a dashboard screenshot from criterion 3 taken during the run, what saturated first (judge workers, CPU, memory, the model's rate limit), and what you changed because of it.

**We run it again.** Once in the marking window, against your public deployment, with your script in a container that has no mounts and only network access. We stop it after 15 minutes, whatever state it is in. The model calls in our run go through your key, like your own runs; your cost cap per lab protects you, and a cap that turns reviews into `unsure` is the cap doing its job. Say so in `RESULT.md` if it happens to you.

The sandbox minimums in section 5 of the brief stay on during the test. A load test run with the sandbox switched off scores 0–4.

| Points | What it looks like |
| --- | --- |
| 18–20 | In our run, 80 of 80 submissions reach a final judge result within 15 minutes, none created twice, no 5xx. A 429 that your script retries, ending in exactly one submission, is fine. `RESULT.md` names what saturated first, with the screenshot, and links the commit you made because of it. |
| 12–17 | 80 of 80 in our run, but `RESULT.md` does not say what saturated, or our p95 is more than twice yours and `RESULT.md` gives no reason. |
| 5–11 | Up to 8 submissions lost, failed or duplicated, or the queue does not drain within 15 minutes, and `RESULT.md` reports it honestly. |
| 0–4 | More than 8 lost, failed or duplicated; the script does not run; or there is no result. |

A submission the server refuses, and that never reaches the queue, is a lost submission: in real life it is a student who missed the deadline. If our run and `RESULT.md` disagree, we score our run and say so in the feedback.

---

## 5. One incident post-mortem — 20 points

Something has gone wrong in your system this semester: a deployment that broke, a queue that stuck, a model quota that ran out, a sandbox killed during the load test. Pick one and write it up in `docs/postmortem/<YYYY-MM-DD>-<slug>.md`, with these sections:

1. **Summary:** two or three sentences.
2. **Impact:** who was affected, how many, for how long, and whether any mark was wrong at any point.
3. **Timeline:** times with time zone, from the first sign to resolved. Each entry points at its evidence: a log line, an alert, a commit, a CI run, a message.
4. **Detection:** how you found out, how long after it started, and whether your alert from criterion 3 would catch it today.
5. **Root cause:** the mechanism, with evidence. "Human error" or "the assistant made a mistake" is where the analysis starts, not where it ends.
6. **Fix:** the commit or pull request, and how you checked that it worked.
7. **Follow-up:** actions, each with an owner and a status.

It must be a real event in your system, in any environment: production, staging, CI or a load test. A fault you injected on purpose to rehearse counts if the first line of the post-mortem says so. Commits rewritten after the event do not count as timeline evidence.

| Points | What it looks like |
| --- | --- |
| 18–20 | All seven sections. Every timeline entry points at evidence, and the times match your git history and logs. The root cause is a mechanism we can follow in the evidence. The fix links a commit and a check that shows it worked. At least one follow-up is done and linked, and one changes how you would detect it (an alert, a metric, a test). |
| 12–17 | A real incident, all sections present, but fewer than half the timeline entries have evidence, the root cause stops at the first "why", or the follow-ups have no owner or status. |
| 5–11 | What happened and the fix, but impact or detection is missing, or we cannot match the evidence to your logs or commits. |
| 0–4 | Missing, a template still holding placeholder text, or an event we cannot find anywhere in your logs or commits. |

An incident that did not happen scores 0 here, and counts as a claim with no evidence for the honesty adjustment.

---

## 6. AI-LOG.md — 10 points

| Points | What it looks like |
| --- | --- |
| 9–10 | Entries for this checkpoint's parts: deployment, dashboards and alerts, the load script, the post-mortem. Real *Changed / Rejected* lines, including at least one thing your assistant got wrong and the check or log line that caught it. Examples: a load script that sent the 80 requests one after another, an alert that could never fire, a drafted timeline that did not match the logs. The model you run in production, and what one lab **actually** cost, read from your metrics. |
| 5–8 | Tools listed per part; *Changed / Rejected* are generic, or the cost is an estimate rather than a measurement. |
| 1–4 | Copied from `PA#4` with no new entry. |
| 0 | Missing. |

`Tool: none` is a valid entry if your team chose not to use one.

---

## If your deployment is down when we mark

- We try twice, on different days of the marking window, at least 6 hours apart. Each attempt waits up to 60 seconds for a cold start. We note the time and the error we got.
- **Down on one attempt:** criterion 1 scores at most 4. Everything else is marked from the attempt that worked.
- **Down on both:** criterion 1 scores 0. Criteria 2 and 3 are marked from your walkthrough recording, and criterion 4 from your own `RESULT.md`; each of the three scores at most its second band (17, 17 and 17).
- We do not mark a copy running on our machines or yours.
- A fix deployed after the deadline does not count. If the version you show is not `pa5`, criteria 2 and 3 are marked from the recording.

The recording costs you nothing if your deployment stays up, and it is the only fallback if it does not.

---

## What you hand in

1. Tag the commit you are submitting `pa5` and push the tag. The repository stays **public**.
2. Put `PA5.md` at the root, with: the public URL and the version endpoint; how to deploy and how to go back to the previous release; the FAQ entries you rely on; the link to your observability tools; the SLO and its alert; the load-test command and a link to `load/RESULT.md`; a link to the post-mortem.
3. **The walkthrough recording:** one continuous screen recording, at most 10 minutes, of the six steps of criterion 2 on the public URL, made after you tagged `pa5`. Put the link (an unlisted video is fine) in `PA5.md`. It is not scored by itself.
4. `ACCESS.md`, **in the zip but never committed** (list it in `.gitignore`): the accounts for each role, the second student, and read-only access to your observability tools. Use accounts made for marking, never a real password of yours.

---

## How to submit

One zip file of the repository **including `.git`**, named after your student IDs in ascending order, joined by `-`, and **the total you give yourself**: `<StudentID1>-<StudentID2>-<StudentID3>_<total>.zip`, for example `23120001-23120002-23120003_84.zip`. One member turns it in, from their `<StudentID>@student.hcmus.edu.vn` Google account.

The zip must contain `SELF_ASSESSMENT_REPORT.md`: one row per criterion in this rubric, the marks you claim, and evidence pointing at a file, a commit, a PR, a CI run, a dashboard or a line range of a log. Add a short *what we did not manage*. The total in that table is the number in the file name. Template on Classroom.

A wrong file name costs no marks but delays your result: the grading script matches submissions to the class list by that name.

**Late work:** up to 2 hours late loses 20% of the mark, 2 to 24 hours late loses 50%, and work more than 24 hours late is not accepted. The late factor applies after the honesty adjustment.

---

## Honesty adjustment

Your self-assessment is compared with the mark you actually earn. The gap is `your total − the mark`, on the same 100-point scale.

| Gap | Adjustment |
| --- | --- |
| within ±10 | none — this is normal calibration |
| +11 to +20 | −3 |
| +21 to +30 | −6 |
| more than +30 | −10 |
| −21 or worse | −3 — read the rubric before you score yourself down |
| no `SELF_ASSESSMENT_REPORT.md` | −10, and the file-name total is ignored |

A criterion you claim with no evidence line counts as claimed-and-not-done for this comparison. The adjustment never takes a submission below 0.

---

## How the 100 becomes your course mark

`PA#5` is 3% of the course: 100 points here are worth 3% of your course mark, and 80 points are worth 2.4% (0.24 on the 10-point scale).
