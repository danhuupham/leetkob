# Session 7 starter: a gate that cannot fail

CSC13114 · Advanced Web Application Development · HK1 2026–2027

A small piece of **LeeTKOB**: the TA's review queue and the *Publish grades* step, with its
contract in [`docs/contract/publish.md`](docs/contract/publish.md).

The GitHub Actions workflow in this repository is green. **It proves nothing.** Your job is
to make it bite: a bad pull request must go red, and red must stop the merge.

**Nothing to hand in, not graded.** Already have a LeeTKOB repository with a harness? Read
step 1 here, then do steps 2–6 on your own repository. That work counts towards `PA#2`.

You need Node 22.13+, Git, and a GitHub account. Playwright's browser runs in CI, so you do
not have to install it on your laptop.

## Commands

```bash
npm ci                  # exactly what the lockfile says
npm start               # http://localhost:3007
npm run lint            # ESLint
npm run format:check    # Prettier
npm test                # unit tests
npm run contract        # contract tests for docs/contract/publish.md
npm run check           # all four above: this is the gate
npm run e2e             # one browser journey (needs: npx playwright install chromium)
```

## The steps

### 1. Predict (5 minutes, no assistant)

Press **Use this template → Create a new repository**, and make it **public**: branch
protection is free only on public repositories. Clone it, and read
`.github/workflows/ci.yml` and `test/contract/`.

Write down every way this gate can stay green on a broken build. Then run `npm run check`
on your laptop and compare with what the workflow runs.

### 2. Make the workflow honest

Commit first, so `git diff` shows exactly what your assistant changed. Then hand it over.
A brief that works:

> Make `.github/workflows/ci.yml` fail whenever a check fails. It must run on every pull
> request, on the Node version `package.json` asks for, and run the same `npm run check` a
> developer runs. Show me your plan first. Do not touch `src/` or `test/` in this step.

Open it as a pull request and expect red: **red is the point of this step.** Read the log. The first failure is a lint error that the old workflow was hiding. Have your assistant fix that one line and push.

The PR goes green. Do not celebrate yet, and do not merge: step 4 is why.

### 3. Protect `main`

*Settings → Branches → Add branch protection rule*, for `main`:

- *Require a pull request before merging*
- *Require status checks to pass before merging*, then pick your job name (`gates`)
- *Do not allow bypassing the above settings*

The check appears in the list only after it has run once on your repository. That is why
step 2 comes first.

### 4. Find the tests that cannot fail

Some tests in `test/contract/` pass on a broken build. Read each one next to the contract:
*would this go red if the code broke that rule?* Make them strict, in their own commit, and
push. The PR goes red again, and that is correct: the code breaks its contract in two places.

### 5. Fix the code, not the tests

Hand the two failures to your assistant: *"The contract is right. Fix `src/`. Do not edit
`test/` or `docs/`."* Then read the diff. Push; the PR goes green; merge it.

Now show that the gate bites. On a new branch, break the contract on purpose (delete the
check that refuses while reviews are pending), open a PR, and watch the merge stop.

### 6. Add the browser, and get a second reader

- Add a second job to the workflow that runs `npm run e2e`: `npx playwright install --with-deps chromium`
  first. Make it required too.
- Give a **second assistant, in a fresh session,** the diff of your deliberate-break PR and
  the contract. Ask: *"What would you block in this pull request, and why? Quote the line."*
  Did it catch the break? What did it invent?

## Done means

| # | Check | How | Done when |
|---|---|---|---|
| 1 | Nothing swallows a failure | search `.github/workflows/` for `\|\| true` and `continue-on-error` | no match |
| 2 | CI runs the real gate | open the job log, count the tests | at least 5 unit and 8 contract, the same as on your laptop |
| 3 | Same Node as the project | the log's `Setup Node` line | 22.13 or newer |
| 4 | It runs on pull requests | the *Checks* tab of your PR | the `gates` check is there |
| 5 | A required check | `gh api repos/{owner}/{repo}/branches/main/protection --jq .required_status_checks.contexts` | lists `gates` |
| 6 | No way round it | `git push origin main` from your laptop | the push is **rejected** |
| 7 | Red stops the merge | your deliberate-break PR | the merge button is disabled, for you as well, with a red check named |
| 8 | Refused means nothing changed | your stricter test for *a TA of another class* | it reads `published_at` after the call |
| 9 | Your tests were not weakened to get green | `git diff <first commit> -- test/` | no assertion was removed or loosened; a removed `try/catch` is fine |
| 10 | The browser job runs | the `e2e` job in your last PR | green, and required |

## Files

| Path | What it is |
|---|---|
| `.github/workflows/ci.yml` | the gate. Start here |
| `docs/contract/publish.md` | the contract. Treat it as correct |
| `src/app.js` | the routes |
| `src/grades.js` | pure logic, unit tested |
| `test/unit/`, `test/contract/`, `e2e/` | the three layers of the pyramid |
