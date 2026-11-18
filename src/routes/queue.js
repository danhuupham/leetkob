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
    lab: db.prepare('SELECT id, class_id, published_at FROM labs WHERE id = ?'),
    byLab: db.prepare(
      `SELECT s.id, u.name AS student, s.verdict, s.decision FROM submissions s
       JOIN users u ON u.id = s.student_id WHERE s.lab_id = ? ORDER BY s.id`,
    ),
    submission: db.prepare(
      `SELECT s.id, l.class_id FROM submissions s
       JOIN labs l ON l.id = s.lab_id WHERE s.id = ?`,
    ),
    review: db.prepare('UPDATE submissions SET decision = ? WHERE id = ?'),
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
            ? /** @type {{ id: number, class_id: number, published_at: string | null } | undefined} */ (
                q.lab.get(labId)
              )
            : undefined;
        if (!lab || !auth.isStaff(me, lab.class_id)) {
          return problem(res, 404, 'not-found', 'No such lab', {
            detail: 'Requested lab was not found',
          });
        }

        const items =
          /** @type {Array<{ id: number, student: string, verdict: string, decision: string | null }>} */ (
            q.byLab.all(lab.id)
          ).filter((s) => needsReview(s.verdict));

        return send(res, 200, {
          lab: lab.id,
          publishedAt: lab.published_at,
          items,
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
  ];
}
