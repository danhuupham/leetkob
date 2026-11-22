import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';

const MAX_CODE_BYTES = 65_536;

/**
 * Submission routes for PA3.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createSubmissionRoutes(db, auth) {
  // PA2-compatible query: do not reference PA3-only columns here.
  const findLab = db.prepare(`
    SELECT id, class_id, deadline_at, published_at
    FROM labs
    WHERE id = ?
  `);

  const findSubmission = db.prepare(`
    SELECT
      s.id,
      s.lab_id,
      s.student_id,
      l.class_id,
      l.published_at
    FROM submissions s
    JOIN labs l ON l.id = s.lab_id
    WHERE s.id = ?
  `);

  return [
    // --------------------------------------------------
    // GET /api/submissions/:id
    // View submission status with authorization checks.
    // --------------------------------------------------
    [
      'GET',
      '/api/submissions/:id',
      (req, res, params) => {
        // 1. Authentication
        const me = auth.requireAuth(req, res);
        if (!me) return;

        // 2. Validate submission ID
        const submissionId = parsePositiveInt(params.id);

        if (submissionId === null) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        // 3. Find submission and its class
        const submission = findSubmission.get(submissionId);

        if (!submission) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        const classId = Number(submission.class_id);
        const studentId = Number(submission.student_id);

        // 4. Check ownership or staff authorization
        const isOwner = me.role === 'student' && me.id === studentId;

        const isClassStaff = me.role !== 'student' && auth.isStaff(me, classId);

        if (!isOwner && !isClassStaff) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        // 5. Read PA3 judging status only when this endpoint is called.
        // This avoids preparing a PA3-only query when PA2 starts.
        const judgeStatus = db
          .prepare(
            `SELECT judge_status
             FROM submissions
             WHERE id = ?`,
          )
          .get(submissionId);
        if (!judgeStatus) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        // 6. Return only safe status information.
        // Do not expose grades, deductions, decisions,
        // or constraint verdicts before Publish.
        return send(res, 200, {
          id: Number(submission.id),
          labId: Number(submission.lab_id),
          status: judgeStatus.judge_status,
        });
      },
    ],

    // --------------------------------------------------
    // POST /api/labs/:labId/submissions
    // Create a submission and enqueue a judge job.
    // --------------------------------------------------
    [
      'POST',
      '/api/labs/:labId/submissions',
      async (req, res, params) => {
        // 1. Authentication
        const me = auth.requireAuth(req, res);
        if (!me) return;

        // 2. Find lab
        const labId = parsePositiveInt(params.labId);
        const lab = labId === null ? undefined : findLab.get(labId);

        if (!lab) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const classId = Number(lab.class_id);

        // 3. Only enrolled students may submit
        if (me.role !== 'student') {
          if (auth.isStaff(me, classId)) {
            return problem(res, 403, 'forbidden', 'Only students may submit code');
          }

          return problem(res, 404, 'not-found', 'No such lab');
        }

        if (!auth.isEnrolled(me, classId)) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        // 4. Validate JSON
        const body = await readJson(req);

        if (body === null) {
          return problem(res, 400, 'invalid-json', 'Invalid JSON');
        }

        if (
          body.__nonObjectJson ||
          typeof body.code !== 'string' ||
          body.code.trim().length === 0
        ) {
          return problem(res, 400, 'validation', 'Invalid code', {
            detail: 'A non-empty C++ source string is required',
          });
        }

        // 5. Limit UTF-8 size, not JavaScript character count
        const codeBytes = Buffer.byteLength(body.code, 'utf8');

        if (codeBytes > MAX_CODE_BYTES) {
          return problem(res, 400, 'code-too-large', 'Code exceeds 65536 bytes');
        }

        // 6. Deadline validation
        const deadline = Date.parse(String(lab.deadline_at).replace(' ', 'T') + 'Z');

        if (!Number.isFinite(deadline) || Date.now() > deadline || lab.published_at !== null) {
          return problem(res, 409, 'deadline-passed', 'Submission deadline has passed');
        }

        // 7. Create submission and queue job atomically
        db.exec('BEGIN IMMEDIATE');

        try {
          const result = db
            .prepare(
              `
              INSERT INTO submissions (
                lab_id,
                student_id,
                verdict,
                decision,
                code,
                judge_status,
                test_verdict
              )
              VALUES (?, ?, 'unsure', NULL, ?, 'queued', 'PENDING')
            `,
            )
            .run(labId, me.id, body.code);

          const submissionId = Number(result.lastInsertRowid);

          db.prepare(
            `
            INSERT INTO judge_jobs (
              submission_id,
              status
            )
            VALUES (?, 'queued')
          `,
          ).run(submissionId);

          db.exec('COMMIT');

          return send(res, 202, {
            id: submissionId,
            status: 'queued',
          });
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    ],
  ];
}
