# LeeTKOB eval: the dev set

This folder is the **dev set** for the LeeTKOB constraint checker, together with
`eval.mjs`, the tool that scores a checker against it. Read section 3 and section 6 of the
class brief first (*LeeTKOB — class project brief*, attached to the `PA#2` assignment on
Classroom). This README explains the files.

The lecturer keeps a **held-out set** with the same layout and **different problems**. Your
`PA#4` checker is scored on it with this same `eval.mjs`. Tune your checker on the dev set,
and add your own cases next to it.

## What is in here

```
problems/<problem-id>/statement.md       the lab statement: input/output format, limits
problems/<problem-id>/constraints.json   the constraints the TA declared for this lab
problems/<problem-id>/tests/01.in, 01.out, ...
solutions/<problem-id>/<sNN>.cpp         student submissions; every one is Accepted
labels.jsonl                             the correct verdict for every (solution, constraint)
eval.mjs                                 the scorer (Node 22 or later, no dependencies)
```

| Problem | Constraints | Solutions |
|---|---|---|
| `sort-merge` | no library sort · own merge sort | 9 |
| `binary-search` | no library search · own binary search | 7 |
| `reverse-recursive` | no loop statements · no library facility that iterates for you | 8 |
| `dynamic-array` | no standard containers · own growable memory · free what you allocate | 8 |
| `reverse-words` | no `std::reverse` / reverse iterators · reverse in place, no second buffer | 8 |
| `gcd-euclid` | no library gcd/lcm · own Euclid's algorithm | 7 |

That makes 47 solutions and 102 (solution, constraint) pairs: 65 labelled `pass` and 37 labelled
`violation`.

### `constraints.json`

```json
[{"id": "C1", "text": "Do not call a library sort function: `std::sort`, ...", "deduction": 3}]
```

`deduction` is the number of points out of 10 that the TA takes off for a violation. The
eval does not use it, but your product shows it to the TA.

Every constraint, in this set and in the held-out set, follows one rule. **A constraint
whose text starts with "Do not use" or "Do not call" is a ban list**, and every banned name
is written in backticks (`` `std::sort` ``, `` `goto` ``, `` `rbegin` ``). A deterministic,
syntax-aware rule can decide such a constraint. Every other constraint is **semantic**
("sort with a merge sort you wrote yourself", "free every block you allocate"). The code's
behaviour decides it, not the names in it.

### Solutions are Accepted

Every `.cpp` compiles with `g++ -std=c++17 -O2` and passes every test of its problem. The
judge compares the output token by token and ignores whitespace. So "the output is right" never tells
you whether a constraint holds. That is the whole point of LeeTKOB.

### `labels.jsonl`

There is one line for each (solution, constraint) pair:

```json
{"solution":"sort-merge/s05","constraint":"C1","label":"violation","evidence":[12],"tags":["disguised"]}
```

- `label` is `pass` or `violation`. There is no `unsure` in the labels.
- `evidence` holds the 1-based line numbers in the `.cpp` that show the violation. It is empty
  for `pass`. When a violation spans several lines, every line that shows it is listed, and
  citing any one of them is enough.
- `tags` describe the kind of case. They are only used to break down the report:

| Tag | Meaning |
|---|---|
| `obvious` | a plain violation, such as `sort(a.begin(), a.end())` |
| `disguised` | a violation hidden behind a name, a macro, an alias, a wrapper, or an algorithm that looks right |
| `trap` | **compliant** code that a naive check would flag, such as the student's own function called `sort`, a comment that mentions `std::sort`, or `<algorithm>` included only for `std::swap` |
| `injection` | a comment or string literal that tries to talk the checker into a verdict |
| `style` | compliant code in an unusual but valid style (bottom-up, mutual recursion, `realloc`, destructor cleanup) |

## Your prediction file

Your checker writes a JSONL file with one line per (solution, constraint):

```json
{"solution":"sort-merge/s03","constraint":"C1","verdict":"pass","evidence":[]}
{"solution":"sort-merge/s05","constraint":"C1","verdict":"violation","evidence":[{"line":12,"text":"stable_sort(a.begin() + lo, a.begin() + hi);"}]}
```

- `verdict` is `pass`, `violation` or `unsure`, in lower case.
- `evidence` is a list of `{"line": <1-based line number>, "text": "<that line of the .cpp>"}`.
  The `text` must be the **original** source line. Leading and trailing whitespace is
  ignored, but nothing else is. If your checker strips comments before it calls the model,
  map the line back to the original text before you write the file.

The lecturer runs your checker on the held-out set with **one command line that takes the
dataset folder and writes this file**. Your checker therefore has to work from
`statement.md` and `constraints.json` alone. A held-out run cannot depend on hand-written,
per-problem configuration.

## Running the eval

```bash
node eval.mjs --data . --predictions my-predictions.jsonl
node eval.mjs --data . --predictions my-predictions.jsonl --json summary.json   # also write a summary for CI
```

The `--data` folder can be this folder or any folder with the same layout, such as your
own extra cases or the held-out set.

### What the numbers mean

| Metric | Definition | Threshold |
|---|---|---|
| **wrongful deductions** | pairs labelled `pass` that you predicted `violation` | **= 0** |
| **recall** | violations caught ÷ violations. A violation is *caught* only when you predicted `violation` **and** at least one evidence entry has a labelled line number **and** that line's exact text | **≥ 90%** |
| **unsure rate** | pairs predicted `unsure` ÷ all pairs (missing pairs count as `unsure`) | **≤ 20%** |

A `violation` with the wrong line, the right line but the wrong text, or no evidence at all is
**not** caught. The TA has to see the proof, not only the verdict. An `unsure` is never a
wrongful deduction, but too many of them means the TA gets no help.

### What the eval rejects

Each of these stops the eval with a clear message and **exit code 2**:

- a line that is not valid JSON, or is not a JSON object;
- an unknown `solution`, or a `constraint` that the problem does not have;
- a `verdict` other than `pass`, `violation` or `unsure`;
- an evidence entry that is not `{"line": <int ≥ 1>, "text": <string>}`;
- the same (solution, constraint) pair twice.

A **missing** pair is not an error. It is counted as `unsure` and listed in the report.

### Output and exit code

The report shows the three metrics, a breakdown per tag, every wrongful deduction, and every
violation that was not caught, with the reason. The last line is always `PASS` or
`FAIL (<reasons>)`.

| Exit code | Meaning |
|---|---|
| `0` | all three thresholds are met |
| `1` | at least one threshold failed |
| `2` | the input is invalid (see above) |

Make your CI gate fail on any exit code other than `0`.

## Adding your own cases

Keep your own cases in a separate folder with the same layout: `problems/`, `solutions/` and
`labels.jsonl`. Then run `eval.mjs` with `--data` pointing at that folder. Before you label a
solution, check that it really is Accepted: it compiles with `g++ -std=c++17 -O2` and its output
matches every `.out` file token by token. If you cannot decide whether a case is a
violation, rewrite the case until you can.
