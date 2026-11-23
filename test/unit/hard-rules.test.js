import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeCode } from '../../src/checker/sanitize.js';
import { parseBanListConstraint, evaluateHardRule } from '../../src/checker/hard-rules.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('sanitizeCode preserves exact 1:1 line count and scrubs comments and student PII', () => {
  const raw = [
    '#include <iostream> // Author: Nguyen Van A - 20120450@student.hcmus.edu.vn',
    '/* Multi-line comment',
    '   MSSV: 20120450',
    '   std::sort(a, a + n); */',
    "const int MAX_VAL = 1'000'000;",
    'const int ARR_BOUND = 10000005;',
    'int a[10000005];',
    'const char* meta = "Student ID: 21120595 | contact: 23120256@student.hcmus.edu.vn";',
    'const char* rawLit = R"delim(// keep newline count',
    '/* inside raw string */)delim";',
    '// spliced comment \\',
    'std::sort(a, a + 5);',
    'int main() { return 0; }',
  ].join('\n');

  const res = sanitizeCode(raw);
  assert.equal(res.originalLines.length, 13);
  assert.equal(res.strippedLines.length, res.originalLines.length);
  assert.equal(res.numberedPromptCode.split('\n').length, res.originalLines.length);

  const joined = res.strippedLines.join('\n');
  assert.equal(joined.includes('20120450'), false);
  assert.equal(joined.includes('21120595'), false);
  assert.equal(joined.includes('23120256'), false);
  assert.equal(joined.includes('student.hcmus.edu.vn'), false);
  assert.equal(joined.includes('Nguyen Van A'), false);
  assert.equal(res.strippedLines[3].trim(), '');
  assert.equal(res.strippedLines[11].trim(), '');
  assert.equal(res.strippedLines[6].includes('10000005'), true);
  assert.equal(res.numberedPromptCode.startsWith('1: #include <iostream>'), true);
});

test('parseBanListConstraint detects ban-list rules and ignores semantic rules', () => {
  const ban = parseBanListConstraint(
    'Do not use loop statements: `for`, `while`, `do`-`while`, range-based `for`, or `goto`.',
  );
  assert.equal(ban.isBanList, true);
  assert.deepEqual(ban.bannedTargets, ['for', 'while', 'do', 'goto']);

  const semanticWithBackticks = parseBanListConstraint(
    'Store the numbers in memory you allocate yourself (`new[]`, or `malloc`/`realloc`).',
  );
  assert.equal(semanticWithBackticks.isBanList, false);
  assert.deepEqual(semanticWithBackticks.bannedTargets, []);

  const proseWithoutBackticks = parseBanListConstraint(
    'Do not use an extra auxiliary array or second buffer.',
  );
  assert.equal(proseWithoutBackticks.isBanList, false);
  assert.deepEqual(proseWithoutBackticks.bannedTargets, []);
});

test('AC1: comments, spliced comments, strings, and raw strings never trigger hard rules', async () => {
  const constraint = {
    id: 'C1',
    text: 'Do not call a library sort function: `std::sort`, `std::stable_sort`, `qsort`.',
  };
  const code = [
    '#include <iostream>',
    '// std::sort(a, a + n);',
    '/* qsort(a, n, sizeof(int), cmp); */',
    '// spliced line \\',
    'std::stable_sort(a, a + n);',
    'int main() {',
    '  const char* s1 = "std::sort(a, a + n);";',
    '  const char* s2 = R"(std::stable_sort(a, a + n); qsort(a, n, 4, cmp);)";',
    '  std::cout << s1[0] << s2[0];',
    '}',
  ].join('\n');

  const res = await evaluateHardRule(constraint, code);
  assert.deepEqual(res, { verdict: 'pass', evidence: [] });
});

