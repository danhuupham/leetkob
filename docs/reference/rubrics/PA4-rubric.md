# PA#4 — Eval, guardrails, human gate and red-team · rubric

**CSC13114 · project milestone, teams of up to 3 · 7% of the course · 100 points**

The product is LeeTKOB. In `PA#3` the pipeline ran. This checkpoint marks whether it can be trusted: an eval that blocks a merge, the guardrails of section 3 of the brief, a Publish step that a TA has to earn, and a run on the held-out set that you have never seen. You also attack another team's deployment and write down what you found.

The three questions of the course's topic 10 run through all of it. Who pays when the checker is wrong? How do you know it is wrong? Where do you stop it?

**Due Wednesday, December 2, 2026, 22:00.** One submission per team, same teams as `PA#3`.

---

## What is scored

| # | Criterion | Points |
| --- | --- | --- |
| 1 | The eval gates CI | 20 |
| 2 | The held-out run | 20 |
| 3 | The guardrails of section 3 | 20 |
| 4 | The human gate | 15 |
| 5 | Red-team report on another team | 20 |
| 6 | `AI-LOG.md` | 5 |

---

## 1. The eval gates CI — 20 points

| Points | What it looks like |
| --- | --- |
| 17–20 | A CI job runs your checker on the published dev set and on your own cases, **producing the predictions inside the job** with the real model, then runs `eval.mjs`. Any exit code other than `0` fails the job, and the job is a required check on `main`. You link a pull request where the gate went red (a wrongful deduction, or recall below 90%) and the merge was blocked, and the commit that fixed the checker, not the data. The dev-set files are the published ones, byte for byte. You have at least 10 cases of your own, labelled and tagged, covering `trap`, `injection` and `disguised`. Each was committed before the checker change that handles it. `PA4.md` reports three runs of the same commit: how many pairs changed verdict between runs, and the lowest and highest recall and `unsure` rate. It also states what one CI run costs. |
| 11–16 | The gate runs on every pull request and can fail, but one of these is missing: it is not required, you have fewer than 10 cases of your own, or there is no repeated run. |
| 4–10 | The eval runs, but on a predictions file committed to the repository, or with `continue-on-error`, or only on `main` after the merge. Such a gate never sees a change to the checker. |
| 0–3 | No eval in CI, or `eval.mjs`, a label or a dev-set file was changed. |

The model key in CI lives in the repository's secrets, never in a file. Pull requests from forks do not get secrets (session 7, slide 19). Say in `PA4.md` how your gate handles that.

---

## 2. The held-out run — 20 points

We run your checker command on the held-out set once, in our container, and score the output with our copy of `eval.mjs`. The thresholds are those of section 3 of the brief.

| Points | What it looks like |
| --- | --- |
| 17–20 | All three thresholds met: **0 wrongful deductions, recall ≥ 90%, `unsure` ≤ 20%**. Within this band, recall decides: 20 at 95% or more, 18–19 from 92% to below 95%, 17 below 92%. |
| 11–16 | 0 wrongful deductions, but recall is between 75% and 90%, or `unsure` is above 20%. The checker is safe but does not help the TA enough. |
| 5–10 | 0 wrongful deductions and recall below 75%; or exactly one wrongful deduction. |
| 1–4 | Two or more wrongful deductions. |
| 0 | The command fails, the file is invalid (`eval.mjs` exit code 2), or the run is killed before it writes a file. |

We do not fix your command. If our side fails (the proxy, the machine), we run it again. A missing pair counts as `unsure`, exactly as `eval.mjs` says.

---

## 3. The guardrails of section 3 — 20 points

Five guardrails, each with a test that uses a fake model and no network:

1. **Schema.** Output that does not match the schema becomes `unsure`: invalid JSON, JSON inside a code fence or after prose, an unknown verdict, a missing or duplicate constraint.
2. **Evidence.** Every evidence line must match the submitted code exactly, or the verdict becomes `unsure`: an invented line, the right text at the wrong line number, a line that only exists in a comment you stripped. If you strip comments, you map line numbers back to the original code.
3. **Timeout.** A call that runs out of time becomes `unsure`.
4. **Cost cap per lab.** When the cap is reached, the remaining constraints become `unsure`, and the TA sees why.
5. **No deduction from the model.** A `deduction` field, or any instruction about marks, in the model's output changes nothing. The deduction shown is the one the TA set.

