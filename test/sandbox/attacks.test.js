import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

test('M9b: compilation occurs inside sandbox so #include "/app/.env" fails with CE', async () => {
  const res = await runInSandbox({
    jobId: 'm9-include-env',
    code: readAttack('m9_include_env.cpp'),
    tests: [{ ordinal: 1, inputText: '', expectedOutput: 'PWNED' }],
    sandboxConfig: DEFAULT_SANDBOX_CONFIG,
  });

  assert.equal(res.testVerdict, 'CE');
  assert.equal(res.compileStderr.includes('MODEL_API_KEY'), false);
});
