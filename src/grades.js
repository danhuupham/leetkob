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

/**
 * Computes final published mark and confirmed deduction list for a submission (FAQ-04, FAQ-11).
 *
 * @param {{
 *   manualMark: number | null,
 *   testVerdict: string,
 *   confirmedViolations: Array<{ constraintCode: string, text: string, deduction: number, evidence: unknown[] }>
 * }} params
 * @returns {{ mark: number, deductions: Array<{ constraintCode: string, text: string, deduction: number, evidence: unknown[] }> }}
 */
export function computePublishedGrade({ manualMark, testVerdict, confirmedViolations }) {
  if (manualMark !== null) {
    return { mark: Number(manualMark), deductions: [] };
  }
  if (testVerdict !== 'AC') {
    return { mark: 0, deductions: [] };
  }
  const deductions = confirmedViolations.map((v) => ({
    constraintCode: v.constraintCode,
    text: v.text,
    deduction: Number(v.deduction),
    evidence: v.evidence,
  }));
  const mark = markFor(
    confirmedViolations.map((v) => ({
      verdict: 'violation',
      decision: 'confirm',
      deduction: Number(v.deduction),
      constraintId: String(v.constraintCode),
    })),
  );
  return { mark, deductions };
}