| Points | What it looks like |
| --- | --- |
| 17–20 | All five, each with its test, and the hard rules still decide ban-list constraints first. Each guardrail and its test land in their own commit, with the test no later than the code. None of our injection submissions on your deployment turns a violating solution into `pass`: they end as `violation` or `unsure`. |
| 11–16 | Four of the five, or all five but one test cannot fail (it would pass with the guardrail removed). |
| 4–10 | Only the `PA#3` limits (schema and timeout). |
| 0–3 | The model's output is trusted as it comes. |

A history split or rebuilt after the work was finished does not count as one commit per part; it scores at the level for commits that mix several parts.

---

## 4. The human gate — 15 points

| Points | What it looks like |
| --- | --- |
| 13–15 | Every `violation`, every `unsure`, and a random 10% of the `pass` verdicts (rounded up, drawn by the server, not the first ones) go to the TA's review queue. A test with a fixed seed shows the sample. **Publish is refused by the API**, not only hidden in the screen, while any queued verdict is unreviewed, and it is refused for a student and for a TA of another class: we try all three with direct requests. Publish is the only action that makes a deduction visible to a student. The checker has no tool and no code path that writes a mark. `PA4.md` has a section *Where we stop it* that answers the three questions with your own numbers, and says why the gate sits on Publish and **not** on every verdict, including what the unsampled passes cost. |
| 8–12 | The gate holds at the API, but the sample is missing or not random, or *Where we stop it* is missing. |
| 3–7 | The gate is only in the screen: a direct request publishes with reviews pending. |
| 0–2 | No Publish step, or marks are published with no review. |

---

## 5. Red-team report on another team — 20 points

The lecturer assigns each team one target on Classroom after the `PA#3` deadline. The target's deployment and test accounts are in its `PA3.md`.

**Rules of engagement.** Attack only your target's deployment and its public repository, using the accounts in its `PA3.md`. Send no more traffic than one student could: about one request per second at most. One resource attack (fork bomb, memory, output) per kind is enough. Trigger the target's cost cap once to show whether it holds, and no more. Do not attack the hosting provider or anyone else. If you find a live key or real personal data, stop, do not use it, and tell the lecturer and the target the same day.

Write the report in `docs/red-team/<target's student IDs>.md`. One entry per attack:

- the category and the rule it tests: a minimum of section 5, a guardrail or the human gate of section 3, or the target's own contract;
- the exact input: the `.cpp` file, the request, or the steps;
- what you expected, and what you observed: the response, a log line or a screenshot, with the time;
- **held** or **broke**, and who pays if it broke, in the terms of section 3;
- for a break, the fix you would propose.

The categories: the sandbox minimums, the model key and the data sent to the model, prompt injection on semantic constraints, getting past a guardrail (evidence, schema, cost cap), the human gate and authorization (Publish, another class's queue, another student's submission).

| Points | What it looks like |
| --- | --- |
| 17–20 | At least 8 attacks across at least 5 categories, each one reproducible from the report alone. We replay two of our choosing on the target, and get what the report says. Attacks that held are reported as well as those that broke. At least one attack comes from reading the target's code, not only from trying the screens. |
| 11–16 | At least 6 attacks across at least 4 categories, mostly reproducible; or one of our replays gives a different result; or the rule each attack tests is vague. |
| 4–10 | A list of attempts without exact inputs or observed outputs, or a generic checklist not tied to LeeTKOB. |
| 0–3 | Missing, or an attack on something other than the assigned deployment, or a broken rule of engagement. |

A target that holds everywhere does not lower your mark. The report is marked on the attacks and their evidence, not on how many broke. If the target's deployment does not answer, record each attempt with its time and tell the lecturer by Monday, November 30. Attacks on the target's code run on your own machine, with your own key, also count; say that they were run that way.