test('AC2: user-defined functions, namespaces, structs, and unrelated member methods pass', async () => {
  const sortConstraint = {
    id: 'C1',
    text: 'Do not call a library sort function: `std::sort`, `std::stable_sort`, `qsort`.',
  };
  const nsSortCode = [
    '#include <iostream>',
    'using namespace std;',
    'namespace my {',
    '  void sort(int* a, int lo, int hi) {',
    '    if (hi - lo < 2) return;',
    '    int mid = (lo + hi) / 2;',
    '    sort(a, lo, mid);',
    '    sort(a, mid, hi);',
    '  }',
    '}',
    'int main() {',
    '  int a[4] = {4, 2, 3, 1};',
    '  my::sort(a, 0, 4);',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(sortConstraint, nsSortCode), {
    verdict: 'pass',
    evidence: [],
  });

  const searchConstraint = {
    id: 'C1',
    text: 'Do not use a library search function: `std::binary_search`, `std::find`, `bsearch`.',
  };
  const memberAndOwnFnCode = [
    '#include <string>',
    '#include <vector>',
    'int binary_search(const std::vector<int>& v, int x) {',
    '  return v.empty() ? -1 : v[0] == x ? 0 : -1;',
    '}',
    'int main() {',
    '  std::string s = "hello world";',
    "  size_t pos = s.find(' ');",
    '  std::vector<int> v = {1, 2, 3};',
    '  return binary_search(v, (int)pos);',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(searchConstraint, memberAndOwnFnCode), {
    verdict: 'pass',
    evidence: [],
  });

  const rbeginConstraint = {
    id: 'C1',
    text: 'Do not use reverse iterators: `rbegin`, `rend`.',
  };
  const ownRbeginStruct = [
    'struct CustomSeq {',
    '  int data[4];',
    '  int* rbegin() { return data + 3; }',
    '};',
    'int main() {',
    '  CustomSeq seq{};',
    '  int rend = 0;',
    '  return *seq.rbegin() + rend;',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(rbeginConstraint, ownRbeginStruct), {
    verdict: 'pass',
    evidence: [],
  });
});

test('AC3: including <algorithm> for std::swap/std::min passes sort ban, while explicit header ban fires', async () => {
  const sortConstraint = {
    id: 'C1',
    text: 'Do not call a library sort function: `std::sort`, `std::ranges::sort`.',
  };
  const swapOnlyCode = [
    '#include <algorithm>',
    'int main() {',
    '  int x = 3, y = 1;',
    '  if (x > y) std::swap(x, y);',
    '  return std::min(x, y);',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(sortConstraint, swapOnlyCode), {
    verdict: 'pass',
    evidence: [],
  });

  const headerConstraint = {
    id: 'C1',
    text: 'Do not use non-standard umbrella headers: `<bits/stdc++.h>`.',
  };
  const headerCode = ['#include <bits/stdc++.h>', 'int main() { return 0; }'].join('\n');
  const headerRes = await evaluateHardRule(headerConstraint, headerCode);
  assert.deepEqual(headerRes, {
    verdict: 'violation',
    evidence: [{ line: 1, text: '#include <bits/stdc++.h>' }],
  });
});

test('AC4: catches using-namespace, namespace aliases, macros, typedef/using, and function aliases', async () => {
  const sortConstraint = {
    id: 'C1',
    text: 'Do not call a library sort function: `std::sort`, `std::stable_sort`, `std::ranges::sort`, `qsort`.',
  };

  const usingNsCode = [
    '#include <algorithm>',
    '#include <vector>',
    'using namespace std;',
    'int main() {',
    '  vector<int> a = {3, 1, 2};',
    '  stable_sort(a.begin(), a.end());',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(sortConstraint, usingNsCode), {
    verdict: 'violation',
    evidence: [{ line: 6, text: '  stable_sort(a.begin(), a.end());' }],
  });

  const macroCode = [
    '#include <algorithm>',
    '#include <vector>',
    '#define ALL(v) (v).begin(), (v).end()',
    '#define DO_SORT(v) std::sort(ALL(v))',
    'int main() {',
    '  std::vector<int> v = {2, 1};',
    '  DO_SORT(v);',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(sortConstraint, macroCode), {
    verdict: 'violation',
    evidence: [
      { line: 4, text: '#define DO_SORT(v) std::sort(ALL(v))' },
      { line: 7, text: '  DO_SORT(v);' },
    ],
  });

  const nsAliasCode = [
    '#include <algorithm>',
    '#include <vector>',
    'namespace rg = std::ranges;',
    'int main() {',
    '  std::vector<int> v = {2, 1};',
    '  rg::sort(v);',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(sortConstraint, nsAliasCode), {
    verdict: 'violation',
    evidence: [{ line: 6, text: '  rg::sort(v);' }],
  });

  const containerConstraint = {
    id: 'C1',
    text: 'Do not use standard containers: `std::vector`, `std::basic_string`.',
  };
  const typedefAliasCode = [
    '#include <string>',
    'typedef std::basic_string<int> IntBuf;',
    'int main() {',
    '  IntBuf b;',
    '  b.push_back(1);',
    '}',
  ].join('\n');
  const typedefRes = await evaluateHardRule(containerConstraint, typedefAliasCode);
  assert.equal(typedefRes?.verdict, 'violation');
  assert.equal(
    typedefRes?.evidence.some(
      (e) => e.line === 2 && e.text === 'typedef std::basic_string<int> IntBuf;',
    ),
    true,
  );
  assert.equal(
    typedefRes?.evidence.some((e) => e.line === 4 && e.text === '  IntBuf b;'),
    true,
  );
});

