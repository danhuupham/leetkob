// Secret scanner for both the working tree and the entire git commit history.
// Exits with code 1 if any key-shaped literal or secret assignment is detected
// outside test/.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set([
  '.git',
  'node_modules',
  'public',
  'test',
  'playwright-report',
  'test-results',
  'data',
]);
const FORBIDDEN_TRACKED = new Set(['.env', 'marking.env', 'ACCESS.md']);

/** @type {Array<[string, RegExp]>} */
const RULES = [
  ['LeeTKOB live key (lk_live_...)', /lk_live_[A-Za-z0-9]{16,}/],
  ['Google / Gemini API key (AIza...)', /AIza[0-9A-Za-z_-]{35}/],
  ['OpenAI API key (sk-...)', /sk-[A-Za-z0-9_-]{20,}/],
  ['GitHub personal/OAuth token (ghp_/gho_...)', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  [
    'Hardcoded secret assignment',
    /(api[_-]?key|session[_-]?secret|password)\s*[:=]\s*['"][^'"\s]{16,}['"]/i,
  ],
];

/**
 * @param {string} dir
 * @returns {Generator<string>}
 */
function* walkFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      yield* walkFiles(fullPath);
    } else {
      yield fullPath;
    }
  }
}

/**
 * Scans working tree files and full git history (git log -p --all).
 * @param {string} [root]
 */
export function scan(root = ROOT) {
  /** @type {Array<{ source: string, line: number, rule: string }>} */
  const findings = [];

  /** @type {string[] | null} */
  let candidateFiles = null;
  try {
    const trackedOut = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
    for (const rel of trackedOut.split('\n').filter(Boolean)) {
      if (FORBIDDEN_TRACKED.has(rel) || rel.endsWith('.env')) {
        findings.push({ source: rel, line: 1, rule: 'Forbidden env/access file tracked in git' });
      }
    }
    const visibleOut = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: root, encoding: 'utf8' },
    );
    candidateFiles = visibleOut
      .split('\n')
      .filter((rel) => rel && !rel.startsWith('test/'))
      .map((rel) => join(root, rel));
  } catch {
    candidateFiles = null;
  }

  for (const filePath of candidateFiles ?? walkFiles(root)) {
    let content;
    try {
      if (!statSync(filePath).isFile()) continue;
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const relPath = relative(root, filePath);
    content.split('\n').forEach((line, idx) => {
      for (const [rule, regex] of RULES) {
        if (regex.test(line)) {
          findings.push({ source: relPath, line: idx + 1, rule });
        }
      }
    });
  }

  try {
    const historyPatch = execFileSync(
      'git',
      ['log', '-p', '--all', '--', '.', ':!test', ':!package-lock.json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    let currentCommit = 'unknown';
    historyPatch.split('\n').forEach((line, idx) => {
      if (line.startsWith('commit ')) {
        currentCommit = line.slice(7, 14);
        return;
      }
      if (!line.startsWith('+') || line.startsWith('+++')) return;
      for (const [rule, regex] of RULES) {
        if (regex.test(line)) {
          findings.push({ source: `git-history@${currentCommit}`, line: idx + 1, rule });
        }
      }
    });
  } catch {
    // Not a git repository or git unavailable; working-tree findings still apply.
  }

  return findings;
}

const isMain =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  const found = scan();
  for (const f of found) {
    console.log(`${f.source}:${f.line}  ${f.rule}`);
  }
  console.log(
    found.length ? `${found.length} finding(s)` : 'no secrets found in tree or git history',
  );
  process.exit(found.length ? 1 : 0);
}
