// TA review queue listing and individual submission/verdict review decisions.
import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';
import { needsReview } from '../grades.js';

/**
 * @param {string | null | undefined} raw
 * @returns {Array<{ line: number, text: string }>}
 */
function parseEvidenceJson(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Groups constraint verdict rows by submission ID and attaches them to submission rows.
 *
 * @param {Array<{ id: number, student: string, judge_status: string, job_status: string | null, test_verdict: string, submitted_at: string }>} subRows
 * @param {Array<{ id: number, submission_id: number, constraint_code: string, rule_text: string, deduction: number, verdict: string, source: string, unsure_reason: string | null, evidence_json: string, model_rationale: string | null, ta_decision: string | null }>} verdictRows
 */
function buildSubmissionsWithVerdicts(subRows, verdictRows) {
  /** @type {Map<number, Array<Record<string, unknown>>>} */
  const verdictsBySub = new Map();
  for (const v of verdictRows) {
    const list = verdictsBySub.get(v.submission_id) ?? [];
    list.push({
      verdictId: v.id,
      constraintCode: v.constraint_code,
      ruleText: v.rule_text,
      deduction: v.deduction,
      verdict: v.verdict,
      source: v.source,
      unsureReason: v.unsure_reason,
      evidence: parseEvidenceJson(v.evidence_json),
      rationale: v.model_rationale,
      taDecision: v.ta_decision,
    });
    verdictsBySub.set(v.submission_id, list);
  }

  return subRows.map((s) => ({
    id: s.id,
    student: s.student,
    judgeStatus: s.judge_status,
    jobStatus: s.job_status ?? null,
    testVerdict: s.test_verdict,
    submittedAt: s.submitted_at,
    verdicts: verdictsBySub.get(s.id) ?? [],
  }));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createQueueRoutes(db, auth) {
  const q = {
    lab: db.prepare('SELECT id, class_id, published_at, cost_spent_usd FROM labs WHERE id = ?'),
    byLab: db.prepare(
      `SELECT s.id, u.name AS student, s.verdict, s.decision, s.code
       FROM submissions s
       JOIN users u ON u.id = s.student_id
       WHERE s.lab_id = ?
       ORDER BY s.id`,
    ),
    submission: db.prepare(
      `SELECT s.id, l.class_id FROM submissions s
       JOIN labs l ON l.id = s.lab_id WHERE s.id = ?`,
    ),
    review: db.prepare('UPDATE submissions SET decision = ? WHERE id = ?'),
    pa3Queue: db.prepare(
      `SELECT cv.id, cv.submission_id, u.name AS student,
              cv.constraint_code, lc.rule_text, lc.deduction,
              cv.verdict, cv.source, cv.unsure_reason,
              cv.evidence_json, cv.model_rationale, cv.ta_decision
       FROM constraint_verdicts cv
       JOIN submissions s ON s.id = cv.submission_id
       JOIN users u ON u.id = s.student_id
       JOIN labs l ON l.id = s.lab_id
       JOIN lab_constraints lc
         ON lc.lab_id = s.lab_id AND lc.constraint_code = cv.constraint_code
       WHERE s.lab_id = ?
         AND s.test_verdict = 'AC'
         AND s.id = (
           SELECT MAX(s2.id)
           FROM submissions s2
           WHERE s2.lab_id = s.lab_id
             AND s2.student_id = s.student_id
             AND s2.submitted_at <= l.deadline_at
         )
         AND cv.verdict IN ('violation', 'unsure')
       ORDER BY cv.id`,
    ),
    countedSubmissions: db.prepare(
      `SELECT s.id, u.name AS student, s.judge_status, j.status AS job_status,
              s.test_verdict, s.submitted_at
       FROM submissions s
       JOIN users u ON u.id = s.student_id
       JOIN labs l ON l.id = s.lab_id
       LEFT JOIN judge_jobs j ON j.submission_id = s.id
       WHERE s.lab_id = ?
         AND s.code != ''
         AND s.id = (
           SELECT MAX(s2.id)
           FROM submissions s2
           WHERE s2.lab_id = s.lab_id
             AND s2.student_id = s.student_id
             AND s2.submitted_at <= l.deadline_at
         )
       ORDER BY s.id`,
    ),
    countedVerdicts: db.prepare(
      `SELECT cv.id, cv.submission_id, cv.constraint_code, lc.rule_text, lc.deduction,
              cv.verdict, cv.source, cv.unsure_reason, cv.evidence_json,
              cv.model_rationale, cv.ta_decision
       FROM constraint_verdicts cv
       JOIN submissions s ON s.id = cv.submission_id
       JOIN labs l ON l.id = s.lab_id
       JOIN lab_constraints lc
         ON lc.lab_id = s.lab_id AND lc.constraint_code = cv.constraint_code
       WHERE s.lab_id = ?
         AND s.id = (
           SELECT MAX(s2.id)
           FROM submissions s2
           WHERE s2.lab_id = s.lab_id
             AND s2.student_id = s.student_id
             AND s2.submitted_at <= l.deadline_at
         )
       ORDER BY cv.submission_id, cv.id`,
    ),
    supersededSubmissions: db.prepare(
      `SELECT s.id, u.name AS student, s.judge_status, j.status AS job_status,
              s.test_verdict, s.submitted_at
       FROM submissions s
       JOIN users u ON u.id = s.student_id
       JOIN labs l ON l.id = s.lab_id
       LEFT JOIN judge_jobs j ON j.submission_id = s.id
       WHERE s.lab_id = ?
         AND s.code != ''
         AND s.submitted_at <= l.deadline_at
         AND s.id < (
           SELECT MAX(s2.id)
           FROM submissions s2
           WHERE s2.lab_id = s.lab_id
             AND s2.student_id = s.student_id
             AND s2.submitted_at <= l.deadline_at
         )
       ORDER BY s.id`,
    ),
    supersededVerdicts: db.prepare(
      `SELECT cv.id, cv.submission_id, cv.constraint_code, lc.rule_text, lc.deduction,
              cv.verdict, cv.source, cv.unsure_reason, cv.evidence_json,
              cv.model_rationale, cv.ta_decision
       FROM constraint_verdicts cv
       JOIN submissions s ON s.id = cv.submission_id
       JOIN labs l ON l.id = s.lab_id
       JOIN lab_constraints lc
         ON lc.lab_id = s.lab_id AND lc.constraint_code = cv.constraint_code
       WHERE s.lab_id = ?
         AND s.code != ''
         AND s.submitted_at <= l.deadline_at
         AND s.id < (
           SELECT MAX(s2.id)
           FROM submissions s2
           WHERE s2.lab_id = s.lab_id
             AND s2.student_id = s.student_id
             AND s2.submitted_at <= l.deadline_at
         )
       ORDER BY cv.submission_id, cv.id`,
    ),
    verdict: db.prepare(
      `SELECT cv.id, cv.submission_id, s.code, l.class_id, l.published_at
       FROM constraint_verdicts cv
       JOIN submissions s ON s.id = cv.submission_id
       JOIN labs l ON l.id = s.lab_id
       WHERE cv.id = ?`,
    ),
    verdictReview: db.prepare(
      `UPDATE constraint_verdicts
       SET ta_decision = ?, reviewed_by = ?, reviewed_at = datetime('now'),
           evidence_json = ?
       WHERE id = ?`,
    ),
  };

  return [
    [
      'GET',
      '/api/labs/:labId/queue',
      (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const labId = parsePositiveInt(params.labId);
        const lab =
          labId !== null
            ? /** @type {{ id: number, class_id: number, published_at: string | null, cost_spent_usd: number } | undefined} */ (
                q.lab.get(labId)
              )
            : undefined;
        if (!lab || !auth.isStaff(me, lab.class_id)) {
          return problem(res, 404, 'not-found', 'No such lab', {
            detail: 'Requested lab was not found',
          });
        }

        const legacyItems =
          /** @type {Array<{ id: number, student: string, verdict: string, decision: string | null, code: string }>} */ (
            q.byLab.all(lab.id)
          )
            .filter((s) => s.code === '' && needsReview(s.verdict))
            .map((s) => ({
              id: s.id,
              student: s.student,
              verdict: s.verdict,
              decision: s.decision,
            }));

        const pa3Items =
          /** @type {Array<{ id: number, submission_id: number, student: string, constraint_code: string, rule_text: string, deduction: number, verdict: string, source: string, unsure_reason: string | null, evidence_json: string, model_rationale: string | null, ta_decision: string | null }>} */ (
            q.pa3Queue.all(lab.id)
          ).map((v) => ({
            id: v.submission_id,
            verdictId: v.id,
            student: v.student,
            constraintCode: v.constraint_code,
            ruleText: v.rule_text,
            deduction: v.deduction,
            verdict: v.verdict,
            source: v.source,
            unsureReason: v.unsure_reason,
            evidence: parseEvidenceJson(v.evidence_json),
            rationale: v.model_rationale,
            taDecision: v.ta_decision,
            decision: v.ta_decision,
          }));

        const submissions = buildSubmissionsWithVerdicts(
          /** @type {Array<{ id: number, student: string, judge_status: string, job_status: string | null, test_verdict: string, submitted_at: string }>} */ (
            q.countedSubmissions.all(lab.id)
          ),
          /** @type {Array<{ id: number, submission_id: number, constraint_code: string, rule_text: string, deduction: number, verdict: string, source: string, unsure_reason: string | null, evidence_json: string, model_rationale: string | null, ta_decision: string | null }>} */ (
            q.countedVerdicts.all(lab.id)
          ),
        );

        const supersededSubmissions = buildSubmissionsWithVerdicts(
          /** @type {Array<{ id: number, student: string, judge_status: string, job_status: string | null, test_verdict: string, submitted_at: string }>} */ (
            q.supersededSubmissions.all(lab.id)
          ),
          /** @type {Array<{ id: number, submission_id: number, constraint_code: string, rule_text: string, deduction: number, verdict: string, source: string, unsure_reason: string | null, evidence_json: string, model_rationale: string | null, ta_decision: string | null }>} */ (
            q.supersededVerdicts.all(lab.id)
          ),
        );

        return send(res, 200, {
          lab: lab.id,
          publishedAt: lab.published_at,
          costSpentUsd: lab.cost_spent_usd,
          items: [...legacyItems, ...pa3Items],
          submissions,
          supersededSubmissions,
        });
      },
    ],
    [
      'POST',
      '/api/submissions/:id/review',
      async (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const subId = parsePositiveInt(params.id);
        const s =
          subId !== null
            ? /** @type {{ id: number, class_id: number } | undefined} */ (q.submission.get(subId))
            : undefined;
        if (!s || !auth.isStaff(me, s.class_id)) {
          return problem(res, 404, 'not-found', 'No such lab', {
            detail: 'Requested submission was not found',
          });
        }

        const body = await readJson(req);
        if (
          !body ||
          body.__nonObjectJson ||
          body.__payloadTooLarge ||
          !['confirm', 'overturn'].includes(body.decision)
        ) {
          return problem(res, 400, 'validation', 'Invalid request', {
            detail: 'decision field must be either confirm or overturn',
            errors: [{ pointer: '/decision', detail: 'must be confirm or overturn' }],
          });
        }

        q.review.run(body.decision, s.id);
        return send(res, 200, { id: s.id, decision: body.decision });
      },
    ],
    [
      'POST',
      '/api/verdicts/:verdictId/review',
      async (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const verdictId = parsePositiveInt(params.verdictId);
        const verdict =
          verdictId !== null
            ? /** @type {{ id: number, submission_id: number, code: string, class_id: number, published_at: string | null } | undefined} */ (
                q.verdict.get(verdictId)
              )
            : undefined;
        if (!verdict || !auth.isStaff(me, verdict.class_id)) {
          return problem(res, 404, 'not-found', 'No such verdict');
        }
        if (verdict.published_at !== null) {
          return problem(res, 409, 'already-published', 'Lab grades are already published');
        }

        const body = await readJson(req);
        if (
          !body ||
          body.__nonObjectJson ||
          body.__payloadTooLarge ||
          !['pass', 'violation'].includes(body.taDecision)
        ) {
          return problem(res, 400, 'validation', 'Invalid request', {
            detail: 'taDecision must be pass or violation',
          });
        }

        /** @type {Array<{ line: number, text: string }>} */
        let evidence = [];

        if (body.taDecision === 'violation') {
          if (
            !Array.isArray(body.evidence) ||
            body.evidence.length === 0 ||
            body.evidence.some(
              (e) =>
                !e ||
                !Number.isInteger(e.line) ||
                e.line < 1 ||
                typeof e.text !== 'string' ||
                e.text.trim().length === 0,
            )
          ) {
            return problem(res, 400, 'validation', 'Invalid evidence', {
              detail: 'Violation decisions require non-empty valid evidence',
            });
          }

          const rawCode = String(verdict.code || '');
          if (rawCode.length > 0) {
            const codeLines = rawCode.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            const invalidLineOrText = body.evidence.some((e) => {
              if (e.line > codeLines.length) return true;
              const actual = codeLines[e.line - 1];
              if (actual.trim().length === 0) return true;
              const normActual = actual.trim().replace(/\s+/g, ' ');
              const normProvided = e.text.trim().replace(/\s+/g, ' ');
              return normProvided !== normActual;
            });
            if (invalidLineOrText) {
              return problem(res, 400, 'validation', 'Invalid evidence', {
                detail:
                  'Evidence line and code text must match a non-empty line in the submission source',
              });
            }
            evidence = body.evidence.map((e) => ({ line: e.line, text: codeLines[e.line - 1] }));
          } else {
            evidence = body.evidence.map((e) => ({ line: e.line, text: e.text.trim() }));
          }
        }

        q.verdictReview.run(body.taDecision, me.id, JSON.stringify(evidence), verdict.id);
        return send(res, 200, {
          id: verdict.id,
          taDecision: body.taDecision,
          evidence,
        });
      },
    ],
  ];
}