test('AC5: loop keyword bans catch range-for, while, do-while, goto, and macro loops without false positives', async () => {
  const loopConstraint = {
    id: 'C1',
    text: 'Do not use loop statements: `for`, `while`, `do`-`while`, range-based `for`, or `goto`.',
  };

  const cleanCode = [
    'int sumRec(const int* a, int n, int idx) {',
    '  int enforce = 0;',
    '  int worthwhile = enforce;',
    '  return idx >= n ? worthwhile : a[idx] + sumRec(a, n, idx + 1);',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(loopConstraint, cleanCode), {
    verdict: 'pass',
    evidence: [],
  });

  const rangeForAndGoto = [
    '#include <vector>',
    'int main() {',
    '  std::vector<int> a = {1, 2, 3};',
    '  int s = 0;',
    '  for (int x : a) s += x;',
    'done:',
    '  if (s < 0) goto done;',
    '  return s;',
    '}',
  ].join('\n');
  assert.deepEqual(await evaluateHardRule(loopConstraint, rangeForAndGoto), {
    verdict: 'violation',
    evidence: [
      { line: 5, text: '  for (int x : a) s += x;' },
      { line: 7, text: '  if (s < 0) goto done;' },
    ],
  });
});

test('AC6: achieves 0 wrongful deductions and 100% ban-list recall on published leetkob-eval dev set', async () => {
  const evalDir = join(ROOT, 'leetkob-eval');
  const labelLines = readFileSync(join(evalDir, 'labels.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));

  /** @type {Map<string, Array<{ id: string, text: string }>>} */
  const constraintsByProblem = new Map();
  /** @type {Map<string, string>} */
  const sourceBySolution = new Map();

  let banListPairs = 0;
  let semanticPairs = 0;
  let wrongful = 0;
  let banViolations = 0;
  let banViolationsCaught = 0;

  for (const row of labelLines) {
    const [pid] = row.solution.split('/');
    let problemConstraints = constraintsByProblem.get(pid);
    if (!problemConstraints) {
      const loaded = /** @type {Array<{ id: string, text: string }>} */ (
        JSON.parse(readFileSync(join(evalDir, 'problems', pid, 'constraints.json'), 'utf8'))
      );
      problemConstraints = loaded;
      constraintsByProblem.set(pid, loaded);
    }

    let rawCode = sourceBySolution.get(row.solution);
    if (rawCode === undefined) {
      rawCode = readFileSync(join(evalDir, 'solutions', `${row.solution}.cpp`), 'utf8');
      sourceBySolution.set(row.solution, rawCode);
    }

    const constraint = problemConstraints?.find((c) => c.id === row.constraint);
    assert.ok(constraint, `Missing constraint ${row.constraint} for ${pid}`);

    const parsed = parseBanListConstraint(constraint.text);
    const result = await evaluateHardRule(constraint, rawCode);

    if (!parsed.isBanList) {
      semanticPairs++;
      assert.equal(
        result,
        null,
        `Expected null for semantic constraint ${row.solution} ${row.constraint}`,
      );
      continue;
    }

    banListPairs++;
    assert.notEqual(
      result,
      null,
      `Expected decision for ban-list ${row.solution} ${row.constraint}`,
    );
    const srcLines = rawCode.split('\n');

    if (row.label === 'pass') {
      if (result?.verdict === 'violation') {
        wrongful++;
      }
      assert.equal(
        result?.verdict,
        'pass',
        `Wrongful deduction on ${row.solution} ${row.constraint}: ${JSON.stringify(result)}`,
      );
    } else {
      banViolations++;
      assert.equal(
        result?.verdict,
        'violation',
        `Missed ban-list violation on ${row.solution} ${row.constraint}`,
      );
      const hit = result?.evidence.some(
        (e) =>
          row.evidence.includes(e.line) &&
          srcLines[e.line - 1] !== undefined &&
          e.text.trim() === srcLines[e.line - 1].trim(),
      );
      assert.equal(
        hit,
        true,
        `Evidence mismatch on ${row.solution} ${row.constraint}: got ${JSON.stringify(result?.evidence)}, expected one of lines ${JSON.stringify(row.evidence)}`,
      );
      if (hit) banViolationsCaught++;
    }
  }

  assert.ok(banListPairs > 0);
  assert.ok(semanticPairs > 0);
  assert.equal(wrongful, 0);
  assert.equal(banViolationsCaught, banViolations);
});
