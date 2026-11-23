import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';
import { computePublishedGrade } from '../grades.js';

export const FAQ_06_REVIEW_NOTICE =
  'Accepted C++ submissions are checked by deterministic hard rules and an AI model. The model receives only the problem statement, constraint text, and code with comments, student names, and student IDs removed. The model never decides marks — a TA reviews flagged verdicts before grades are published.';

/**
 * Validates strict UTC `YYYY-MM-DD HH:mm:ss` calendar datetime strings.
 * @param {unknown} value
 * @returns {value is string}
 */
function isValidUtcDateTime(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!m) return false;
  const [, ys, ms, ds, hs, mins, ss] = m;
  const d = new Date(
    Date.UTC(Number(ys), Number(ms) - 1, Number(ds), Number(hs), Number(mins), Number(ss)),
  );
  return (
    d.getUTCFullYear() === Number(ys) &&
    d.getUTCMonth() === Number(ms) - 1 &&
    d.getUTCDate() === Number(ds) &&
    d.getUTCHours() === Number(hs) &&
    d.getUTCMinutes() === Number(mins) &&
    d.getUTCSeconds() === Number(ss)
  );
}

/**
 * Lab routes for PA3.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createLabRoutes(db, auth) {
  const labSelectCols = `
    SELECT l.id, l.class_id,
           COALESCE(c.code, 'Class ' || l.class_id) AS class_code,
           COALESCE(c.title, '') AS class_title,
           l.title, l.deadline_at,
           (l.deadline_at <= datetime('now')) AS deadline_passed,
           l.published_at, l.cpu_limit_sec, l.memory_limit_mb, l.cost_spent_usd,
           (SELECT COUNT(*) FROM lab_constraints lc WHERE lc.lab_id = l.id) AS constraint_count
    FROM labs l
    LEFT JOIN classes c ON c.id = l.class_id
  `;

  const q = {
    listAdminLabs: db.prepare(`${labSelectCols} ORDER BY l.class_id ASC, l.id ASC`),
    listTaLabs: db.prepare(`
      ${labSelectCols}
      JOIN class_staff cs ON cs.class_id = l.class_id AND cs.user_id = ?
      ORDER BY l.class_id ASC, l.id ASC
    `),
    listStudentLabs: db.prepare(`
      ${labSelectCols}
      JOIN enrollments e ON e.class_id = l.class_id AND e.user_id = ?
      ORDER BY l.class_id ASC, l.id ASC
    `),
    allCountedSubmissionCounts: db.prepare(`
      SELECT s.lab_id, COUNT(*) AS count
      FROM submissions s
      JOIN labs l ON l.id = s.lab_id
      WHERE s.code != ''
        AND s.id = (
          SELECT MAX(s2.id)
          FROM submissions s2
          WHERE s2.lab_id = s.lab_id
            AND s2.student_id = s.student_id
            AND s2.submitted_at <= l.deadline_at
        )
      GROUP BY s.lab_id
    `),
    allLegacyPendingCounts: db.prepare(`
      SELECT lab_id, COUNT(*) AS count
      FROM submissions
      WHERE code = ''
        AND verdict IN ('violation', 'unsure')
        AND decision IS NULL
      GROUP BY lab_id
    `),
    allPa3PendingCounts: db.prepare(`
      SELECT s.lab_id, COUNT(*) AS count
      FROM constraint_verdicts cv
      JOIN submissions s ON s.id = cv.submission_id
      JOIN labs l ON l.id = s.lab_id
      WHERE s.test_verdict = 'AC'
        AND s.id = (
          SELECT MAX(s2.id)
          FROM submissions s2
          WHERE s2.lab_id = s.lab_id
            AND s2.student_id = s.student_id
            AND s2.submitted_at <= l.deadline_at
        )
        AND cv.verdict IN ('violation', 'unsure')
        AND cv.ta_decision IS NULL
      GROUP BY s.lab_id
    `),
    studentLatestByLab: db.prepare(`
      SELECT lab_id, id, judge_status, test_verdict, submitted_at, manual_mark
      FROM submissions
      WHERE student_id = ?
        AND id IN (
          SELECT MAX(id)
          FROM submissions
          WHERE student_id = ?
          GROUP BY lab_id
        )
    `),
    studentPublishedCountedByLab: db.prepare(`
      SELECT s.lab_id, s.id, s.test_verdict, s.manual_mark
      FROM submissions s
      JOIN labs l ON l.id = s.lab_id
      WHERE s.student_id = ?
        AND l.published_at IS NOT NULL
        AND s.id = (
          SELECT MAX(s2.id)
          FROM submissions s2
          WHERE s2.lab_id = s.lab_id
            AND s2.student_id = s.student_id
            AND s2.submitted_at <= l.deadline_at
        )
    `),
    studentPublishedViolationsByLab: db.prepare(`
      SELECT s.lab_id, cv.constraint_code, lc.rule_text, lc.deduction
      FROM constraint_verdicts cv
      JOIN submissions s ON s.id = cv.submission_id
      JOIN labs l ON l.id = s.lab_id
      JOIN lab_constraints lc
        ON lc.lab_id = s.lab_id AND lc.constraint_code = cv.constraint_code
      WHERE s.student_id = ?
        AND l.published_at IS NOT NULL
        AND cv.ta_decision = 'violation'
        AND s.id = (
          SELECT MAX(s2.id)
          FROM submissions s2
          WHERE s2.lab_id = s.lab_id
            AND s2.student_id = s.student_id
            AND s2.submitted_at <= l.deadline_at
        )
      ORDER BY cv.constraint_code
    `),
    findLab: db.prepare(`
      SELECT l.id, l.class_id,
             COALESCE(c.code, 'Class ' || l.class_id) AS class_code,
             COALESCE(c.title, '') AS class_title,
             l.title, l.statement, l.deadline_at,
             (l.deadline_at <= datetime('now')) AS deadline_passed,
             l.published_at, l.cpu_limit_sec, l.memory_limit_mb, l.cost_spent_usd
      FROM labs l
      LEFT JOIN classes c ON c.id = l.class_id
      WHERE l.id = ?
    `),
    findConstraints: db.prepare(`
      SELECT constraint_code AS code, rule_text AS text, deduction
      FROM lab_constraints
      WHERE lab_id = ?
      ORDER BY id
    `),
    classExists: db.prepare('SELECT 1 FROM classes WHERE id = ?'),
    insertLab: db.prepare(`
      INSERT INTO labs
        (class_id, title, statement, deadline_at, cpu_limit_sec, memory_limit_mb)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    insertTest: db.prepare(`
      INSERT INTO lab_tests (lab_id, ordinal, input_text, expected_output)
      VALUES (?, ?, ?, ?)
    `),
    insertConstraint: db.prepare(`
      INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
      VALUES (?, ?, ?, ?)
    `),
  };

  return [
    // GET /api/labs — List authorized labs for the signed-in user.
    [
      'GET',
      '/api/labs',
      (req, res) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        /**
         * @typedef {{
         *   id: number,
         *   class_id: number,
         *   class_code: string,
         *   class_title: string,
         *   title: string,
         *   deadline_at: string,
         *   deadline_passed: number,
         *   published_at: string | null,
         *   cpu_limit_sec: number,
         *   memory_limit_mb: number,
         *   cost_spent_usd: number,
         *   constraint_count: number
         * }} LabSummaryRow
         */

        const rows = /** @type {LabSummaryRow[]} */ (
          me.role === 'admin'
            ? q.listAdminLabs.all()
            : me.role === 'ta'
              ? q.listTaLabs.all(me.id)
              : q.listStudentLabs.all(me.id)
        );

        /** @type {Map<number, number>} */
        const countedMap = new Map();
        /** @type {Map<number, number>} */
        const legacyPendingMap = new Map();
        /** @type {Map<number, number>} */
        const pa3PendingMap = new Map();
        /** @type {Map<number, { id: number, judge_status: string, test_verdict: string, submitted_at: string }>} */
        const studentLatestMap = new Map();
        /** @type {Map<number, { id: number, test_verdict: string, manual_mark: number | null }>} */
        const studentCountedMap = new Map();
        /** @type {Map<number, Array<{ constraintCode: string, text: string, deduction: number, evidence: unknown[] }>>} */
        const studentViolationsMap = new Map();

        if (me.role !== 'student') {
          for (const r of /** @type {Array<{ lab_id: number, count: number }>} */ (
            q.allCountedSubmissionCounts.all()
          )) {
            countedMap.set(Number(r.lab_id), Number(r.count));
          }
          for (const r of /** @type {Array<{ lab_id: number, count: number }>} */ (
            q.allLegacyPendingCounts.all()
          )) {
            legacyPendingMap.set(Number(r.lab_id), Number(r.count));
          }
          for (const r of /** @type {Array<{ lab_id: number, count: number }>} */ (
            q.allPa3PendingCounts.all()
          )) {
            pa3PendingMap.set(Number(r.lab_id), Number(r.count));
          }
        } else {
          for (const r of /** @type {Array<{ lab_id: number, id: number, judge_status: string, test_verdict: string, submitted_at: string }>} */ (
            q.studentLatestByLab.all(me.id, me.id)
          )) {
            studentLatestMap.set(Number(r.lab_id), r);
          }
          for (const r of /** @type {Array<{ lab_id: number, id: number, test_verdict: string, manual_mark: number | null }>} */ (
            q.studentPublishedCountedByLab.all(me.id)
          )) {
            studentCountedMap.set(Number(r.lab_id), r);
          }
          for (const r of /** @type {Array<{ lab_id: number, constraint_code: string, rule_text: string, deduction: number }>} */ (
            q.studentPublishedViolationsByLab.all(me.id)
          )) {
            const lid = Number(r.lab_id);
            const arr = studentViolationsMap.get(lid) ?? [];
            arr.push({
              constraintCode: r.constraint_code,
              text: r.rule_text,
              deduction: Number(r.deduction),
              evidence: [],
            });
            studentViolationsMap.set(lid, arr);
          }
        }

        const labs = rows.map((row) => {
          const labId = Number(row.id);
          /** @type {Record<string, unknown>} */
          const item = {
            id: labId,
            classId: Number(row.class_id),
            classCode: row.class_code,
            classTitle: row.class_title,
            title: row.title,
            deadlineAt: row.deadline_at,
            deadlinePassed: Boolean(row.deadline_passed),
            publishedAt: row.published_at,
            cpuLimitSec: Number(row.cpu_limit_sec),
            memoryLimitMb: Number(row.memory_limit_mb),
            constraintCount: Number(row.constraint_count),
          };

          if (me.role !== 'student') {
            item.costSpentUsd = Number(row.cost_spent_usd ?? 0);
            item.submissionCount = countedMap.get(labId) ?? 0;
            item.pendingReviews =
              (legacyPendingMap.get(labId) ?? 0) + (pa3PendingMap.get(labId) ?? 0);
            return item;
          }

          const latest = studentLatestMap.get(labId);
          if (!latest) {
            item.latestSubmission = null;
            return item;
          }

          /** @type {Record<string, unknown>} */
          const latestSummary = {
            id: Number(latest.id),
            judgeStatus: latest.judge_status,
            testVerdict: latest.test_verdict,
            submittedAt: latest.submitted_at,
          };

          if (row.published_at !== null) {
            const counted = studentCountedMap.get(labId);
            if (counted) {
              latestSummary.mark = computePublishedGrade({
                manualMark: counted.manual_mark,
                testVerdict: counted.test_verdict,
                confirmedViolations: studentViolationsMap.get(labId) ?? [],
              }).mark;
            }
          }

          item.latestSubmission = latestSummary;
          return item;
        });

        return send(res, 200, { labs });
      },
    ],

    // GET /api/labs/:labId — View lab statement & public constraints (never hidden tests).
    [
      'GET',
      '/api/labs/:labId',
      (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const labId = parsePositiveInt(params.labId);
        if (labId === null) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const lab =
          /** @type {{ id: number, class_id: number, class_code: string, class_title: string, title: string, statement: string, deadline_at: string, deadline_passed: number, published_at: string | null, cpu_limit_sec: number, memory_limit_mb: number, cost_spent_usd: number } | undefined} */ (
            q.findLab.get(labId)
          );
        if (!lab) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const classId = Number(lab.class_id);
        const isStudent = me.role === 'student' && auth.isEnrolled(me, classId);
        const isStaff = me.role !== 'student' && auth.isStaff(me, classId);
        if (!isStudent && !isStaff) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const constraints = q.findConstraints.all(labId);

        return send(res, 200, {
          id: Number(lab.id),
          classId,
          classCode: lab.class_code,
          classTitle: lab.class_title,
          title: lab.title,
          statement: lab.statement,
          deadlineAt: lab.deadline_at,
          deadlinePassed: Boolean(lab.deadline_passed),
          publishedAt: lab.published_at,
          cpuLimitSec: Number(lab.cpu_limit_sec),
          memoryLimitMb: Number(lab.memory_limit_mb),
          ...(isStaff ? { costSpentUsd: Number(lab.cost_spent_usd ?? 0) } : {}),
          reviewNotice: FAQ_06_REVIEW_NOTICE,
          constraints,
        });
      },
    ],

    // POST /api/classes/:classId/labs — Create a lab with hidden tests & public constraints.
    [
      'POST',
      '/api/classes/:classId/labs',
      async (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const classId = parsePositiveInt(params.classId);
        if (classId === null || !q.classExists.get(classId)) {
          return problem(res, 404, 'not-found', 'No such class');
        }

        if (!auth.isStaff(me, classId)) {
          if (auth.isEnrolled(me, classId)) {
            return problem(res, 403, 'forbidden', 'Access denied');
          }
          return problem(res, 404, 'not-found', 'No such class');
        }

        const body = await readJson(req);
        if (!body) {
          return problem(res, 400, 'invalid-json', 'Invalid JSON');
        }
        if (body.__nonObjectJson || body.__payloadTooLarge) {
          return problem(res, 400, 'validation', 'Invalid request', {
            detail: 'Request body must be a valid JSON object',
          });
        }

        const title = body.title;
        const statement = body.statement;
        const deadlineAt = body.deadlineAt;
        const tests = body.tests;
        const rawConstraints = body.constraints;
        const cpuLimitSec = body.cpuLimitSec ?? 1;
        const memoryLimitMb = body.memoryLimitMb ?? 256;

        const normalizedConstraints = Array.isArray(rawConstraints)
          ? rawConstraints.map((c) => ({
              code:
                typeof c?.code === 'string'
                  ? c.code.trim()
                  : typeof c?.id === 'string'
                    ? c.id.trim()
                    : '',
              text: typeof c?.text === 'string' ? c.text.trim() : '',
              deduction: c?.deduction,
            }))
          : null;

        const valid =
          typeof title === 'string' &&
          title.trim().length > 0 &&
          title.length <= 200 &&
          typeof statement === 'string' &&
          statement.trim().length > 0 &&
          isValidUtcDateTime(deadlineAt) &&
          Number.isInteger(cpuLimitSec) &&
          cpuLimitSec >= 1 &&
          cpuLimitSec <= 5 &&
          Number.isInteger(memoryLimitMb) &&
          memoryLimitMb >= 64 &&
          memoryLimitMb <= 512 &&
          Array.isArray(tests) &&
          tests.length > 0 &&
          tests.every(
            (t) => t && typeof t.input === 'string' && typeof t.expectedOutput === 'string',
          ) &&
          normalizedConstraints !== null &&
          normalizedConstraints.every(
            (c) =>
              c.code.length > 0 &&
              c.text.length > 0 &&
              Number.isInteger(c.deduction) &&
              c.deduction >= 0 &&
              c.deduction <= 10,
          ) &&
          new Set(normalizedConstraints.map((c) => c.code)).size === normalizedConstraints.length;

        if (!valid || normalizedConstraints === null) {
          return problem(res, 400, 'validation', 'Invalid request', {
            detail: 'Invalid lab fields, tests, or constraints',
          });
        }

        db.exec('BEGIN IMMEDIATE');
        try {
          const result = q.insertLab.run(
            classId,
            title.trim(),
            statement,
            deadlineAt,
            cpuLimitSec,
            memoryLimitMb,
          );
          const labId = Number(result.lastInsertRowid);

          for (let i = 0; i < tests.length; i += 1) {
            q.insertTest.run(labId, i + 1, tests[i].input, tests[i].expectedOutput);
          }

          for (const c of normalizedConstraints) {
            q.insertConstraint.run(labId, c.code, c.text, c.deduction);
          }

          db.exec('COMMIT');

          return send(res, 201, {
            id: labId,
            classId,
            title: title.trim(),
            deadlineAt,
            cpuLimitSec,
            memoryLimitMb,
            constraints: normalizedConstraints,
          });
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    ],
  ];
}
