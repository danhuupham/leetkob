#!/usr/bin/env node
// LeeTKOB constraint-checker eval. Node >= 22, no dependencies.
//
//   node eval.mjs --data <dataset-dir> --predictions <file.jsonl> [--json <summary.json>]
//
// <dataset-dir> holds problems/, solutions/ and labels.jsonl (this folder, or the
// held-out set used for grading, which has the same layout).
//
// Exit codes: 0 = all thresholds met, 1 = a threshold failed, 2 = invalid input
// (bad dataset, malformed predictions file). The last line printed is always
// `PASS` or `FAIL (<reasons>)`.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const THRESHOLDS = { maxWrongful: 0, minRecall: 0.9, maxUnsure: 0.2 };
const VERDICTS = new Set(['pass', 'violation', 'unsure']);
const LABELS = new Set(['pass', 'violation']);
const TAGS = new Set(['obvious', 'disguised', 'trap', 'injection', 'style']);

function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error('usage: node eval.mjs --data <dataset-dir> --predictions <file.jsonl> [--json <summary.json>]');
  console.log('FAIL (usage)');
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage();
    if (!['--data', '--predictions', '--json'].includes(a)) usage(`unknown argument ${a}`);
    if (i + 1 >= argv.length) usage(`${a} needs a value`);
    out[a.slice(2)] = argv[++i];
  }
  if (!out.data || !out.predictions) usage('--data and --predictions are required');
  return out;
}

// Fatal input problems are collected, printed together, then exit 2.
const errors = [];
const err = (m) => errors.push(m);
function bailIfErrors(what) {
  if (!errors.length) return;
  console.error(`\n${what}: ${errors.length} error(s)`);
  for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
  if (errors.length > 50) console.error(`  … and ${errors.length - 50} more`);
  console.log(`FAIL (${what}: ${errors.length} error(s))`);
  process.exit(2);
}

const isInt = (x) => Number.isInteger(x) && x >= 1;
const fmtPct = (x) => (x * 100).toFixed(1) + '%';

// ------------------------------------------------------------------ dataset
function loadDataset(dir) {
  const root = resolve(dir);
  const labelsPath = join(root, 'labels.jsonl');
  if (!existsSync(labelsPath)) { err(`${labelsPath} not found`); bailIfErrors('invalid dataset'); }
  const constraints = new Map(); // problem -> Set(ids)
  const sources = new Map();     // "problem/sNN" -> lines[]
  const labels = new Map();      // "solution\u0000constraint" -> record
  const lines = readFileSync(labelsPath, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const where = `labels.jsonl:${i + 1}`;
    let r;
    try { r = JSON.parse(raw); } catch (e) { return err(`${where}: not valid JSON (${e.message})`); }
    const { solution, constraint, label, evidence, tags } = r ?? {};
    if (typeof solution !== 'string' || !/^[a-z0-9-]+\/s\d+$/.test(solution)) return err(`${where}: bad "solution"`);
    if (typeof constraint !== 'string') return err(`${where}: bad "constraint"`);
    if (!LABELS.has(label)) return err(`${where}: label must be pass|violation`);
    if (!Array.isArray(evidence) || !evidence.every(isInt)) return err(`${where}: evidence must be an array of line numbers`);
    if (label === 'violation' && evidence.length === 0) return err(`${where}: a violation needs evidence lines`);
    if (!Array.isArray(tags) || !tags.every((t) => TAGS.has(t))) return err(`${where}: unknown tag`);
    const [pid] = solution.split('/');
    if (!constraints.has(pid)) {
      const cpath = join(root, 'problems', pid, 'constraints.json');
      if (!existsSync(cpath)) { constraints.set(pid, null); return err(`${where}: ${cpath} not found`); }
      try { constraints.set(pid, new Set(JSON.parse(readFileSync(cpath, 'utf8')).map((c) => c.id))); }
      catch (e) { constraints.set(pid, null); return err(`${cpath}: ${e.message}`); }
    }
    const cids = constraints.get(pid);
    if (cids && !cids.has(constraint)) return err(`${where}: ${constraint} is not in ${pid}/constraints.json`);
    if (!sources.has(solution)) {
      const spath = join(root, 'solutions', `${solution}.cpp`);
      if (!existsSync(spath)) { sources.set(solution, null); return err(`${where}: ${spath} not found`); }
      sources.set(solution, readFileSync(spath, 'utf8').split('\n'));
    }
    const src = sources.get(solution);
    if (src && evidence.some((n) => n > src.length)) return err(`${where}: evidence line beyond end of file`);
    const key = `${solution}\u0000${constraint}`;
    if (labels.has(key)) return err(`${where}: duplicate label for ${solution} ${constraint}`);
    labels.set(key, { solution, constraint, label, evidence, tags });
  });
  // every solution must be labelled for every constraint of its problem
  for (const [sol, src] of sources) {
    const cids = constraints.get(sol.split('/')[0]);
    if (!src || !cids) continue;
    for (const c of cids) if (!labels.has(`${sol}\u0000${c}`)) err(`labels.jsonl: no label for ${sol} ${c}`);
  }
  bailIfErrors('invalid dataset');
  return { root, labels, sources };
}

