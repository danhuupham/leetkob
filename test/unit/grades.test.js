import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markFor, needsReview } from '../../src/grades.js';

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
