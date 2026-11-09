import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markFor, needsReview } from '../../src/grades.js';
import { loadConfig, getSandboxEnv } from '../../src/config.js';

test('no violation keeps the full mark', () => {
  assert.equal(markFor([{ verdict: 'pass', deduction: 3 }]), 10);
});

test('an upheld violation takes off what the TA declared', () => {
  assert.equal(markFor([{ verdict: 'violation', decision: 'confirm', deduction: 3 }]), 7);
});

test('an overturned violation takes off nothing', () => {
  assert.equal(markFor([{ verdict: 'violation', decision: 'overturn', deduction: 3 }]), 10);
});

test('the mark never goes below 0', () => {
  const lots = [
    { verdict: 'violation', decision: 'confirm', deduction: 6 },
    { verdict: 'violation', decision: 'confirm', deduction: 6 },
  ];
  assert.equal(markFor(lots), 0);
});

test('violation and unsure need review; pass does not', () => {
  assert.equal(needsReview('violation'), true);
  assert.equal(needsReview('unsure'), true);
  assert.equal(needsReview('pass'), false);
});

test('markFor deducts each constraint at most once even with multiple violation lines (FAQ-11)', () => {
  const verdicts = [
    { constraintId: 'C1', verdict: 'violation', decision: 'confirm', deduction: 3 },
    { constraintId: 'C1', verdict: 'violation', decision: 'confirm', deduction: 3 },
    { constraintId: 'C2', verdict: 'violation', decision: 'confirm', deduction: 4 },
  ];
  assert.equal(markFor(verdicts), 3);
});

test('getSandboxEnv strips MODEL_API_KEY, SESSION_SECRET, and host secrets (Brief §5)', () => {
  const sandboxEnv = getSandboxEnv();
  assert.equal('MODEL_API_KEY' in sandboxEnv, false);
  assert.equal('SESSION_SECRET' in sandboxEnv, false);
  assert.equal('DATABASE_URL' in sandboxEnv, false);
  assert.equal(sandboxEnv.LANG, 'C.UTF-8');
});

test('loadConfig enforces FAQ-05 sandbox memory bounds (64..512 MB) and production secrets', () => {
  const cfg = loadConfig({ NODE_ENV: 'test', SANDBOX_MEMORY_LIMIT_MB: '256' });
  assert.equal(cfg.sandbox.memoryLimitMb, 256);
  assert.throws(() => loadConfig({ NODE_ENV: 'test', SANDBOX_MEMORY_LIMIT_MB: '1024' }));
  assert.throws(() => loadConfig({ NODE_ENV: 'production', MODEL_API_KEY: '' }));
});