---

## 6. AI-LOG.md — 5 points

| Points | What it looks like |
| --- | --- |
| 5 | Which tool, for which part, and real *Changed / Rejected* entries. Example: the assistant that "fixed" a red eval by changing a label, or a guardrail test that could not fail, and how you found it. |
| 2–4 | Tools listed; *Changed / Rejected* are empty or generic. |
| 0–1 | Missing. |

`Tool: none` is a valid entry if your team chose not to use one.

---

## Catching your assistant

| You see | What it means | What we check |
| --- | --- | --- |
| a label, a dev `.cpp` or `eval.mjs` changed in a checker PR | the target moved | SHA-256 against the published copy: `eval.mjs` starts `c836edd8713521bb`, `labels.jsonl` starts `262cda7b0ef5612e`. We score with our copy anyway |
| the gate reads `predictions.jsonl` from the repository | it can never go red on a checker change | criterion 1 |
| `continue-on-error`, `\|\| true`, or an exit code that is not checked | a gate that cannot fail | criterion 1 |
| a case of your own whose label changed in the commit that turned the gate green | the case was edited to pass | `git log -p` on your cases |
| a guardrail test that still passes with the guardrail deleted | it tests the fake, not the guardrail | we delete the guardrail and run your test |
| a prompt that names dev-set solutions, or special cases for their code | tuned to the dev set | the held-out run shows it |
| Publish hidden in the screen, but the endpoint has no check | a hidden button is not a check (session 6, slide 12) | criterion 4, direct requests |

`CODEOWNERS` on your tests, `.github/` and the eval data, with review required from code owners, means a person signs off on such changes (session 7, slide 22).

---

## What we run when marking

1. **Your repository**, from the `pa4` tag in your zip. We compare the dev-set files with the published ones.
2. **Your checks and your guardrail tests**, with the commands in your README, in a container with the network cut after dependencies are installed, killed after 15 minutes.
3. **The held-out run.** We build your checker image and run your command on the held-out set, killed after 30 minutes. The container has no network except a proxy that lets it reach only the model host your README names. We score the output with our copy of `eval.mjs`.
4. **Your deployment:** Publish with reviews pending (as the TA, as another TA, as a student), the sample of passes, and our injection submissions.
5. **The report you wrote:** we replay two of its attacks on your target.

**How we reach the model for the held-out run.** Your team pays for its own calls. Attach a file `marking.env` to your Classroom submission, **beside the zip, not inside it, and never in git**. It holds only the variables your checker command needs: a key made for this run, or the URL and token of your own model endpoint. We use it for the held-out run and nothing else. Revoke the key once your `PA#4` mark is out. Without a working `marking.env` we run the checker with the model off, which in practice means recall below 90%.

---

## What you hand in

1. Tag the commit you are submitting `pa4` and push the tag. The repository stays **public**, and the deployment keeps running.
2. Put `PA4.md` at the root, with: the CI run for the tag, the blocked pull request and the fixing commit, the three repeated dev runs, the cost of one CI run, the section *Where we stop it*, and the model host the held-out run must reach.
3. The red-team report in `docs/red-team/`.
4. `marking.env`, attached beside the zip.

---

## How to submit

One zip file of the repository **including `.git`**, named after your student IDs in ascending order, joined by `-`, and **the total you give yourself**: `<StudentID1>-<StudentID2>-<StudentID3>_<total>.zip`, for example `23120001-23120002-23120003_84.zip`. One member turns it in, from their `<StudentID>@student.hcmus.edu.vn` Google account, with `marking.env` as a second attachment.

The zip must contain `SELF_ASSESSMENT_REPORT.md`: one row per criterion in this rubric, the marks you claim, and evidence pointing at a file, a commit, a PR or a CI run. For criterion 2, claim what your dev-set runs suggest, and say so. Add a short *what we did not manage*. The total in that table is the number in the file name. Template on Classroom.

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

`PA#4` is 7% of the course: 100 points here are worth 7% of your course mark, and 80 points are worth 5.6% (0.56 on the 10-point scale).