// -------------------------------------------------------------- predictions
function loadPredictions(path, ds) {
  if (!existsSync(path)) { err(`${path} not found`); bailIfErrors('invalid predictions'); }
  const preds = new Map();
  readFileSync(path, 'utf8').split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const where = `line ${i + 1}`;
    let p;
    try { p = JSON.parse(raw); } catch (e) { return err(`${where}: not valid JSON (${e.message})`); }
    if (p === null || typeof p !== 'object' || Array.isArray(p)) return err(`${where}: expected a JSON object`);
    const { solution, constraint, verdict } = p;
    if (typeof solution !== 'string') return err(`${where}: "solution" must be a string`);
    if (typeof constraint !== 'string') return err(`${where}: "constraint" must be a string`);
    if (!ds.sources.has(solution)) return err(`${where}: unknown solution "${solution}"`);
    const key = `${solution}\u0000${constraint}`;
    if (!ds.labels.has(key)) return err(`${where}: unknown constraint "${constraint}" for ${solution}`);
    if (!VERDICTS.has(verdict)) return err(`${where}: unknown verdict ${JSON.stringify(verdict)} (expected pass|violation|unsure)`);
    const evidence = p.evidence ?? [];
    if (!Array.isArray(evidence)) return err(`${where}: "evidence" must be an array`);
    for (const e of evidence) {
      if (!e || typeof e !== 'object' || !isInt(e.line) || typeof e.text !== 'string')
        return err(`${where}: each evidence entry must be {"line": <int >= 1>, "text": <string>}`);
    }
    if (preds.has(key)) return err(`${where}: duplicate prediction for ${solution} ${constraint} (first at line ${preds.get(key).at})`);
    preds.set(key, { verdict, evidence, at: i + 1 });
  });
  bailIfErrors('invalid predictions');
  return preds;
}

// ------------------------------------------------------------------- scoring
function evidenceHits(pred, label, src) {
  // caught = at least one entry whose line is a labelled evidence line AND whose
  // text is exactly that source line (leading/trailing whitespace ignored)
  return pred.evidence.some((e) => label.evidence.includes(e.line) && src[e.line - 1] !== undefined &&
    e.text.trim() === src[e.line - 1].trim());
}

function score(ds, preds) {
  const rows = [];
  for (const [key, label] of ds.labels) {
    const pred = preds.get(key);
    const src = ds.sources.get(label.solution);
    const verdict = pred ? pred.verdict : 'unsure';
    let outcome;
    if (label.label === 'pass') outcome = verdict === 'violation' ? 'wrongful' : verdict === 'unsure' ? 'unsure' : 'ok';
    else if (verdict === 'violation') outcome = evidenceHits(pred, label, src) ? 'caught' : 'bad-evidence';
    else outcome = verdict === 'unsure' ? 'unsure' : 'missed';
    rows.push({ ...label, verdict, missing: !pred, outcome, pred });
  }
  return rows;
}

function summarize(rows) {
  const n = rows.length;
  const viol = rows.filter((r) => r.label === 'violation');
  const caught = viol.filter((r) => r.outcome === 'caught').length;
  const wrongful = rows.filter((r) => r.outcome === 'wrongful').length;
  const unsure = rows.filter((r) => r.verdict === 'unsure').length;
  return {
    pairs: n, passLabels: n - viol.length, violationLabels: viol.length,
    wrongful, caught, recall: viol.length ? caught / viol.length : 1,
    unsure, unsureRate: n ? unsure / n : 0, missing: rows.filter((r) => r.missing).length,
  };
}

// --------------------------------------------------------------------- main
const args = parseArgs(process.argv.slice(2));
const ds = loadDataset(args.data);
const preds = loadPredictions(resolve(args.predictions), ds);
const rows = score(ds, preds);
const s = summarize(rows);

