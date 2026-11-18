# PA#3 — Prototype with the LLM feature running · rubric

**CSC13114 · project milestone, teams of up to 3 · 7% of the course · 100 points**

The product is LeeTKOB: read the class brief again before you start, sections 3 to 7. This checkpoint marks the first time the whole pipeline runs for real. A TA creates a lab with constraints. A student submits, and the code is judged in the sandbox through the queue. The Accepted submission goes through the hard rules and then the model. The verdicts, with their evidence, appear in the TA's review queue, and nowhere else.

Use your assistant for all of it. What we mark is what we can see: on your deployment, in your repository, and in the runs we repeat ourselves. Section *What we run when marking* says exactly which.

**Due Wednesday, November 25, 2026, 22:00.** One submission per team, same teams as `PA#2`.

---

## What is scored

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

**The syllabus rule.** A feature that calls a model and displays the result directly, with no eval, no limits and no human confirmation, does not count as completing `PA#3`, however well the demo runs. Here that means: **if a model verdict changes a student's mark or reaches the student as a deduction with no TA in between, or if the model's output is used with no schema check and no time limit, criteria 4, 5 and 6 score 0.**

---

## 1. The flow, end to end, on your deployment — 15 points

We sign in with the accounts in `PA3.md`. As a TA, we create a lab in our own class from the dev-set problem `sort-merge`: its statement, its tests, and its two constraints with their deductions. As a student, we submit three of its solutions: one compliant, one violation, one injection case. Then we open the TA's review queue.

| Points | What it looks like |
| --- | --- |
| 13–15 | Every step above works on the deployment, through the product's own screens or API. Each submission goes from queued to judged, and the student sees the result. The review queue shows, for each submission and each constraint, the verdict, the evidence lines and the deduction the TA chose. A TA of another class cannot see the lab or its queue (the status your `PA#2` contract names). |
| 8–12 | The flow works, but only locally or in the recording, or one step needs a seed script or a database edit (for example, the lab exists only because a script created it). |
| 3–7 | The parts run separately (the judge, the checker), but a verdict never comes from a real submission. |
| 0–2 | No flow. |

If the deployment does not answer when we mark, we try again on another day. If it still does not answer, we mark from the recording, and the criterion cannot go above 10.

---

## 2. Queue and sandbox — 20 points

The minimums in section 5 of the brief, one test submission each (session 6, slides 14–16). There are nine:

1. no network;
2. a CPU time limit;
3. a wall-clock limit that kills the **container**, not only the process;
4. a memory limit, swap included; the test reads back the memory it allocates, so the compiler cannot remove the allocation;
5. a process limit;
6. an output size limit;
7. a non-root user;
8. no host mounts and no Docker socket;
9. no secrets: the model API key is not in the sandbox's environment, its files, or anything the compiler can `#include`.

| Points | What it looks like |
| --- | --- |
| 17–20 | All nine, each with an attack submission in the repository that runs in CI on the `pa3` tag and fails the way it should. Compiling happens inside the sandbox too. A submission goes onto a queue, and a separate worker judges it: stop the worker, submit, start the worker again, and the submission is judged **exactly once** (a test, or this step in the recording). None of our attack submissions on your deployment gets out. |
| 11–16 | All nine are configured, but one to three of them have no test, or have a test that cannot fail. Or the "queue" is a direct call from the request handler. |
| 4–10 | A sandbox runs, but five or fewer minimums are proven, or one of our attacks gets out (other than rows 1, 8 and 9). |
| 0–3 | No sandbox, or one of our attacks reaches the network, sees the Docker socket, or reads the model key. |

For the CPU-time and output-size limits, a test that shows the limit takes effect is enough; these limits may live in the runner and behave the same in a naive and a hardened container. "Judged exactly once" means exactly one set of verdicts is stored after the worker is stopped and started again, even if the judging itself ran twice.

Judge0 is a legitimate choice. Then your tests attack your Judge0 configuration.

---

## 3. Hard rules first — 15 points

A constraint whose text starts with "Do not use" or "Do not call" is a ban list, and every banned name is in backticks (`leetkob-eval/README.md`). Code decides those.

