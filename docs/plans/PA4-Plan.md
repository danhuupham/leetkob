# PA#4 Implementation Plan — Eval, Guardrails, Human Gate, and Red-Team

**Course:** CSC13114 — Advanced Web Application Development · HK1 2026–2027  
**Milestone Weight & Deadline:** 7% of course mark (100 points) · **Due Wednesday, December 2, 2026, 22:00**  
**Repository:** `https://github.com/danhuupham/leetkob` (Tag: `pa4`)  
**Team Members:**
- `20120450` — Phạm Hữu Đan
- `21120595` — Nguyễn Thành Vinh
- `23120256` — Trần Đại Hiệp

> **Schedule Alert:** `PA#3` (Nov 25), `SEMINAR` study (Nov 29), and `PA#4` (Dec 2) fall within an 8-day window. Keep the `PA#3` deployment running continuously from Nov 25, and check the assigned red-team target immediately when posted (report to lecturer by **Monday, November 30** if the target deployment is unreachable).

---

## 1. Objective & Desired Behavior

Harden LeeTKOB from a working prototype (`PA#3`) into a trustworthy, measurably safe grading pipeline (`PA#4`):
1. **Live Eval Gate in CI (`Criterion 1` — 20 pts):** A required GitHub Actions check (`eval-gate`) runs the checker with the real Gemini model on the unmodified published dev set AND `>= 10` custom team cases (`trap`, `injection`, `disguised` — each committed **before** the checker change that handles it), scores the live predictions with `eval.mjs`, and blocks PR merges whenever `eval.mjs` exits non-zero. Demonstrate a real blocked red PR + checker-only fix commit, and measure variance across 3 repeated runs of the exact same commit.
2. **Held-Out Generalization (`Criterion 2` — 20 pts):** Achieve **0 wrongful deductions**, **recall `>= 95%`** (top 20/20 sub-band), and **`unsure <= 20%`** on the lecturer's unseen held-out set via the exact `PA#3` Docker checker command + separate `marking.env` attachment.
3. **Complete Section 3 Guardrails (`Criterion 3` — 20 pts, `G1`–`G5`):** Enforce and unit-test all 5 guardrails offline against a fake model (one commit per guardrail, test no later than code, proven to fail if the guardrail is removed):
   - `G1` Strict Schema
   - `G2` Exact Evidence Line Match (with comment-stripped line-number mapping back to original source)
   - `G3` Timeout -> `unsure`
   - `G4` Cost Cap per Lab -> remaining semantic constraints become `unsure` (`cost-cap-exceeded`) with reason visible to TA
   - `G5` No Deduction from Model -> model `deduction`/mark fields ignored
   Ensure prompt-injection submissions on the live deployment end as `violation` or `unsure`, never `pass`.
4. **Full Human Gate & Random 10% Pass Audit (`Criterion 4` — 15 pts, `H1`–`H3`):** Route every `violation`, every `unsure`, and a server-drawn random `ceil(10%)` sample of `pass` verdicts into the TA review queue (`H1`, verified with a seedable RNG test). Enforce at the API (`POST /api/labs/:labId/publish`) that publishing is refused (`409 reviews-pending`) while any queued item (including sampled passes) is unreviewed (`H2`), and refused for students (`403`) and other-class TAs (`404`) (`H3`). Document *Where we stop it* in `PA4.md` using Topic 10's three questions and exact quantitative cost analysis.
5. **Peer Red-Team Report (`Criterion 5` — 20 pts):** Execute `>= 8` reproducible, ethical attacks across `>= 5` categories (including `>= 1` white-box code-audit finding) against the lecturer-assigned target team's deployment and repository, documented in `docs/red-team/<target-IDs>.md`.

---

## 2. Technical Impact Analysis

### 2.1 Files & Modules to Create or Modify

