import { send, problem, readJson } from '../http.js';
import { parsePositiveInt } from '../auth.js';

/**
 * Lab routes for PA3.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createLabRoutes(db, auth) {
  // PA2-compatible query.
  // Do not reference PA3-only columns during app startup.
  const findLab = db.prepare(`
    SELECT
      id,
      class_id,
      title,
      deadline_at,
      published_at
    FROM labs
    WHERE id = ?
  `);

  return [
    // --------------------------------------------------
    // GET /api/labs/:labId
    // View lab statement and public constraints.
    // Hidden test cases must never be exposed.
    // --------------------------------------------------
    [
      'GET',
      '/api/labs/:labId',
      (req, res, params) => {
        // 1. Require authentication.
        const me = auth.requireAuth(req, res);
        if (!me) return;

        // 2. Validate lab ID.
        const labId = parsePositiveInt(params.labId);

        if (labId === null) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        // 3. Find the lab.
        const lab = findLab.get(labId);

        if (!lab) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        const classId = Number(lab.class_id);

        // 4. Check class access.
        const isStudent = me.role === 'student' && auth.isEnrolled(me, classId);

        const isStaff = me.role !== 'student' && auth.isStaff(me, classId);

        if (!isStudent && !isStaff) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        // 5. Read PA3-only fields after authorization.
        // Preparing these statements inside the handler
        // keeps PA2 contract tests compatible.
        const details = db
          .prepare(
            `
            SELECT statement
            FROM labs
            WHERE id = ?
          `,
          )
          .get(labId);

        if (!details) {
          return problem(res, 404, 'not-found', 'No such lab');
        }

        // 6. Load PUBLIC constraints only.
        // Never query lab_tests for this endpoint.
        const constraints = db
          .prepare(
            `
            SELECT
              constraint_code AS code,
              rule_text AS text,
              deduction
            FROM lab_constraints
            WHERE lab_id = ?
            ORDER BY id
          `,
          )
          .all(labId);

        // 7. Return safe lab information.
        return send(res, 200, {
          id: Number(lab.id),
          classId,
          title: lab.title,
          statement: details.statement,
          deadlineAt: lab.deadline_at,
          publishedAt: lab.published_at,
          constraints,
        });
      },
    ],

    // --------------------------------------------------
    // POST /api/classes/:classId/labs
    // Create a lab with tests and constraints.
    // --------------------------------------------------
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
