## What
<!-- Concise summary of the single subsystem / guardrail / fix in this PR -->

## Why
<!-- Milestone criterion, contract section, or FAQ entry -->

## Team & Rubric Checklist (`CONTRIBUTING.md`)
- [ ] **Git Author:** Committed under my own `<StudentID>@student.hcmus.edu.vn` identity (`git log -1 --format="%an <%ae>"`)
- [ ] **Scope & TDD Order:** Covers **one part** only; tests / `eval` custom cases landed **before or in the same commit** as `src/`
- [ ] **Protected Files Intact:** Zero edits to `leetkob-eval/`, and no test or contract was loosened to pass
- [ ] **Local Gates Green:** `npm run check` (and `npm run e2e` if `src/app.js` or `public/` changed) passed locally
- [ ] **AI-LOG & Oral Readiness:** Updated `AI-LOG.md` (with real *Changed / Rejected* notes if AI was used) and can explain every line without an assistant (`PA#6`)

> **Merge reminder:** Use **Create a merge commit (`--merge`)** rather than Squash when preserving multi-commit TDD history.
