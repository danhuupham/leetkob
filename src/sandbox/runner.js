import { spawn, spawnSync } from 'node:child_process';
import { getSandboxEnv } from '../config.js';

/**
 * @typedef {{ ordinal: number, inputText: string, expectedOutput: string }} TestCaseInput
 * @typedef {{ ordinal: number, verdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' }} SingleTestResult
 * @typedef {{
 *   testVerdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE',
 *   compileStderr: string,
 *   testResults: SingleTestResult[],
 *   durationMs: number
 * }} SandboxJudgeResult
 */

/**
 * Token-by-token comparison ignoring leading/trailing/repeated whitespace.
 * @param {string} actual
 * @param {string} expected
 * @returns {boolean}
 */
function tokensEqual(actual, expected) {
  const actualTrimmed = actual.trim();
  const expectedTrimmed = expected.trim();
  if (actualTrimmed === '' && expectedTrimmed === '') return true;
  if (actualTrimmed === '' || expectedTrimmed === '') return false;
  const aTokens = actualTrimmed.split(/\s+/);
  const eTokens = expectedTrimmed.split(/\s+/);
  if (aTokens.length !== eTokens.length) return false;
  for (let i = 0; i < aTokens.length; i += 1) {
    if (aTokens[i] !== eTokens[i]) return false;
  }
  return true;
}

/**
 * Builds the POSIX shell script executed inside the `--network none` container.
 * Uses Base64 payloads passed via stdin so zero host bind mounts are needed.
 *
 * @param {{
 *   code: string,
 *   tests: TestCaseInput[],
 *   compilerCmd: string,
 *   compileTimeoutSec: number,
 *   cpuLimitSec: number,
 *   wallLimitSec: number,
 *   outputLimitBytes: number
 * }} opts
 * @returns {string}
 */
function buildContainerScript(opts) {
  const codeB64 = Buffer.from(opts.code, 'utf8').toString('base64');
  const lines = [
    'set +e',
    `printf '%s' '${codeB64}' | base64 -d > /tmp/main.cpp`,
    `timeout -s KILL ${opts.compileTimeoutSec}s ${opts.compilerCmd} /tmp/main.cpp -o /tmp/main >/tmp/compile.err 2>&1`,
    'ce_rc=$?',
    'if [ "$ce_rc" -ne 0 ]; then',
    '  ce_b64=$(base64 -w 0 /tmp/compile.err 2>/dev/null || true)',
    '  printf "___LEETKOB_CE___:%s\\n" "$ce_b64"',
    '  exit 0',
    'fi',
  ];

  for (const tc of opts.tests) {
    const inB64 = Buffer.from(tc.inputText ?? '', 'utf8').toString('base64');
    const ord = Number(tc.ordinal);
    lines.push(
      `printf '%s' '${inB64}' | base64 -d > /tmp/in.txt`,
      'rm -f /tmp/rc.txt /tmp/out.txt',
      't0=$(date +%s%3N)',
      '(',
      `  ulimit -S -t ${opts.cpuLimitSec} -H -t ${opts.cpuLimitSec + 1}`,
      `  timeout -k 1s ${opts.wallLimitSec}s /tmp/main < /tmp/in.txt 2>/dev/null`,
      '  echo $? > /tmp/rc.txt',
      `) | head -c ${opts.outputLimitBytes + 1} > /tmp/out.txt`,
      't1=$(date +%s%3N)',
      'elapsed=$((t1 - t0))',
      'rc=$(cat /tmp/rc.txt 2>/dev/null || echo 1)',
      'out_size=$(wc -c < /tmp/out.txt | tr -d " ")',
      `if [ "$out_size" -gt ${opts.outputLimitBytes} ]; then`,
      `  printf "___LEETKOB_TEST___:${ord}:OUTPUT_FLOOD:%s:%s:\\n" "$rc" "$elapsed"`,
      'else',
      '  out_b64=$(base64 -w 0 /tmp/out.txt 2>/dev/null || true)',
      `  printf "___LEETKOB_TEST___:${ord}:OK:%s:%s:%s\\n" "$rc" "$elapsed" "$out_b64"`,
      'fi',
    );
  }

  lines.push('exit 0', '');
  return lines.join('\n');
}

/**
 * Compiles AND runs C++17 code inside a single hardened `--network none` container.
 * Token-by-token output comparison (`actual.trim().split(/\s+/)` vs `expected.trim().split(/\s+/)`).
 *
 * @param {{
 *   jobId: string | number,
 *   code: string,
 *   tests: TestCaseInput[],
 *   sandboxConfig: typeof import('../config.js').config.sandbox,
 *   cpuLimitSec?: number,
 *   memoryLimitMb?: number
 * }} params
 * @returns {Promise<SandboxJudgeResult>}
 */