| File / Directory | Action | Responsibility |
|---|---|---|
| `.github/CODEOWNERS` | Create | Require code-owner review on `test/`, `e2e/`, `.github/`, `docs/contract/`, and `eval/` (Session 7, slide 22). |
| `.github/workflows/ci.yml` | Modify | Add required job `eval-gate` (generates `predictions.jsonl` inside CI using repo secret `MODEL_API_KEY` on `eval/dev` + `eval/custom-cases`, runs `node eval/eval.mjs`, fails on non-zero exit; handles fork PRs safely without `pull_request_target`). Update branch protection on `main` to require `eval-gate`. |
| `eval/custom-cases/` | Expand | Expand from 5 (`PA#3`) to **`>= 12` labelled & tagged cases** covering `trap` (e.g., template comparator, overloaded member `.sort()`, macro), `injection` (system-override comments, fake JSON payload in raw string literal, multi-line prompt break), and `disguised` (bubble sort disguised with `mergeSort` function names, hidden heap/auxiliary `std::vector` inside helper, iterative loop disguised with dummy self-call `if (false) solve()`). |
| `src/checker/sanitize.js` | Enhance | Maintain a bijective 1-based line table `originalLines[]` vs `commentStrippedLines[]`: replace comment characters with spaces (preserving exact `\n` count and column offsets) so LLM line citations always align 1:1 with original source lines, while storing `nonCommentTextByLine` so `G2` rejects lines that consisted solely of comments! |
| `src/checker/guardrails.js` | Modify | Implement all 5 isolated, composable guardrail functions (`checkSchema`, `checkEvidenceAgainstSource`, `withModelTimeout`, `checkLabCostCap`, `stripModelDeduction`) returning structured `{ verdict, evidence, unsureReason }` metadata. |
| `src/grades.js` & `migrations/003_pa4_human_gate.sql` | Modify / Create | Add `selectPassSample(passIds, rng)` drawing `Math.ceil(passIds.length * 0.10)` server-side via Fisher–Yates shuffle (accepting injectable seeded PRNG for tests, defaulting to `crypto.randomInt` in production). Add `queued_for_review INTEGER NOT NULL DEFAULT 0` and `unsure_reason TEXT` on `constraint_verdicts` / `submissions`. |
| `src/app.js` & `docs/contract/publish.md` | Modify | Update queue endpoint (`GET /api/labs/:labId/queue`) to display `unsure_reason` (e.g., `cost-cap-exceeded`, `evidence-mismatch`, `model-timeout`, `schema-invalid`) and sampled `pass` items; update `POST /api/labs/:labId/publish` pending check to block until **all** `queued_for_review = 1` items have a TA decision. |
| `test/unit/guardrails/*.test.js` | Create | 5 dedicated offline fake-model test files (`g1-schema.test.js` .. `g5-no-deduction.test.js`), each verified by temporarily deleting its guardrail to confirm the test turns red. |
| `docs/red-team/<target-IDs>.md` | Create | Structured red-team report (`>= 8` attacks across all 5 categories: sandbox minimums, secrets/prompt leakage, semantic prompt injection, guardrail bypasses, human gate & IDOR). |
| `PA4.md` & `marking.env` (local only) | Create | `PA4.md` with CI gate links, blocked PR + checker fix commit, 3-run variance table, CI run USD cost, *Where we stop it* essay, and allowed model proxy hostname (`generativelanguage.googleapis.com`). Create gitignored `marking.env` separately for Classroom upload. |

---

## 3. Prompt & Calibration Strategy for Held-Out `>= 95%` Recall & `0` Wrongful Deductions

To hit the **20/20 held-out band** (`0` wrongful deductions, `recall >= 95%`, `unsure <= 20%`):
1. **Asymmetric Decision Rule in Prompt:** Instruct `gemini-2.5-flash` (with `temperature: 0` and structured `responseSchema`) to classify as `violation` **only** when it can quote exact verbatim code line(s) proving the constraint was broken; classify as `pass` when the required algorithmic structure is clearly verified; and output `unsure` only for genuinely ambiguous edge cases.
2. **Exact Line-Number Prefixing:** Feed code to the model formatted as `1: #include <iostream>\n2: ...` (after replacing comments with spaces while keeping line breaks intact). This eliminates off-by-one line counting errors that would otherwise cause `G2` (`checkEvidenceAgainstSource`) to downgrade valid `violation` catches into `unsure` (which hurts recall!).
3. **Zero Problem-Specific Leakage:** Never reference problem names, `sort-merge`, or dev-set filenames in prompts; formulate general algorithmic verification criteria (recursion call-graph reachability, auxiliary space allocation outside input buffer, time/loop nesting structure, banned STL facilities).
4. **3-Run Stability Audit:** Run the exact `pa4` candidate commit 3 consecutive times against `eval/dev` + `eval/custom-cases` to confirm `0` wrongful deductions across all 3 runs, flip rate `< 3%`, recall `>= 95%`, and `unsure <= 15%`.

