// TA review queue listing and individual submission review decisions.
import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';
import { needsReview } from '../grades.js';

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
              cv.constraint_code, cv.verdict, cv.source,
              cv.unsure_reason, cv.evidence_json, cv.ta_decision
       FROM constraint_verdicts cv
       JOIN submissions s ON s.id = cv.submission_id
       JOIN users u ON u.id = s.student_id
       JOIN labs l ON l.id = s.lab_id
       WHERE s.lab_id = ?
         AND s.id = (
           SELECT MAX(s2.id)
           FROM submissions s2
           WHERE s2.lab_id = s.lab_id
             AND s2.student_id = s.student_id
             AND s2.submitted_at <= l.deadline_at
         )
         AND cv.verdict IN ('violation', 'unsure')
         AND cv.ta_decision IS NULL
       ORDER BY cv.id`,
    ),
    verdict: db.prepare(
      `SELECT cv.id, cv.submission_id, l.class_id, l.published_at
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
          /** @type {Array<{ id: number, submission_id: number, student: string, constraint_code: string, verdict: string, source: string, unsure_reason: string|null, evidence_json: string, ta_decision: string|null }>} */ (
            q.pa3Queue.all(lab.id)
          ).map((v) => ({
            id: v.submission_id,
            verdictId: v.id,
            student: v.student,
            constraintCode: v.constraint_code,
            verdict: v.verdict,
            source: v.source,
            unsureReason: v.unsure_reason,
            evidence: JSON.parse(v.evidence_json),
            decision: v.ta_decision,
          }));

        return send(res, 200, {
          lab: lab.id,
          publishedAt: lab.published_at,
          costSpentUsd: lab.cost_spent_usd,
          items: [...legacyItems, ...pa3Items],
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
        if (!body || !['confirm', 'overturn'].includes(body.decision)) {
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
            ? /** @type {{ id: number, submission_id: number, class_id: number, published_at: string|null } | undefined} */ (
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
        if (!body || body.__nonObjectJson || !['pass', 'violation'].includes(body.taDecision)) {
          return problem(res, 400, 'validation', 'Invalid request', {
            detail: 'taDecision must be pass or violation',
          });
        }
        if (
          body.taDecision === 'violation' &&
          (!Array.isArray(body.evidence) ||
            body.evidence.length === 0 ||
            body.evidence.some(
              (e) =>
                !e ||
                !Number.isInteger(e.line) ||
                e.line < 1 ||
                typeof e.text !== 'string' ||
                e.text.trim().length === 0,
            ))
        ) {
          return problem(res, 400, 'validation', 'Invalid evidence', {
            detail: 'Violation decisions require non-empty valid evidence',
          });
        }

        const evidence = body.taDecision === 'violation' ? body.evidence : [];
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
