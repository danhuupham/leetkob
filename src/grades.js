// Pure logic: no database, no HTTP. This is what unit tests are for.

/**
 * A mark out of 10: each constraint the TA upheld as a violation takes off the
 * deduction the TA declared. Per FAQ-11, a single constraint (identified by
 * `constraintId` or `constraint` when present) is deducted at most once per
 * submission even if violated on multiple lines. The mark never goes below 0.
 *
 * @param {Array<{ verdict: string, decision?: string | null, deduction: number, constraintId?: string, constraint?: string }>} verdicts
 * @returns {number}
 */
export function markFor(verdicts) {
  const seenConstraints = new Set();
  const lost = verdicts
    .filter((v) => {
      if (v.verdict !== 'violation' || v.decision === 'overturn') return false;
      const key = v.constraintId ?? v.constraint;
      if (key !== undefined) {
        if (seenConstraints.has(key)) return false;
        seenConstraints.add(key);
      }
      return true;
    })
    .reduce((sum, v) => sum + v.deduction, 0);
  return Math.max(0, 10 - lost);
}

/**
 * What must go to the TA before publishing: every violation and every unsure.
 * @param {string} verdict
 * @returns {boolean}
 */
export function needsReview(verdict) {
  return verdict === 'violation' || verdict === 'unsure';
}