| Points | What it looks like |
| --- | --- |
| 13–15 | Ban-list constraints are decided by syntax-aware code, not by searching the raw text. The traps do not fire: the student's own `sort` in a namespace, a banned name inside a comment or a string, `<algorithm>` included only for `std::swap`. When a hard rule decides a constraint, the model is not called for it, and your call log shows that. Our run with the model switched off (criterion 6) gives **0 wrongful deductions** on the dev set and decides every ban-list pair. |
| 8–12 | The hard rules catch the plain cases, but our model-off run has one or two wrongful deductions on traps, or the model is still called for constraints a hard rule has decided. |
| 3–7 | A text search (comments and strings count as code), with several wrongful deductions; or rules written for the dev-set problems by name, which cannot work on new problems. |
| 0–2 | No hard rules: the model decides everything. |

---

## 4. The model judges the semantic constraints — 20 points

| Points | What it looks like |
| --- | --- |
| 17–20 | The backend calls a **real model** for every semantic constraint. It sends only the statement, the constraints, and the code with comments and the student's identity removed: the prompts in your call log show it. For each constraint the model returns `pass`, `violation` or `unsure` with evidence lines, and nothing that sets a deduction. One real run on the dev set is committed: the predictions, the `eval.mjs` report, and the call log with the provider's request ids, the model, tokens, time and cost per call. README and `AI-LOG.md` name the model and what one lab of 80 submissions costs, with the arithmetic. |
| 11–16 | Real calls, but one of these is missing: comments or identity still in the prompt, no cost per lab, or no call log. |
| 4–10 | The model is called, but its free text is stored or shown; there is no verdict and evidence per constraint. |
| 0–3 | No real call (a stub only), or the key is in the browser, in the sandbox, or in the repository. |

---

## 5. First limits, and the review queue — 10 points

The full guardrails of section 3 are marked in `PA#4`. Here we mark the first two limits, and where the verdicts land.

| Points | What it looks like |
| --- | --- |
| 9–10 | Model output is validated against a schema, and anything that fails becomes `unsure`. A call that runs out of time becomes `unsure`. Both have tests that use a fake model and no network. Verdicts land only in the TA's review queue. Nothing in this build turns a verdict into a published mark. If a Publish action already exists, it refuses while any verdict is unreviewed. What a student sees before publishing follows the product owners' FAQ, and you cite the entry. |
| 5–8 | One of the two limits is missing or has no test. |
| 1–4 | The model's output is stored as it came. The queue exists. |
| 0 | A verdict reaches a student's mark with no TA in between. The syllabus rule above applies. |

---

## 6. The checker command and a first eval — 10 points

Section 6 of the brief: one command line that takes a dataset folder and writes the prediction file. The lecturer runs the held-out set through exactly that command in `PA#4`, so it has to work here first. It also needs a **model-off switch**, the environment variable `MODEL_OFF=1`, so that one marking command works for every team: it runs the hard rules only, writes `unsure` for every semantic constraint, and opens no network connection.

| Points | What it looks like |
| --- | --- |
| 9–10 | The README gives the command and a Dockerfile that builds an image for it. We run that image with the model off on our copy of the dev set (see below), and it writes a valid file: `eval.mjs` ends with exit code 0 or 1, never 2. It works from `statement.md` and `constraints.json` alone. Your committed real-model run, re-scored with our copy of `eval.mjs`, gives the numbers you report. The dev set in your repository is byte for byte the published one. Your own cases sit in a separate folder in the same layout: at least five, each labelled and tagged, with at least one `trap` and one `injection`. |
| 5–8 | The command works, but needs a hand-written setting per problem or a manual step, or the re-scored numbers differ from yours. |
| 1–4 | The prediction file was not produced by the checker: typed in, or copied from `labels.jsonl`. |
| 0 | No command, or the dev set or `eval.mjs` was edited. |

`PA#3` has no pass mark on the eval. Report the three numbers honestly. The thresholds of section 3 start to count in `PA#4`.

---

## 7. Tests first, one part per commit — 5 points

| Points | What it looks like |
| --- | --- |
| 5 | The tests for the hard rules (traps included) and for the two limits land in a commit **before** the code they test, or in the same commit. Each commit covers one part: sandbox, queue, hard rules, model call, limits. No test, eval case or label is loosened in the commit that made it pass. |
| 2–4 | Tests come after the code, or commits mix several parts. |
| 0–1 | One commit with everything, or a test loosened in the commit that turned it green. |

A history split or rebuilt after the work was finished does not count as one commit per part; it scores at the level for commits that mix several parts. We check it with the commit times and with what `AI-LOG.md` says.