---

## 4. Risks & Mitigations

- 🔴 **High — Missing or Git-Committed `marking.env`:** Without `marking.env` attached beside the zip on Classroom, markers run the held-out set with `MODEL_OFF=1` (recall `< 90%`, losing 9–15 points). Committing `marking.env` into git leaks a live key (failing secret scan and Criterion 2/3).
  - *Mitigation:* Add `marking.env` to `.gitignore` and `scripts/scan-secrets.js` blocklist immediately; create a dedicated scoped API key with `$5` cap exclusively for `marking.env` upload on Classroom.
- 🔴 **High — Fork Pull Request Secret Exposure (`pull_request_target` trap):** Using `pull_request_target` to give fork PRs `MODEL_API_KEY` lets an attacker exfiltrate the secret via a malicious PR workflow/test.
  - *Mitigation:* Keep trigger strictly on `pull_request`. In `eval-gate`, check if `MODEL_API_KEY` is empty (fork PR): fail the required check with an explicit message instructing maintainers to inspect the diff and test on an internal branch before merging, and document this exact mechanism in `PA4.md`.
- 🟡 **Medium — Guardrail Test That Cannot Fail (" Catching Your Assistant" Table):** Markers delete each guardrail in `src/` and re-run our tests; if a test only asserts against a mock instead of running the real guardrail logic, Criterion 3 drops to 11–16.
  - *Mitigation:* Every test in `test/unit/guardrails/` calls the real `runPipeline()` with an injected fake LLM transport returning adversarial raw strings (prose-wrapped JSON, wrong line number,comment-only line, delayed promise exceeding `modelTimeoutMs`, lab over `MODEL_MAX_COST_USD_PER_LAB`, `{ "deduction": 10 }`). Mutation-test all 5 by commenting out each guardrail locally!
- 🟡 **Medium — Red-Team Rules of Engagement Violation:** Sending `> 1 req/s`, running multiple fork bombs, triggering target cost cap more than once, or missing the Monday Nov 30 deadline to report a dead target.
  - *Mitigation:* Check assigned target on Nov 26; script requests with `>= 1100ms` delay; log exact UTC/+07:00 timestamps, inputs, and HTTP responses on first pass.

---

## 5. Effort Estimate & Team Ownership

**Total Story Points:** **21 SP** (split into 5 sub-tasks of `3–5 SP` each).

| Sub-Task | Scope | Points (Fib) | Primary Owner | Backup / Reviewer | Target Date |
|---|---|---|---|---|---|
| **T4.1 — Custom Eval Dataset (`>= 12` cases) & CI `eval-gate` + Blocked PR** | Commit `trap`/`injection`/`disguised` cases BEFORE checker fixes; `CODEOWNERS`; `eval-gate` workflow; capture real red PR -> checker fix commit | **5 SP** | `20120450` (Đan) | `23120256` (Hiệp) | Nov 27–28 |
| **T4.2 — All 5 Guardrails (`G1`–`G5`) — 1 Commit per Guardrail** | Comment-preserving line map (`G2`), per-lab cost cap (`G4`) + TA UI reason badge, 5 mutation-verified fake-model test commits | **5 SP** | `23120256` (Hiệp) | `20120450` (Đan) | Nov 28–29 |
| **T4.3 — Human Gate (`H1`–`H3`) & *Where We Stop It* Analysis** | Seedable server-side `ceil(10%)` pass sampling, API Publish refusal on sampled passes, contract tests, `PA4.md` quantitative Topic 10 essay | **3 SP** | `21120595` (Vinh) | `20120450` (Đan) | Nov 29–30 |
| **T4.4 — Held-Out Tuning, 3x Variance Run & `marking.env` Dry Run** | Line-numbered prompt calibration, 3x consecutive live dev-set runs, Docker proxy simulation (`generativelanguage.googleapis.com` only) | **3 SP** | `20120450` (Đan) | `21120595` (Vinh) | Nov 30–Dec 1 |
| **T4.5 — Peer Red-Team Execution & Report (`>= 8` attacks, 5+ categories)** | White-box repo audit + live deployment testing (`<= 1 req/s`) across all 5 categories, reproducible `docs/red-team/<target-IDs>.md` | **5 SP** | `21120595` (Vinh) & `23120256` (Hiệp) | `20120450` (Đan) | Nov 27–Dec 1 |

