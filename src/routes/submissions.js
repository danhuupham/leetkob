import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';
import { computePublishedGrade } from '../grades.js';

const MAX_CODE_BYTES = 65_536;

/**
 * @template T
 * @param {string | null | undefined} raw
 * @param {T} fallback
 * @returns {T}
 */
function safeJsonParse(raw, fallback) {
  try {
    return raw ? /** @type {T} */ (JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Submission routes for PA3.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createSubmissionRoutes(db, auth) {
  const q = {
    findLab: db.prepare(`
      SELECT id, class_id, deadline_at, published_at
      FROM labs
      WHERE id = ?
    `),
    findSubmission: db.prepare(`
      SELECT s.id, s.lab_id, s.student_id, l.class_id, l.deadline_at, l.published_at,
             j.status AS job_status
      FROM submissions s
      JOIN labs l ON l.id = s.lab_id
      LEFT JOIN judge_jobs j ON j.submission_id = s.id
      WHERE s.id = ?
    `),
    countedId: db.prepare(`
      SELECT MAX(id) AS counted_id
      FROM submissions
      WHERE lab_id = ? AND student_id = ? AND submitted_at <= ?
    `),
    details: db.prepare(`
      SELECT code, judge_status, test_verdict, test_results_json,
             manual_mark, manual_reason, submitted_at, verdict, decision
      FROM submissions
      WHERE id = ?
    `),
    staffVerdicts: db.prepare(`
      SELECT cv.id AS verdict_id, cv.constraint_code, cv.verdict, cv.source,
             cv.unsure_reason, cv.evidence_json, cv.model_rationale, cv.ta_decision,
             lc.rule_text, lc.deduction
      FROM constraint_verdicts cv
      LEFT JOIN lab_constraints lc
        ON lc.lab_id = ? AND lc.constraint_code = cv.constraint_code
      WHERE cv.submission_id = ?
      ORDER BY cv.constraint_code
    `),
    confirmedViolations: db.prepare(`
      SELECT cv.constraint_code, lc.rule_text, lc.deduction, cv.evidence_json
      FROM constraint_verdicts cv
      JOIN lab_constraints lc
        ON lc.lab_id = ? AND lc.constraint_code = cv.constraint_code
      WHERE cv.submission_id = ?
        AND cv.ta_decision = 'violation'
      ORDER BY cv.constraint_code
    `),
    insertSubmission: db.prepare(`
      INSERT INTO submissions (
        lab_id, student_id, verdict, decision, code,
        judge_status, test_verdict, submitted_at
      )
      VALUES (?, ?, 'unsure', NULL, ?, 'queued', 'PENDING', ?)
    `),
    insertJob: db.prepare(`
      INSERT INTO judge_jobs (submission_id, status)
      VALUES (?, 'queued')
    `),
    labSubmissionsForStudent: db.prepare(`
      SELECT s.id, s.lab_id, s.student_id, u.name AS student_name, s.code,
             s.judge_status, j.status AS job_status, s.test_verdict,
             s.test_results_json, s.manual_mark, s.manual_reason, s.submitted_at
      FROM submissions s
      JOIN users u ON u.id = s.student_id
      LEFT JOIN judge_jobs j ON j.submission_id = s.id
      WHERE s.lab_id = ? AND s.student_id = ?
      ORDER BY s.id DESC
    `),
    labSubmissionsForStaff: db.prepare(`
      SELECT s.id, s.lab_id, s.student_id, u.name AS student_name, s.code,
             s.judge_status, j.status AS job_status, s.test_verdict,
             s.test_results_json, s.manual_mark, s.manual_reason, s.submitted_at
      FROM submissions s
      JOIN users u ON u.id = s.student_id
      LEFT JOIN judge_jobs j ON j.submission_id = s.id
      WHERE s.lab_id = ?
      ORDER BY s.id DESC
    `),
  };

  /**
   * Loads published grade & confirmed deductions using the single shared grade calculation helper.
   * @param {number} labId
   * @param {number} submissionId
   * @param {{ manual_mark: number | null, manual_reason: string | null, test_verdict: string }} details
   */
  function loadPublishedFields(labId, submissionId, details) {
    const confirmed =
      /** @type {Array<{ constraint_code: string, rule_text: string, deduction: number, evidence_json: string }>} */ (
        q.confirmedViolations.all(labId, submissionId)
      ).map((v) => ({
        constraintCode: v.constraint_code,
        text: v.rule_text,
        deduction: Number(v.deduction),
        evidence: safeJsonParse(v.evidence_json, /** @type {unknown[]} */ ([])),
      }));

    const { mark, deductions } = computePublishedGrade({
      manualMark: details.manual_mark,
      testVerdict: details.test_verdict,
      confirmedViolations: confirmed,
    });

    return {
      mark,
      deductions,
      ...(details.manual_reason ? { manualReason: details.manual_reason } : {}),
    };
  }

  return [
    // GET /api/labs/:labId/submissions — Student's own attempts (or all lab attempts for staff), respecting FAQ-08.
    [
      'GET',
      '/api/labs/:labId/submissions',
      (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const labId = parsePositiveInt(params.labId);
        const lab =
          labId !== null
            ? /** @type {{ id: number, class_id: number, deadline_at: string, published_at: string | null } | undefined} */ (
                q.findLab.get(labId)
              )
            : undefined;
        if (!lab) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const classId = Number(lab.class_id);
        const isStudent = me.role === 'student' && auth.isEnrolled(me, classId);
        const isStaff = me.role !== 'student' && auth.isStaff(me, classId);
        if (!isStudent && !isStaff) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const rows =
          /** @type {Array<{ id: number, lab_id: number, student_id: number, student_name: string, code: string, judge_status: string, job_status: string | null, test_verdict: string, test_results_json: string, manual_mark: number | null, manual_reason: string | null, submitted_at: string }>} */ (
            isStudent
              ? q.labSubmissionsForStudent.all(lab.id, me.id)
              : q.labSubmissionsForStaff.all(lab.id)
          );

        /** @type {Map<number, number | null>} */
        const countedByStudent = new Map();
        const published = lab.published_at !== null;

        const submissions = rows.map((row) => {
          const sid = Number(row.student_id);
          if (!countedByStudent.has(sid)) {
            const cRow = /** @type {{ counted_id: number | null } | undefined} */ (
              q.countedId.get(lab.id, sid, lab.deadline_at)
            );
            countedByStudent.set(sid, cRow?.counted_id ?? null);
          }

          const counted = Number(countedByStudent.get(sid)) === Number(row.id);

          /** @type {Record<string, unknown>} */
          const item = {
            id: Number(row.id),
            labId: Number(row.lab_id),
            judgeStatus: row.judge_status,
            status: row.judge_status,
            jobStatus: row.job_status ?? null,
            counted,
            testVerdict: row.test_verdict,
            testResults: safeJsonParse(row.test_results_json, /** @type {unknown[]} */ ([])),
            submittedAt: row.submitted_at,
          };

          if (isStudent) {
            item.code = row.code;
          } else {
            item.student = row.student_name;
            item.studentId = sid;
          }

          if (published && counted) {
            const pub = loadPublishedFields(lab.id, Number(row.id), row);
            item.mark = pub.mark;
            item.deductions = pub.deductions;
            if (pub.manualReason) item.manualReason = pub.manualReason;
          }

          return item;
        });

        return send(res, 200, {
          labId: Number(lab.id),
          publishedAt: lab.published_at,
          submissions,
        });
      },
    ],
    // GET /api/submissions/:id — View submission status with strict FAQ-04/FAQ-08/FAQ-09 visibility.
    [
      'GET',
      '/api/submissions/:id',
      (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const submissionId = parsePositiveInt(params.id);
        if (submissionId === null) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        const submission =
          /** @type {{ id: number, lab_id: number, student_id: number, class_id: number, deadline_at: string, published_at: string | null, job_status: string | null } | undefined} */ (
            q.findSubmission.get(submissionId)
          );
        if (!submission) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        const classId = Number(submission.class_id);
        const studentId = Number(submission.student_id);
        const isOwner = me.role === 'student' && me.id === studentId;
        const isClassStaff = me.role !== 'student' && auth.isStaff(me, classId);

        if (!isOwner && !isClassStaff) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        const details =
          /** @type {{ code: string, judge_status: string, test_verdict: string, test_results_json: string, manual_mark: number | null, manual_reason: string | null, submitted_at: string, verdict: string, decision: string | null } | undefined} */ (
            q.details.get(submissionId)
          );
        if (!details) {
          return problem(res, 404, 'not-found', 'No such submission');
        }

        const countedRow = /** @type {{ counted_id: number | null } | undefined} */ (
          q.countedId.get(submission.lab_id, studentId, submission.deadline_at)
        );
        const testResults = safeJsonParse(details.test_results_json, /** @type {unknown[]} */ ([]));

        /** @type {Record<string, any>} */
        const base = {
          id: Number(submission.id),
          labId: Number(submission.lab_id),
          judgeStatus: details.judge_status,
          status: details.judge_status,
          jobStatus: submission.job_status ?? null,
          counted: Number(countedRow?.counted_id) === submissionId,
          testVerdict: details.test_verdict,
          testResults,
          submittedAt: details.submitted_at,
        };

        const published = submission.published_at !== null;

        if (isClassStaff) {
          base.code = details.code;
          base.constraintVerdicts =
            /** @type {Array<{ verdict_id: number, constraint_code: string, verdict: string, source: string, unsure_reason: string | null, evidence_json: string, model_rationale: string | null, ta_decision: string | null, rule_text: string | null, deduction: number | null }>} */ (
              q.staffVerdicts.all(submission.lab_id, submissionId)
            ).map((v) => ({
              verdictId: v.verdict_id,
              constraintCode: v.constraint_code,
              text: v.rule_text,
              deduction: v.deduction,
              verdict: v.verdict,
              source: v.source,
              unsureReason: v.unsure_reason,
              evidence: safeJsonParse(v.evidence_json, /** @type {unknown[]} */ ([])),
              rationale: v.model_rationale,
              taDecision: v.ta_decision,
            }));
          if (!published) {
            return send(res, 200, base);
          }
        } else if (!published) {
          // FAQ-08 & PA3 Syllabus Rule: before Publish, student sees ZERO verdicts, deductions, or mark.
          return send(res, 200, base);
        }

        const { mark, deductions, manualReason } = loadPublishedFields(
          submission.lab_id,
          submissionId,
          details,
        );

        if (isClassStaff) {
          base.mark = mark;
          if (manualReason) base.manualReason = manualReason;
          return send(res, 200, base);
        }

        return send(res, 200, {
          ...base,
          mark,
          deductions,
          ...(manualReason ? { manualReason } : {}),
        });
      },
    ],

    // POST /api/labs/:labId/submissions — Enqueue a student C++ submission.
    [
      'POST',
      '/api/labs/:labId/submissions',
      async (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const labId = parsePositiveInt(params.labId);
        const lab =
          labId === null
            ? undefined
            : /** @type {{ id: number, class_id: number, deadline_at: string, published_at: string | null } | undefined} */ (
                q.findLab.get(labId)
              );
        if (!lab) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const classId = Number(lab.class_id);
        if (me.role !== 'student') {
          if (auth.isStaff(me, classId)) {
            return problem(res, 403, 'forbidden', 'Only students may submit code');
          }
          return problem(res, 404, 'not-found', 'No such lab');
        }

        if (!auth.isEnrolled(me, classId)) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const body = await readJson(req);
        if (body === null) {
          return problem(res, 400, 'invalid-json', 'Invalid JSON');
        }
        if (body.__payloadTooLarge) {
          return problem(res, 400, 'code-too-large', 'Code exceeds 65536 bytes');
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

        const codeBytes = Buffer.byteLength(body.code, 'utf8');
        if (codeBytes > MAX_CODE_BYTES) {
          return problem(res, 400, 'code-too-large', 'Code exceeds 65536 bytes');
        }

        const submittedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const deadline = Date.parse(String(lab.deadline_at).replace(' ', 'T') + 'Z');
        if (
          !Number.isFinite(deadline) ||
          submittedAt > String(lab.deadline_at) ||
          lab.published_at !== null
        ) {
          return problem(res, 409, 'deadline-passed', 'Submission deadline has passed');
        }

        db.exec('BEGIN IMMEDIATE');
        try {
          const result = q.insertSubmission.run(labId, me.id, body.code, submittedAt);
          const submissionId = Number(result.lastInsertRowid);
          q.insertJob.run(submissionId);
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