console.log(`LeeTKOB eval · data ${ds.root} · predictions ${resolve(args.predictions)}`);
console.log(`${ds.sources.size} solutions, ${s.pairs} (solution, constraint) pairs: ${s.passLabels} labelled pass, ${s.violationLabels} labelled violation\n`);

const missingRows = rows.filter((r) => r.missing);
if (missingRows.length) {
  console.log(`Missing predictions (${missingRows.length}) — counted as "unsure":`);
  for (const r of missingRows) console.log(`  ${r.solution} ${r.constraint}`);
  console.log('');
}

const line = (label, value, ok, target) => console.log(`  ${label.padEnd(22)} ${String(value).padEnd(18)} ${ok ? 'ok  ' : 'FAIL'}  (target ${target})`);
const okW = s.wrongful <= THRESHOLDS.maxWrongful, okR = s.recall >= THRESHOLDS.minRecall, okU = s.unsureRate <= THRESHOLDS.maxUnsure;
console.log('Metrics');
line('wrongful deductions', `${s.wrongful}`, okW, `= ${THRESHOLDS.maxWrongful}`);
line('recall', `${fmtPct(s.recall)} (${s.caught}/${s.violationLabels})`, okR, `>= ${fmtPct(THRESHOLDS.minRecall)}`);
line('unsure rate', `${fmtPct(s.unsureRate)} (${s.unsure}/${s.pairs})`, okU, `<= ${fmtPct(THRESHOLDS.maxUnsure)}`);

console.log('\nBy tag (a pair can carry several tags)');
console.log(`  ${'tag'.padEnd(10)} ${'pairs'.padStart(5)} ${'pass'.padStart(5)} ${'viol'.padStart(5)} ${'caught'.padStart(7)} ${'wrongful'.padStart(9)} ${'unsure'.padStart(7)}`);
const groups = [...TAGS, '(none)'];
for (const t of groups) {
  const g = rows.filter((r) => (t === '(none)' ? r.tags.length === 0 : r.tags.includes(t)));
  if (!g.length) continue;
  const gs = summarize(g);
  console.log(`  ${t.padEnd(10)} ${String(gs.pairs).padStart(5)} ${String(gs.passLabels).padStart(5)} ${String(gs.violationLabels).padStart(5)} ` +
    `${(gs.violationLabels ? `${gs.caught}/${gs.violationLabels}` : '-').padStart(7)} ${String(gs.wrongful).padStart(9)} ${String(gs.unsure).padStart(7)}`);
}

const show = (r) => {
  const ev = r.pred?.evidence?.length ? r.pred.evidence.map((e) => `${e.line}:${JSON.stringify(e.text.trim().slice(0, 60))}`).join(', ') : '(none)';
  return `  ${r.solution} ${r.constraint} [${r.tags.join(',') || '-'}] labelled ${r.label}${r.label === 'violation' ? ` @ lines ${r.evidence.join(',')}` : ''}; predicted ${r.verdict}; evidence ${ev}`;
};
const wrong = rows.filter((r) => r.outcome === 'wrongful');
console.log(`\nWrongful deductions (${wrong.length})`);
wrong.forEach((r) => console.log(show(r)));
const notCaught = rows.filter((r) => r.label === 'violation' && r.outcome !== 'caught');
console.log(`\nViolations not caught (${notCaught.length})`);
for (const r of notCaught) {
  const why = { 'bad-evidence': 'flagged, but no evidence entry matches a labelled line with its exact text', missed: 'predicted pass', unsure: r.missing ? 'missing (counted unsure)' : 'predicted unsure' }[r.outcome];
  console.log(`${show(r)}\n      -> ${why}`);
}

if (args.json) writeFileSync(args.json, JSON.stringify({ ...s, thresholds: THRESHOLDS, pass: okW && okR && okU,
  wrongfulPairs: wrong.map((r) => `${r.solution} ${r.constraint}`), missedPairs: notCaught.map((r) => `${r.solution} ${r.constraint}`) }, null, 2) + '\n');

const reasons = [];
if (!okW) reasons.push(`${s.wrongful} wrongful deduction(s)`);
if (!okR) reasons.push(`recall ${fmtPct(s.recall)} < ${fmtPct(THRESHOLDS.minRecall)}`);
if (!okU) reasons.push(`unsure ${fmtPct(s.unsureRate)} > ${fmtPct(THRESHOLDS.maxUnsure)}`);
console.log('');
console.log(reasons.length ? `FAIL (${reasons.join('; ')})` : 'PASS');
process.exit(reasons.length ? 1 : 0);
