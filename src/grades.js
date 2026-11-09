// Pure logic: no database, no HTTP. This is what unit tests are for.

// A mark out of 10: each constraint the TA upheld as a violation takes off the
// deduction the TA declared. The mark never goes below 0.
export function markFor(verdicts) {
  const lost = verdicts
    .filter((v) => v.verdict === 'violation' && v.decision !== 'overturn')
    .reduce((sum, v) => sum + v.deduction, 0);
  return Math.max(0, 10 - lost);
}

// What must go to the TA before publishing: every violation and every unsure.
export function needsReview(verdict) {
  return verdict === 'violation' || verdict === 'unsure';
}