---

## 6. Commit Discipline & Deliberate Gate Sequence (Criteria 1 & 3)

1. **Commits 1–5 (Guardrails `G1` to `G5`, one commit each):**
   - `feat(guardrail-schema): validate strict JSON verdict schema with offline tests`
   - `feat(guardrail-evidence): verify verbatim non-comment source line match with line mapping`
   - `feat(guardrail-timeout): downgrade timed-out model calls to unsure with offline test`
   - `feat(guardrail-cost-cap): enforce per-lab USD spend cap and surface reason to TA`
   - `feat(guardrail-deduction): strip model deduction fields and enforce TA-configured deduction`
2. **Commit 6 (`feat(human-gate)`):** Add seeded `ceil(10%)` random `pass` sampling (`H1`), enforce API Publish refusal across all queued items (`H2`) and roles (`H3`), update `docs/contract/publish.md` if additive fields are added.
3. **Commit 7 (`test(eval-cases)` — Committed BEFORE Checker Tuning):** Add custom `trap`, `injection`, and `disguised` cases in `eval/custom-cases/` + enable required `eval-gate` in `.github/workflows/ci.yml` + `.github/CODEOWNERS`.
4. **PR Gate Demonstration (Criterion 1):** Open a PR where a subtle prompt/checker flaw triggers a red `eval-gate` (`mergeStateStatus: BLOCKED`), record the blocked PR & run link, then push a commit touching **only `src/checker/`** (zero edits to `eval/`) that turns `eval-gate` green.
5. **Commit 8 (`docs(pa4)`):** Run 3 repeated live eval runs on the final commit, write `PA4.md` (including *Where we stop it*, fork-PR handling, CI run cost, and `generativelanguage.googleapis.com` host), finalize `docs/red-team/<target-IDs>.md`, update `AI-LOG.md` & `SELF_ASSESSMENT_REPORT.md`, redeploy, tag `pa4`.

---

## 7. Outline for `PA4.md` — *Where We Stop It* (Criterion 4)

Must explicitly answer Topic 10's three questions with our team's real numbers:
1. **Who pays when the checker is wrong?** Quantify false-positive cost (unjust deduction of 2–5 marks on a student's lab -> grade/scholarship harm + mass appeals across 80 students + TA credibility loss) vs. false-negative cost (a violating solution slips through `pass` -> 90% of `pass` verdicts are unsampled; calculate exact expected slipped violations per 80-student lab given our measured false-negative rate `(1 - recall)` × `0.90`).
2. **How do we know it is wrong?** Pre-merge CI `eval-gate` (`0` wrongful deductions, `recall >= 90%`), runtime deterministic guardrails (`G1`–`G5` catching hallucinated lines/schema breaks), 10% random `pass` audit (`H1` detecting systematic blind spots in production), and post-publish student appeals (`FAQ-13`).
3. **Where do we stop it — and why at Publish rather than every verdict?** Before Publish, verdicts are private suggestions in the TA queue where overturning an error costs ~15 seconds and 0 student harm; requiring human sign-off on 100% of `pass` verdicts would force the TA to read all 80 submissions (~3–4 hours), defeating LeeTKOB's entire value proposition, whereas gating **Publish** after reviewing `100%` of `violation` + `100%` of `unsure` + `10%` random `pass` catches `100%` of deductions before they become irreversible while cutting TA workload by ~65–75%.

---

## 8. Pre-Submission Verification Checklist

- [ ] `eval-gate` is a required status check on `main`, runs live Gemini inside CI on `eval/dev` + `>= 10` custom cases, and links a blocked red PR + checker-only green fix commit.
- [ ]Deleting any single guardrail `G1`–`G5` causes its corresponding unit test in `test/unit/guardrails/` to fail immediately.
- [ ] Checker Docker image tested locally with outbound firewall allowing **only** `generativelanguage.googleapis.com:443` and `marking.env` finishes well under 30 minutes with `0` wrongful deductions, `recall >= 95%`, `unsure <= 20%`.
- [ ] `docs/red-team/<target-IDs>.md` has `>= 8` reproducible entries across `>= 5` categories, `>= 1` code-reading attack, exact timestamps, `held`/`broke`, who pays, and proposed fixes.
- [ ] Zip `20120450-21120595-23120256_<total>.zip` (without `marking.env` inside!) + separate `marking.env` file uploaded to Classroom.
