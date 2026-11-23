import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';

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
  const q = {
    findLab: db.prepare(`
      SELECT id, class_id, title, statement, deadline_at, published_at,
             cpu_limit_sec, memory_limit_mb
      FROM labs
      WHERE id = ?
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
          /** @type {{ id: number, class_id: number, title: string, statement: string, deadline_at: string, published_at: string | null, cpu_limit_sec: number, memory_limit_mb: number } | undefined} */ (
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
          title: lab.title,
          statement: lab.statement,
          deadlineAt: lab.deadline_at,
          publishedAt: lab.published_at,
          cpuLimitSec: Number(lab.cpu_limit_sec),
          memoryLimitMb: Number(lab.memory_limit_mb),
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
