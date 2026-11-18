# Team Collaboration & Engineering Rules (`CONTRIBUTING.md`)

**Course:** CSC13114 — Advanced Web Application Development · LeeTKOB (`PA#2` → `PA#6`)  
**Team Members:**
- `20120450` — Phạm Hữu Đan (`20120450@student.hcmus.edu.vn`)
- `21120595` — Nguyễn Thành Vinh (`21120595@student.hcmus.edu.vn`)
- `23120256` — Trần Đại Hiệp (`23120256@student.hcmus.edu.vn`)

Every team member and AI coding assistant working in this repository must follow these rules across all milestones.

---

## 1. Individual Git Identity (`PA#6` Oral Defense Rule)

Examiners in `PA#6` (worth **15% of the course mark**) select individual code-reading questions from `OWNERS.md` and `git log --author`. Commits under a teammate's name become *their* oral questions, not yours.

Before creating your first commit on any machine, verify your repository Git identity:

```bash
# Run inside Project/leetkob and set YOUR OWN name + HCMUS email:
git config user.name "Phạm Hữu Đan"                  # or "Nguyễn Thành Vinh" / "Trần Đại Hiệp"
git config user.email "20120450@student.hcmus.edu.vn" # or 21120595@... / 23120256@...
```

- **Never** commit or push a teammate's module under your own Git author.
- **Never** let one member squash-commit the whole team's work into a single mega-commit.

---

## 2. Branching, Test-First Order & Merge Strategy

Rubrics for `PA#3` (Criterion 7) and `PA#4` (Criteria 1 & 3) explicitly grade commit granularity and timestamps:

1. **One Subsystem Part = One Branch = One Pull Request:**
   - Keep each PR scoped to a single part (e.g., `feat/sandbox`, `feat/queue`, `feat/hard-rules`, `feat/guardrail-evidence`, `feat/human-gate`, `feat/appeals`).
   - Do not mix unrelated subsystems in the same commit.
2. **Tests & Custom Eval Cases Land First (or in the Same Commit):**
   - Unit, contract, sandbox, and guardrail tests must be committed **before** (or in the exact same commit as) the `src/` code they test.
   - Custom evaluation cases in `eval/custom-cases/` (`trap`, `injection`, `disguised`) must be committed **before** the checker commit that handles them.
   - **Mutation check:** Before marking a guardrail or contract test done, temporarily break/comment out the rule in `src/` to verify the test actually fails.
3. **Preserve TDD History When Merging PRs (`--merge`, Not Blind Squash):**
   - When a PR contains sequential TDD commits (`test(...)` followed by `feat(...)`) or distinct guardrail commits, merge using **Create a merge commit (`gh pr merge --merge`)** so individual commit timestamps and test-before-code diffs remain intact on `main`.
   - **Never** split or rebase-rewrite commit history after finishing the work to fake "one commit per part" — markers check commit timestamps against `AI-LOG.md`.
4. **Conventional Commits & Selective Staging:**
   - Format: `type(scope): imperative summary` (`feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `perf`).
   - Always stage explicit files (`git add src/foo.js test/unit/foo.test.js`) and inspect `git diff --staged --stat`. Never run `git add -A` or `git add .` blindly (prevents accidental formatting churn or untracked files).

---

## 3. Protected Files, Contracts & Immutable Milestone Evidence

1. **Protected Paths (`CODEOWNERS`):**
   - Changes touching `/docs/contract/`, `/test/`, `/e2e/`, `/eval/`, `/.github/`, or `/AGENTS.md` require explicit teammate review before merging.
   - If a test goes red on a feature PR, **change `src/`, never `test/`**. Updating a contract test is permitted only when intentionally evolving the contract specification in the same PR with a documented reason.
2. **Published Evaluation Integrity:**
   - `eval.mjs` (`SHA-256: c836edd8713521bb...`), `labels.jsonl` (`SHA-256: 262cda7b0ef5612e...`), and published dev-set `.cpp` files are **read-only forever**. Team cases live strictly in `eval/custom-cases/`.
3. **Permanent Milestone Artifacts:**
   - Never delete, force-move, or overwrite milestone tags (`pa2`, `pa3`, `pa4`, `pa5`) once pushed after a deadline.
   - Never close or merge intentional red-gate proof PRs (e.g., [`PR #2`](https://github.com/danhuupham/leetkob/pull/2) for `PA#2`, and the blocked `eval-gate` PR for `PA#4`).

---

## 4. Real-Time `AI-LOG.md` & Oral-Readiness Gate

1. **Log AI Usage in the Same PR:**
   - Whenever you use an AI assistant (or choose `Tool: none`), append or update your entry in [`AI-LOG.md`](AI-LOG.md) **while the diff is fresh**, recording concrete commit SHAs and real **Changed** / **Rejected** mistakes caught by checks or manual review.
2. **"If You Cannot Explain It, Do Not Merge It" (`PA#6` Syllabus Rule):**
   - Code in this repository is the team's code regardless of who or what drafted it. Before merging any PR, both the author and the reviewing teammate must verify they can answer without an assistant:
     - **Area A:** What does each line do, and what breaks if we delete it?
     - **Area B:** Why did we choose this design over the alternative, and what does it cost?
     - **Area C:** Which exact test, CI job, or log line proves this works?

---

## 5. Pre-Push Checklist, Secrets & Production Freeze

Run locally before every `git push`:

```bash
npm run format    # Auto-format modified JS/JSON/YAML files (never touches leetkob-eval/)
npm run check     # ESLint + Prettier + tsc --noEmit + unit + contract + secret scan + eval SHA-256
npm run e2e       # Required whenever src/app.js, src/http.js, or public/ changes
```

- **Out-of-Git Files:** `.env`, `marking.env` (`PA#4` held-out key, attached beside zip only), and `ACCESS.md` (`PA#5` credentials, placed inside zip only and gitignored) must **never** be committed to Git.
- **Shared Deployment Coordination:** Announce in the team group before deploying or restarting containers on the live VPS (`PA#3`–`PA#6`). Once tag `pa5` is deployed on **December 16, 2026**, production is **strictly frozen** at commit `pa5` until all `PA#6` oral slots conclude on **December 31, 2026**.
