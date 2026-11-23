import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../src/config.js';
import { runInSandbox } from '../../src/sandbox/runner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ATTACKS_DIR = join(HERE, '..', 'fixtures', 'attacks');

/**
 * @param {string} filename
 * @returns {string}
 */
function readAttack(filename) {
  return readFileSync(join(ATTACKS_DIR, filename), 'utf8');
}

/**
 * @returns {string}
 */
function listRunningJudgeContainers() {
  return execFileSync('docker', ['ps', '-q', '--filter', 'name=leetkob-judge-'], {
    encoding: 'utf8',
  }).trim();
}

const DEFAULT_SANDBOX_CONFIG = Object.freeze({
  ...config.sandbox,
  image: process.env.SANDBOX_IMAGE || 'leetkob-sandbox:test',
});

test('compliant C++17 solution compiles inside sandbox and passes token-by-token', async () => {
  const code = [
    '#include <iostream>',
    'int main() {',
    '  int a, b;',
    '  if (std::cin >> a >> b) {',
    '    std::cout << (a + b) << "   \\n";',
    '  }',
    '  return 0;',
    '}',
    '',
  ].join('\n');

  const res = await runInSandbox({
    jobId: 'compliant-1',
    code,
    tests: [
      { ordinal: 1, inputText: '2 3\n', expectedOutput: '5\n' },
      { ordinal: 2, inputText: '10 20\n', expectedOutput: '30' },
    ],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
  });

  assert.equal(res.testVerdict, 'AC');
  assert.equal(res.testResults.length, 2);
  assert.equal(res.testResults[0].verdict, 'AC');
  assert.equal(res.testResults[1].verdict, 'AC');
});