export async function runInSandbox(params) {
  const { code, tests, sandboxConfig } = params;
  const sortedTests = [...tests].sort((a, b) => a.ordinal - b.ordinal);

  const cpuLimitSec = Math.max(
    1,
    Math.min(5, Math.trunc(params.cpuLimitSec ?? sandboxConfig.cpuTimeLimitSec)),
  );
  const wallLimitSec =
    params.cpuLimitSec === undefined
      ? Math.max(cpuLimitSec * 3, Math.trunc(sandboxConfig.wallTimeLimitSec))
      : cpuLimitSec * 3;
  const memoryLimitMb = Math.max(
    64,
    Math.min(512, Math.trunc(params.memoryLimitMb ?? sandboxConfig.memoryLimitMb)),
  );
  const pidsLimit = Math.max(1, Math.trunc(sandboxConfig.pidsLimit));
  const outputLimitBytes = Math.max(1024, Math.trunc(sandboxConfig.outputLimitBytes));
  const compileTimeoutSec = Math.max(
    1,
    Math.ceil((sandboxConfig.compileTimeoutMs || 10000) / 1000),
  );
  const compilerCmd = sandboxConfig.compilerCmd || 'g++ -std=c++17 -O2';

  const containerName = `leetkob-judge-${crypto.randomUUID()}`;
  const dockerArgs = [
    'run',
    '-i',
    '--rm',
    '--name',
    containerName,
    '--network',
    'none',
    '--user',
    '65534:65534',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,exec,nosuid,nodev,size=32m',
    '--memory',
    `${memoryLimitMb}m`,
    '--memory-swap',
    `${memoryLimitMb}m`,
    '--pids-limit',
    String(pidsLimit),
    '--cpus',
    '1',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    sandboxConfig.image,
    'sh',
    '-s',
  ];

  const script = buildContainerScript({
    code,
    tests: sortedTests,
    compilerCmd,
    compileTimeoutSec,
    cpuLimitSec,
    wallLimitSec,
    outputLimitBytes,
  });

  const hostTimeoutMs =
    sortedTests.length > 0
      ? sortedTests.length * wallLimitSec * 1000 + 1500
      : compileTimeoutSec * 1000 + 1500;

  const startedAt = Date.now();
  const baseSandboxEnv = getSandboxEnv();
  const dockerCliEnv =
    process.platform === 'win32'
      ? {
          ...baseSandboxEnv,
          PATH: process.env.PATH || baseSandboxEnv.PATH,
          SystemRoot: process.env.SystemRoot || 'C:\\Windows',
          USERPROFILE: process.env.USERPROFILE || '',
        }
      : baseSandboxEnv;

  const rawResult = await new Promise((resolve, reject) => {
    const child = spawn('docker', dockerArgs, {
      env: dockerCliEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    /** @type {Buffer[]} */
    const stdoutChunks = [];
    /** @type {Buffer[]} */
    const stderrChunks = [];
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      // M3: kill the whole container so forked child processes holding stdout pipes die immediately.
      spawnSync('docker', ['rm', '-f', containerName], {
        env: dockerCliEnv,
        stdio: 'ignore',
      });
    }, hostTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });
    child.stdin.on('error', () => {
      // Ignore EPIPE if container terminates before reading full stdin.
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: exitCode ?? 1,
        timedOut,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });

    child.stdin.end(script, 'utf8');
  });

  const durationMs = Date.now() - startedAt;

  if (rawResult.timedOut) {
    return {
      testVerdict: 'TLE',
      compileStderr: '',
      testResults: sortedTests.map((tc) => ({ ordinal: tc.ordinal, verdict: 'TLE' })),
      durationMs,
    };
  }

  const lines = rawResult.stdout.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('___LEETKOB_CE___:')) {
      const b64 = line.slice('___LEETKOB_CE___:'.length);
      return {
        testVerdict: 'CE',
        compileStderr: Buffer.from(b64, 'base64').toString('utf8'),
        testResults: [],
        durationMs,
      };
    }
  }

  /** @type {Map<number, 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE'>} */
  const parsedByOrdinal = new Map();

  for (const line of lines) {
    if (!line.startsWith('___LEETKOB_TEST___:')) continue;
    const parts = line.split(':');
    if (parts.length < 6) continue;

    const ordinal = Number(parts[1]);
    const status = parts[2];
    const rc = Number(parts[3]);
    const elapsed = Number(parts[4]);
    const outB64 = parts.slice(5).join(':');

    const tc = sortedTests.find((t) => t.ordinal === ordinal);
    if (!tc) continue;

    /** @type {'AC' | 'WA' | 'TLE' | 'MLE' | 'RE'} */
    let verdict;

    if (status === 'OUTPUT_FLOOD') {
      verdict = 'RE';
    } else if (rc === 124 || rc === 152 || (rc === 137 && elapsed >= cpuLimitSec * 900)) {
      verdict = 'TLE';
    } else if (rc === 137) {
      verdict = 'MLE';
    } else if (rc !== 0) {
      verdict = 'RE';
    } else {
      const actualOut = Buffer.from(outB64, 'base64').toString('utf8');
      verdict = tokensEqual(actualOut, tc.expectedOutput) ? 'AC' : 'WA';
    }

    parsedByOrdinal.set(ordinal, verdict);
  }

  if (parsedByOrdinal.size === 0 && rawResult.exitCode !== 0) {
    return {
      testVerdict: 'RE',
      compileStderr: rawResult.stderr,
      testResults: sortedTests.map((tc) => ({ ordinal: tc.ordinal, verdict: 'RE' })),
      durationMs,
    };
  }

  /** @type {SingleTestResult[]} */
  const testResults = sortedTests.map((tc) => ({
    ordinal: tc.ordinal,
    verdict: parsedByOrdinal.get(tc.ordinal) ?? 'RE',
  }));

  const firstFailure = testResults.find((r) => r.verdict !== 'AC');
  return {
    testVerdict: firstFailure ? firstFailure.verdict : 'AC',
    compileStderr: '',
    testResults,
    durationMs,
  };
}
