import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
 *   outputLimitBytes: number,
 *   ceMarker: string,
 *   compiledMarker: string,
 *   testMarker: string
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
    '  ce_b64=$(head -c 65536 /tmp/compile.err 2>/dev/null | base64 -w 0 2>/dev/null || true)',
    `  printf "${opts.ceMarker}%s\\n" "$ce_b64"`,
    '  exit 0',
    'fi',
    `printf "${opts.compiledMarker}\\n"`,
  ];

  for (const tc of opts.tests) {
    const inB64 = Buffer.from(tc.inputText ?? '', 'utf8').toString('base64');
    const ord = Number(tc.ordinal);
    lines.push(
      `printf '%s' '${inB64}' | base64 -d > /tmp/in.txt`,
      'rm -rf /tmp/rc.txt /tmp/out.txt',
      't0=$(date +%s%3N)',
      '(',
      `  ulimit -S -t ${opts.cpuLimitSec}`,
      `  ulimit -H -t ${opts.cpuLimitSec + 1}`,
      `  timeout -s KILL ${opts.wallLimitSec}s /tmp/main < /tmp/in.txt 2>/dev/null`,
      '  rc_code=$?',
      '  rm -rf /tmp/rc.txt',
      '  echo "$rc_code" > /tmp/rc.txt',
      `) | head -c ${opts.outputLimitBytes + 1} > /tmp/out.txt`,
      't1=$(date +%s%3N)',
      'elapsed=$((t1 - t0))',
      'rc=$(cat /tmp/rc.txt 2>/dev/null || echo 1)',
      'out_size=$(wc -c < /tmp/out.txt | tr -d " ")',
      `if [ "$out_size" -gt ${opts.outputLimitBytes} ]; then`,
      `  printf "${opts.testMarker}${ord}:OUTPUT_FLOOD:%s:%s:\\n" "$rc" "$elapsed"`,
      'else',
      '  out_b64=$(base64 -w 0 /tmp/out.txt 2>/dev/null || true)',
      `  printf "${opts.testMarker}${ord}:OK:%s:%s:%s\\n" "$rc" "$elapsed" "$out_b64"`,
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

  const nonce = randomBytes(8).toString('hex');
  const ceMarker = `___LEETKOB_${nonce}_CE___:`;
  const compiledMarker = `___LEETKOB_${nonce}_COMPILED___`;
  const testMarker = `___LEETKOB_${nonce}_TEST___:`;

  const script = buildContainerScript({
    code,
    tests: sortedTests,
    compilerCmd,
    compileTimeoutSec,
    cpuLimitSec,
    wallLimitSec,
    outputLimitBytes,
    ceMarker,
    compiledMarker,
    testMarker,
  });

  const compileWatchdogMs = compileTimeoutSec * 1000 + 2000;
  const testWatchdogMs = wallLimitSec * 1000 + 1500;
  const maxStdoutBytes =
    Math.ceil(outputLimitBytes * 1.4) * Math.max(1, sortedTests.length) + 256 * 1024;
  const maxStderrBytes = 256 * 1024;

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
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let lineRemainder = '';
    let timedOut = false;
    let outputOverflow = false;
    let killing = false;
    let settled = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let watchdogTimer;

    const killContainer = () => {
      if (killing) return;
      killing = true;
      // M3: kill the whole container asynchronously so forked child processes holding pipes die immediately.
      execFile('docker', ['rm', '-f', containerName], { env: dockerCliEnv }, () => {
        // Ignore errors if container already exited or was never registered.
      });
      const fallback = setTimeout(() => {
        if (!settled) {
          try {
            child.kill('SIGKILL');
          } catch {
            // Ignore if child already exited.
          }
        }
      }, 1500);
      fallback.unref();
    };

    /**
     * @param {number} ms
     */
    const armWatchdog = (ms) => {
      if (watchdogTimer !== undefined) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        timedOut = true;
        killContainer();
      }, ms);
    };

    armWatchdog(compileWatchdogMs);

    child.stdout.on('data', (chunk) => {
      if (outputOverflow) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) {
        outputOverflow = true;
        killContainer();
        return;
      }
      stdoutChunks.push(chunk);

      // Reset per-phase watchdog when compilation completes or a test marker finishes.
      const text = lineRemainder + chunk.toString('utf8');
      const parts = text.split(/\r?\n/);
      lineRemainder = parts.pop() ?? '';
      for (const line of parts) {
        if (line === compiledMarker || line.startsWith(testMarker)) {
          armWatchdog(testWatchdogMs);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      if (outputOverflow) return;
      stderrBytes += chunk.length;
      if (stderrBytes > maxStderrBytes) {
        outputOverflow = true;
        killContainer();
        return;
      }
      stderrChunks.push(chunk);
    });

    child.stdin.on('error', () => {
      // Ignore EPIPE if container terminates before reading full stdin.
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (watchdogTimer !== undefined) clearTimeout(watchdogTimer);
      reject(err);
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      if (watchdogTimer !== undefined) clearTimeout(watchdogTimer);
      resolve({
        exitCode: exitCode ?? 1,
        timedOut,
        outputOverflow,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });

    child.stdin.end(script, 'utf8');
  });

  const durationMs = Date.now() - startedAt;

  if (rawResult.outputOverflow) {
    return {
      testVerdict: 'RE',
      compileStderr: '',
      testResults: sortedTests.map((tc) => ({ ordinal: tc.ordinal, verdict: 'RE' })),
      durationMs,
    };
  }

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
    if (line.startsWith(ceMarker)) {
      const b64 = line.slice(ceMarker.length);
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
  const sigkillTleThresholdMs = Math.min(cpuLimitSec + 1, wallLimitSec) * 900;

  for (const line of lines) {
    if (!line.startsWith(testMarker)) continue;
    const payload = line.slice(testMarker.length);
    const parts = payload.split(':');
    if (parts.length < 5) continue;

    const ordinal = Number(parts[0]);
    const status = parts[1];
    const rc = Number(parts[2]);
    const elapsed = Number(parts[3]);
    const outB64 = parts.slice(4).join(':');

    const tc = sortedTests.find((t) => t.ordinal === ordinal);
    if (!tc) continue;

    /** @type {'AC' | 'WA' | 'TLE' | 'MLE' | 'RE'} */
    let verdict;

    if (status === 'OUTPUT_FLOOD') {
      verdict = 'RE';
    } else if (
      elapsed > wallLimitSec * 1000 ||
      rc === 124 ||
      rc === 152 ||
      (rc === 137 && elapsed >= sigkillTleThresholdMs)
    ) {
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

  if (parsedByOrdinal.size === 0 && [125, 126, 127].includes(rawResult.exitCode)) {
    throw new Error(
      `Sandbox Docker infrastructure failure (exit ${rawResult.exitCode}): ${rawResult.stderr.trim()}`,
    );
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