test('M1: sandbox blocks outbound TCP/UDP network connections', async () => {
  const res = await runInSandbox({
    jobId: 'm1-network',
    code: readAttack('m1_network.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
  });

  assert.equal(res.testVerdict, 'RE');
});

test('M2: sandbox enforces CPU time limit on infinite compute loop', async () => {
  const res = await runInSandbox({
    jobId: 'm2-cpu',
    code: readAttack('m2_cpu.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
    cpuLimitSec: 1,
  });

  assert.equal(res.testVerdict, 'TLE');
  assert.ok(
    res.durationMs < 2500,
    `Expected ulimit -t 1 to kill CPU loop well before wallLimitSec=3s, got ${res.durationMs}ms`,
  );
});

test('M3: wall-clock limit kills entire container when forked child holds stdout pipe', async () => {
  const res = await runInSandbox({
    jobId: 'm3-wall-fork-pipe',
    code: readAttack('m3_wall_fork_pipe.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
    cpuLimitSec: 1,
  });

  assert.equal(res.testVerdict, 'TLE');
  assert.ok(res.durationMs < 6500, `Expected container kill < 6500ms, got ${res.durationMs}ms`);
  assert.equal(listRunningJudgeContainers(), '');
});

test('M4: sandbox enforces memory+swap limit on 1 GiB volatile page-touch readback', async () => {
  const res = await runInSandbox({
    jobId: 'm4-memory',
    code: readAttack('m4_memory_1gib_readback.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
    memoryLimitMb: 256,
  });

  assert.ok(
    res.testVerdict === 'MLE' || res.testVerdict === 'RE',
    `Expected MLE or RE for 1 GiB allocation under 256MB limit, got ${res.testVerdict}`,
  );
});

test('M5: sandbox enforces --pids-limit 16 against fork bomb and leaves no container', async () => {
  const res = await runInSandbox({
    jobId: 'm5-pids',
    code: readAttack('m5_pids_fork_bomb.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
  });

  assert.ok(
    res.testVerdict === 'RE' || res.testVerdict === 'TLE',
    `Expected RE or TLE against fork bomb, got ${res.testVerdict}`,
  );
  assert.equal(listRunningJudgeContainers(), '');
});

test('M6: sandbox enforces 1 MiB output size limit against stdout flood', async () => {
  const res = await runInSandbox({
    jobId: 'm6-output',
    code: readAttack('m6_output_flood.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
  });

  assert.equal(res.testVerdict, 'RE');
});

test('M7: sandbox runs as non-root 65534:65534 with read-only root filesystem', async () => {
  const res = await runInSandbox({
    jobId: 'm7-non-root',
    code: readAttack('m7_non_root.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
  });

  assert.equal(res.testVerdict, 'RE');
});

test('M8: sandbox has no host mounts and no access to /var/run/docker.sock', async () => {
  const res = await runInSandbox({
    jobId: 'm8-no-mounts',
    code: readAttack('m8_no_mounts_no_sock.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
  });

  assert.equal(res.testVerdict, 'RE');
});

test('M9a: sandbox environment receives no MODEL_API_KEY, SESSION_SECRET, or .env file', async () => {
  const prevApiKey = process.env.MODEL_API_KEY;
  const prevSessionSecret = process.env.SESSION_SECRET;
  process.env.MODEL_API_KEY = 'sandbox-test-dummy-api-key';
  process.env.SESSION_SECRET = 'sandbox-test-dummy-session';

  try {
    const res = await runInSandbox({
      jobId: 'm9-no-secrets',
      code: readAttack('m9_no_secrets.cpp'),
      tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
      sandboxConfig: DEFAULT_SANDBOX_CONFIG,
    });

    assert.equal(res.testVerdict, 'RE');
  } finally {
    if (prevApiKey === undefined) {
      delete process.env.MODEL_API_KEY;
    } else {
      process.env.MODEL_API_KEY = prevApiKey;
    }
    if (prevSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = prevSessionSecret;
    }
  }
});

test('M9b: compilation occurs inside sandbox so #include of a host-only sentinel fails with CE', async () => {
  const sentinelDir = mkdtempSync(join(tmpdir(), 'leetkob-m9-sentinel-'));
  const sentinelPath = join(sentinelDir, 'host_secret.h');
  writeFileSync(
    sentinelPath,
    'static const char* LEAKED_SECRET = "HOST_SENTINEL_MODEL_API_KEY_LEAKED";\n',
    'utf8',
  );
  assert.equal(existsSync(sentinelPath), true);

  try {
    const code = readAttack('m9_include_env.cpp').replace(
      '__HOST_SENTINEL_PATH__',
      sentinelPath.replace(/\\/g, '/'),
    );
    const res = await runInSandbox({
      jobId: 'm9-include-env',
      code,
      tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
      sandboxConfig: DEFAULT_SANDBOX_CONFIG,
    });

    assert.equal(res.testVerdict, 'CE');
    assert.equal(res.compileStderr.includes('HOST_SENTINEL_MODEL_API_KEY_LEAKED'), false);
    assert.equal(res.compileStderr.includes('MODEL_API_KEY'), false);
  } finally {
    rmSync(sentinelDir, { recursive: true, force: true });
  }
});

test('M3 multi-test: per-phase watchdog kills fork-pipe attack on multi-test lab within 1 test wall limit', async () => {
  const res = await runInSandbox({
    jobId: 'm3-multi-test',
    code: readAttack('m3_wall_fork_pipe.cpp'),
    tests: [
      { ordinal: 1, inputText: '', expectedOutput: 'PWNED' },
      { ordinal: 2, inputText: '', expectedOutput: 'PWNED' },
      { ordinal: 3, inputText: '', expectedOutput: 'PWNED' },
      { ordinal: 4, inputText: '', expectedOutput: 'PWNED' },
    ],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
    cpuLimitSec: 1,
  });

  assert.equal(res.testVerdict, 'TLE');
  assert.ok(
    res.durationMs < 7500,
    `Expected per-test watchdog kill well before 4*3s, got ${res.durationMs}ms`,
  );
  assert.equal(listRunningJudgeContainers(), '');
});

test('M6 /proc/1/fd/1 flood & marker spoofing: Node byte cap and per-run nonce block escape', async () => {
  const code = [
    '#include <cstdio>',
    '#include <cstring>',
    'int main() {',
    '  FILE* f = std::fopen("/proc/1/fd/1", "w");',
    '  if (f) {',
    '    std::fputs("___LEETKOB_TEST___:1:OK:0:1:UUVORUQ=\\n", f);',
    '    char buf[4096];',
    "    std::memset(buf, 'A', sizeof(buf));",
    '    for (int i = 0; i < 1024; ++i) std::fwrite(buf, 1, sizeof(buf), f);',
    '    std::fclose(f);',
    '  }',
    '  return 0;',
    '}',
    '',
  ].join('\n');

  const res = await runInSandbox({
    jobId: 'm6-proc-fd1',
    code,
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
  });

  assert.equal(res.testVerdict, 'RE');
  assert.equal(listRunningJudgeContainers(), '');
});

test('Docker infrastructure failure (missing image exit 125) throws instead of returning RE', async () => {
  await assert.rejects(
    () =>
      runInSandbox({
        jobId: 'infra-fail',
        code: 'int main() { return 0; }\n',
        tests: [{ ordinal: 1, inputText: '', expectedOutput: '' }],
        sandboxConfig: {
          ...DEFAULT_SANDBOX_CONFIG,
          image: 'leetkob-nonexistent-image:does-not-exist',
        },
      }),
    /Sandbox Docker infrastructure failure/,
  );
});