---

## 8. AI-LOG.md — 5 points

| Points | What it looks like |
| --- | --- |
| 5 | Which tool, for which part, and real *Changed / Rejected* entries. Example: the hard rule the assistant wrote as a regex that fired on a comment, or the prompt that named a dev-set solution, and how you found it. |
| 2–4 | Tools listed; *Changed / Rejected* are empty or generic. |
| 0–1 | Missing. |

`Tool: none` is a valid entry if your team chose not to use one.

---

## Catching your assistant

These are the mistakes assistants make most often on this checkpoint. We look for each one, so look first.

| You see | What it means | What we check |
| --- | --- | --- |
| `eval.mjs`, `labels.jsonl` or a dev `.cpp` changed | the target moved | SHA-256 against the published copy: `eval.mjs` starts `c836edd8713521bb`, `labels.jsonl` starts `262cda7b0ef5612e`. We score with our copy anyway |
| a prompt or a hard rule that names `sort-merge/s05` or quotes dev-set code | tuned to the dev set; it will not survive new problems | we search your prompts and rules for dev-set ids |
| a test or an eval case loosened in the commit that turned it green | the test was edited to pass | `git log -p` on your tests and your own cases |
| the 1 GiB test passes, but nothing reads the memory back | the compiler removed the allocation | criterion 2, row 4 |
| `-v /var/run/docker.sock`, `--privileged`, `--env-file` or `-e MODEL_API_KEY` on the sandbox's command | the brief's minimums are gone | our attack submissions |
| a "real" dev run whose call log has no provider request ids | the model was mocked | criterion 4 |

Put these in the *never* list of your rules file.

---

## What we run when marking

1. **Your repository**, from the `pa3` tag in your zip. We compare the dev-set files with the published ones.
2. **Your checks**, with the commands in your README, in a container. Dependencies are installed first; then the network is cut, and the container is killed after 15 minutes. Your sandbox tests need Docker, so we read them from your CI run for the tag instead of running them on our machine.
3. **The checker image**, with the model off, on our copy of the dev set: `docker run --network none`, with memory and process limits, killed after 10 minutes. We score the output with our copy of `eval.mjs`.
4. **Your committed real-model run**, re-scored with our copy of `eval.mjs`.
5. **Your deployment**, with the accounts in `PA3.md`: the walk-through of criterion 1, then about ten attack submissions of our own, built from session 6, slide 14.

**How we reach the model.** In `PA#3` we never need your API key. The real model is called only by your own deployment, where the key stays on your server, and in the dev-set run you commit. Everything we run on our machine runs with the model off and the network cut.

---

## What you hand in

1. Tag the commit you are submitting `pa3` and push the tag. The repository stays **public**.
2. Keep the deployment running from the deadline until the `PA#4` marks are out. Your red team in `PA#4` attacks it.
3. Put `PA3.md` at the root, with:
4. the deployment's URL, and test accounts: one admin, two TAs in two different classes, and two students in the first TA's class. They hold no real data. Anyone who reads your public repository can use them, so set the spending cap with that in mind;
5. the CI run for the tag, with the sandbox tests in it;
6. the checker command, the Docker build line, and the model-off switch;
7. the folder of your committed dev-set run, with its prediction file and the `eval.mjs` report, not only the three numbers it gave. A real model does not answer the same way twice, so marks use our re-score of that committed file, not your numbers;
8. a link to a screen recording of up to 5 minutes, showing the flow of criterion 1 on the deployment. We watch it only if the deployment does not answer.

---

## How to submit

One zip file of the repository **including `.git`**, named after your student IDs in ascending order, joined by `-`, and **the total you give yourself**: `<StudentID1>-<StudentID2>-<StudentID3>_<total>.zip`, for example `23120001-23120002-23120003_84.zip`. One member turns it in, from their `<StudentID>@student.hcmus.edu.vn` Google account.

The zip must contain `SELF_ASSESSMENT_REPORT.md`: one row per criterion in this rubric, the marks you claim, and evidence pointing at a file, a commit, a PR or a CI run. Add a short *what we did not manage*. The total in that table is the number in the file name. Template on Classroom.

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

`PA#3` is 7% of the course: 100 points here are worth 7% of your course mark, and 80 points are worth 5.6% (0.56 on the 10-point scale).
