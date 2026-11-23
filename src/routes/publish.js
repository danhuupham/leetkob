// Grade publishing human gate (specification: docs/contract/publish.md).
import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';
import { needsReview } from '../grades.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createPublishRoutes(db, auth) {
  const q = {
    lab: db.prepare(
      `SELECT id, class_id, deadline_at, published_at,
              (deadline_at <= datetime('now')) AS deadline_passed
       FROM labs WHERE id = ?`,
    ),
    byLab: db.prepare('SELECT verdict, decision, code FROM submissions WHERE lab_id = ?'),
    publish: db.prepare(
      "UPDATE labs SET published_at = datetime('now') WHERE id = ? AND published_at IS NULL",
    ),
    idemGet: db.prepare(
      `SELECT published_at FROM idempotency_keys
       WHERE lab_id = ? AND key = ? AND created_at >= datetime('now', '-24 hours')`,
    ),
    idemInsert: db.prepare(
      `INSERT OR IGNORE INTO idempotency_keys (lab_id, key, user_id, published_at)
       VALUES (?, ?, ?, ?)`,
    ),
    activeJobs: db.prepare(
      `SELECT COUNT(*) AS count
       FROM submissions s
       LEFT JOIN judge_jobs j ON j.submission_id = s.id
       WHERE s.lab_id = ?
         AND (
           s.judge_status != 'done'
           OR j.status IN ('queued', 'running', 'failed')
         )`,
    ),
    pa3Pending: db.prepare(
      `SELECT COUNT(*) AS count
       FROM constraint_verdicts cv
       JOIN submissions s ON s.id = cv.submission_id
       JOIN labs l ON l.id = s.lab_id
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
         AND cv.ta_decision IS NULL`,
    ),
  };

  return [
    [
      'POST',
      '/api/labs/:labId/publish',
      async (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const labId = parsePositiveInt(params.labId);
        const lab =
          labId !== null
            ? /** @type {{ id: number, class_id: number, deadline_at: string, published_at: string | null, deadline_passed: number } | undefined} */ (
                q.lab.get(labId)
              )
            : undefined;
        if (!lab) {
          return problem(res, 404, 'not-found', 'No such lab', {
            detail: 'Requested lab was not found',
          });
        }

        // Check role and class-ownership BEFORE any state mutation (fixes refused-but-published bug).
        if (!auth.isStaff(me, lab.class_id)) {
          if (auth.isEnrolled(me, lab.class_id)) {
            return problem(res, 403, 'forbidden', 'Only staff of this class may publish', {
              detail: 'Students enrolled in this class may not publish lab grades',
            });
          }
          return problem(res, 404, 'not-found', 'No such lab', {
            detail: 'Requested lab was not found',
          });
        }

        // Validate optional Idempotency-Key header.
        const rawIdemKey = req.headers['idempotency-key'];
        const idemKey = Array.isArray(rawIdemKey) ? rawIdemKey[0] : rawIdemKey;
        if (idemKey !== undefined && (idemKey.trim().length === 0 || idemKey.length > 255)) {
          return problem(res, 400, 'validation', 'Invalid request', {
            detail: 'Idempotency-Key header must be 1 to 255 non-empty characters',
            errors: [
              { parameter: 'Idempotency-Key', detail: 'must be 1 to 255 non-empty characters' },
            ],
          });
        }

        // Validate optional request body.
        const body = await readJson(req);
        if (body === null) {
          return problem(res, 400, 'invalid-json', 'Malformed JSON', {
            detail: 'Request body is not valid JSON',
          });
        }
        if (body.__nonObjectJson || body.__payloadTooLarge) {
          return problem(res, 400, 'validation', 'Invalid request', {
            detail: 'Request body must be a JSON object or empty',
            errors: [{ pointer: '', detail: 'request body must be a JSON object or empty' }],
          });
        }

        // Refuse before submission deadline has passed (FAQ-12 Condition 1).
        if (!lab.deadline_passed) {
          return problem(res, 409, 'deadline-not-passed', 'Submission deadline has not passed', {
            detail: `Grades cannot be published before deadline ${lab.deadline_at}`,
            deadlineAt: lab.deadline_at,
          });
        }

        // Refuse while any judge job is still queued, running, or failed.
        const activeJobs = /** @type {{ count: number }} */ (q.activeJobs.get(lab.id)).count;
        if (activeJobs > 0) {
          return problem(res, 409, 'reviews-pending', 'Reviews pending', {
            detail: `${activeJobs} submission(s) have incomplete or failed judge jobs`,
            pending: activeJobs,
          });
        }

        // Refuse while any violation or unsure review is still pending a TA decision (FAQ-09, FAQ-12 Condition 2).
        const legacyPending =
          /** @type {Array<{ verdict: string, decision: string | null, code: string }>} */ (
            q.byLab.all(lab.id)
          ).filter((s) => s.code === '' && needsReview(s.verdict) && !s.decision).length;
        const pa3Pending = /** @type {{ count: number }} */ (q.pa3Pending.get(lab.id)).count;
        const pending = legacyPending + pa3Pending;

        if (pending > 0) {
          return problem(res, 409, 'reviews-pending', 'Reviews pending', {
            detail: `${pending} submission(s) still require TA review before grades can be published`,
            pending,
          });
        }

        const existingIdem = idemKey
          ? /** @type {{ published_at: string } | undefined} */ (q.idemGet.get(lab.id, idemKey))
          : undefined;
        const isReplay = existingIdem !== undefined;

        if (!lab.published_at) {
          q.publish.run(lab.id);
        }
        const updated = /** @type {{ published_at: string }} */ (q.lab.get(lab.id));

        if (idemKey && !existingIdem) {
          q.idemInsert.run(lab.id, idemKey, me.id, updated.published_at);
        }

        return send(
          res,
          200,
          { lab: lab.id, publishedAt: updated.published_at },
          isReplay ? { 'idempotent-replayed': 'true' } : {},
        );
      },
    ],
  ];
}
