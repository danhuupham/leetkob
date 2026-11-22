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

        const details =
          /** @type {{ judge_status:string, test_verdict:string, test_results_json:string, manual_mark:number|null, manual_reason:string|null, submitted_at:string, verdict:string, decision:string|null } | undefined} */ (
            db
              .prepare(
                `SELECT
               judge_status,
               test_verdict,
               test_results_json,
               manual_mark,
               manual_reason,
               submitted_at,
               verdict,
               decision
             FROM submissions
             WHERE id = ?`,
              )
              .get(submissionId)
          );
        if (!details) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        /** @type {unknown[]} */
        let testResults = [];
        try {
          testResults = JSON.parse(details.test_results_json);
        } catch {
          testResults = [];
        }

        /** @type {Record<string, any>} */
        const response = {
          id: Number(submission.id),
          labId: Number(submission.lab_id),
          status: details.judge_status,
          testVerdict: details.test_verdict,
          testResults,
          submittedAt: details.submitted_at,
        };

        const published = submission.published_at !== null;
        if (!published) {
          if (isClassStaff) {
            response.constraintVerdicts = db
              .prepare(
                `SELECT constraint_code, verdict, source, unsure_reason,
                        evidence_json, model_rationale, ta_decision
                 FROM constraint_verdicts
                 WHERE submission_id = ?
                 ORDER BY constraint_code`,
              )
              .all(submissionId)
              .map((v) => ({
                constraintCode: v.constraint_code,
                verdict: v.verdict,
                source: v.source,
                unsureReason: v.unsure_reason,
                evidence: /** @type {unknown[]} */ (JSON.parse(String(v.evidence_json))),
                rationale: v.model_rationale,
                taDecision: v.ta_decision,
              }));
          }
          return send(res, 200, response);
        }

        if (isClassStaff) {
          response.constraintVerdicts = db
            .prepare(
              `SELECT cv.constraint_code, cv.verdict, cv.source, cv.unsure_reason,
                      cv.evidence_json, cv.model_rationale, cv.ta_decision,
                      lc.rule_text, lc.deduction
               FROM constraint_verdicts cv
               JOIN lab_constraints lc
                 ON lc.lab_id = ? AND lc.constraint_code = cv.constraint_code
               WHERE cv.submission_id = ?
               ORDER BY cv.constraint_code`,
            )
            .all(submission.lab_id, submissionId)
            .map((v) => ({
              constraintCode: v.constraint_code,
              verdict: v.verdict,
              source: v.source,
              unsureReason: v.unsure_reason,
              evidence: /** @type {unknown[]} */ (JSON.parse(String(v.evidence_json))),
              rationale: v.model_rationale,
              taDecision: v.ta_decision,
              text: v.rule_text,
              deduction: v.deduction,
            }));
        }

        if (details.manual_mark !== null) {
          response.mark = details.manual_mark;
          response.manualReason = details.manual_reason;
          if (isOwner) return send(res, 200, { ...response, constraintVerdicts: undefined });
        }

        if (isOwner) {
          const confirmed = db
            .prepare(
              `SELECT cv.constraint_code, lc.rule_text, lc.deduction,
                      cv.evidence_json, cv.verdict, cv.ta_decision
               FROM constraint_verdicts cv
               JOIN lab_constraints lc
                 ON lc.lab_id = ? AND lc.constraint_code = cv.constraint_code
               WHERE cv.submission_id = ?
                 AND cv.verdict = 'violation'
                 AND cv.ta_decision = 'violation'
               ORDER BY cv.constraint_code`,
            )
            .all(submission.lab_id, submissionId);

          const deductions = confirmed.map((v) => ({
            constraintCode: v.constraint_code,
            text: v.rule_text,
            deduction: v.deduction,
            evidence: /** @type {unknown[]} */ (JSON.parse(String(v.evidence_json))),
          }));

          let mark = details.manual_mark;
          if (mark === null) {
            const unique = new Set();
            let lost = 0;
            for (const v of confirmed) {
              if (!unique.has(v.constraint_code)) {
                unique.add(v.constraint_code);
                lost += Number(v.deduction);
              }
            }
            mark = Math.max(0, 10 - lost);
          }
          return send(res, 200, {
            id: response.id,
            labId: response.labId,
            status: response.status,
            testVerdict: response.testVerdict,
            testResults: response.testResults,
            submittedAt: response.submittedAt,
            mark,
            deductions,
            ...(details.manual_reason ? { manualReason: details.manual_reason } : {}),
          });
        }

        return send(res, 200, response);
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
                test_verdict,
                submitted_at
              )
              VALUES (?, ?, 'unsure', NULL, ?, 'queued', 'PENDING', datetime('now'))
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
