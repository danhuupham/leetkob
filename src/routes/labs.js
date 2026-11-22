import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createLabRoutes(db, auth) {
  return [
    [
      'POST',
      '/api/classes/:classId/labs',
      async (req, res, params) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const classId = parsePositiveInt(params.classId);

        if (classId === null) {
          return problem(res, 404, 'not-found', 'No such class');
        }

        if (!auth.isStaff(me, classId)) {
          if (auth.isEnrolled(me, classId)) {
            return problem(res, 403, 'forbidden', 'Access denied');
          }
          return problem(res, 404, 'not-found', 'No such class');
        }

        // Read and validate request data before writing to SQLite.
        const body = await readJson(req);

        if (!body) {
          return problem(res, 400, 'invalid-json', 'Invalid JSON');
        }

        const title = body.title;
        const statement = body.statement;
        const deadlineAt = body.deadlineAt;
        const tests = body.tests;
        const constraints = body.constraints;

        const valid =
          typeof title === 'string' &&
          title.trim().length > 0 &&
          title.length <= 200 &&
          typeof statement === 'string' &&
          statement.trim().length > 0 &&
          typeof deadlineAt === 'string' &&
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(deadlineAt) &&
          !Number.isNaN(Date.parse(deadlineAt.replace(' ', 'T') + 'Z')) &&
          Array.isArray(tests) &&
          tests.length > 0 &&
          tests.every(
            (t) => t && typeof t.input === 'string' && typeof t.expectedOutput === 'string',
          ) &&
          Array.isArray(constraints) &&
          constraints.every(
            (c) =>
              c &&
              typeof c.code === 'string' &&
              c.code.trim().length > 0 &&
              typeof c.text === 'string' &&
              c.text.trim().length > 0 &&
              Number.isInteger(c.deduction) &&
              c.deduction >= 0 &&
              c.deduction <= 10,
          ) &&
          new Set(constraints.map((c) => c.code)).size === constraints.length;

        if (!valid) {
          return problem(res, 400, 'validation', 'Invalid request', {
            detail: 'Invalid lab fields, tests, or constraints',
          });
        }

        // PA3 migration is required for the following columns/tables.
        // All writes must succeed or roll back together.
        db.exec('BEGIN IMMEDIATE');

        try {
          const result = db
            .prepare(
              `INSERT INTO labs
                 (class_id, title, statement, deadline_at)
               VALUES (?, ?, ?, ?)`,
            )
            .run(classId, title.trim(), statement, deadlineAt);

          const labId = Number(result.lastInsertRowid);

          const insertTest = db.prepare(
            `INSERT INTO lab_tests
               (lab_id, ordinal, input_text, expected_output)
             VALUES (?, ?, ?, ?)`,
          );

          for (let i = 0; i < tests.length; i += 1) {
            insertTest.run(labId, i + 1, tests[i].input, tests[i].expectedOutput);
          }

          const insertConstraint = db.prepare(
            `INSERT INTO lab_constraints
               (lab_id, constraint_code, rule_text, deduction)
             VALUES (?, ?, ?, ?)`,
          );

          for (const c of constraints) {
            insertConstraint.run(labId, c.code, c.text, c.deduction);
          }

          db.exec('COMMIT');

          return send(res, 201, {
            id: labId,
            classId,
            title: title.trim(),
            deadlineAt,
            constraints: constraints.map((c) => ({
              code: c.code,
              text: c.text,
              deduction: c.deduction,
            })),
          });
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    ],
  ];
}
