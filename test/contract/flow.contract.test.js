import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import { startApp } from '../helpers.js';
import { migrate, seedDemoData } from '../../src/db.js';
import { createApp } from '../../src/app.js';

/**
 * Valid PA3 lab request.
 */
function validLab() {
  return {
    title: 'Merge Sort',
    statement: 'Implement merge sort in C++17.',
    deadlineAt: '2099-12-31 23:59:59',
    tests: [
      {
        input: '5\n5 4 3 2 1',
        expectedOutput: '1 2 3 4 5',
      },
    ],
    constraints: [
      {
        code: 'C1',
        text: 'Do not use std::sort',
        deduction: 2,
      },
    ],
  };
}

/**
 * Start a PA3 application with an isolated SQLite database.
 *
 * PA2 is migrated and seeded first.
 * The PA3 migration is then applied in memory.
 *
 * This helper does not change src/db.js,
 * existing migrations, or the PA2 test helper.
 */
async function startPa3App() {
  const db = new DatabaseSync(':memory:');
  let server;

  try {
    db.exec('PRAGMA foreign_keys = ON');

    // Install and seed PA2 before expanding the schema.
    migrate(db);
    seedDemoData(db);

    // Read the PA3 migration from the existing queue branch.
    const pa3Sql = execFileSync(
      'git',
      ['show', 'origin/feat/pa3-queue:migrations/002_pa3_pipeline.sql'],
      {
        encoding: 'utf8',
      },
    );

    // SQLite does not allow a non-constant default in
    // ALTER TABLE ADD COLUMN.
    // Adjust only the SQL used by this test database.
    const originalStatement =
      "ALTER TABLE submissions ADD COLUMN submitted_at TEXT NOT NULL DEFAULT (datetime('now'));";

    const testStatement =
      "ALTER TABLE submissions ADD COLUMN submitted_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';";

    assert.ok(pa3Sql.includes(originalStatement), 'Expected PA3 migration statement was not found');

    const compatibleSql = pa3Sql.replace(originalStatement, testStatement);

    db.exec(compatibleSql);

    db.exec(`
      UPDATE submissions
      SET submitted_at = datetime('now')
      WHERE submitted_at = '1970-01-01 00:00:00';
    `);

    // Start the application.
    server = createApp(db);
    server.listen(0);

    await new Promise((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address();

    assert.ok(address && typeof address !== 'string');

    const baseUrl = `http://127.0.0.1:${address.port}`;

    /**
     * @param {string | null} user
     */
    function as(user) {
      /**
       * @param {string} path
       * @param {unknown} body
       */
      async function post(path, body) {
        /** @type {Record<string, string>} */
        const headers = {
          'content-type': 'application/json',
        };

        if (user) {
          headers.authorization = `Bearer tok-${user.replace('_', '-')}`;
        }

        const response = await fetch(baseUrl + path, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        return {
          status: response.status,
          type: response.headers.get('content-type') || '',
          body: await response.json(),
        };
      }

      return { post };
    }

    async function close() {
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve(undefined);
            }
          });
        });
      }

      db.close();
    }

    return { as, close, db };
  } catch (error) {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve(undefined));
      });
    }

    db.close();
    throw error;
  }
}

// ==================================================
// FLOW: CREATE LAB
// ==================================================

/**
 * FLOW AC1:
 * An unauthenticated user cannot create a lab.
 */
test('FLOW AC1: unauthenticated user cannot create a lab', async () => {
  const app = await startApp();

  try {
    const response = await app.as(null).post('/api/classes/1/labs', validLab());

    assert.equal(response.status, 401);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

/**
 * FLOW AC2:
 * An enrolled student cannot create a lab.
 */
test('FLOW AC2: enrolled student cannot create a lab', async () => {
  const app = await startApp();

  try {
    const response = await app.as('stu1').post('/api/classes/1/labs', validLab());

    assert.equal(response.status, 403);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

/**
 * FLOW AC3:
 * A class TA can create a lab successfully.
 *
 * This case requires the PA3 schema.
 */
test('FLOW AC3: class TA can create a lab', async () => {
  const app = await startPa3App();

  try {
    const response = await app.as('ta_a').post('/api/classes/1/labs', validLab());

    assert.equal(response.status, 201);
    assert.equal(response.body.classId, 1);
    assert.equal(response.body.title, 'Merge Sort');
    assert.ok(Number.isInteger(response.body.id));

    const labId = response.body.id;

    // Verify the lab was saved.
    const savedLab = app.db
      .prepare(
        `SELECT id, class_id, title, statement
         FROM labs
         WHERE id = ?`,
      )
      .get(labId);

    assert.ok(savedLab);
    assert.equal(savedLab.class_id, 1);
    assert.equal(savedLab.title, 'Merge Sort');
    assert.equal(savedLab.statement, 'Implement merge sort in C++17.');

    // Verify test cases were saved.
    const savedTests = app.db
      .prepare(
        `SELECT input_text, expected_output
         FROM lab_tests
         WHERE lab_id = ?`,
      )
      .all(labId);

    assert.equal(savedTests.length, 1);
    assert.equal(savedTests[0].input_text, '5\n5 4 3 2 1');
    assert.equal(savedTests[0].expected_output, '1 2 3 4 5');

    // Verify constraints were saved.
    const savedConstraints = app.db
      .prepare(
        `SELECT constraint_code, rule_text, deduction
         FROM lab_constraints
         WHERE lab_id = ?`,
      )
      .all(labId);

    assert.equal(savedConstraints.length, 1);
    assert.equal(savedConstraints[0].constraint_code, 'C1');
    assert.equal(savedConstraints[0].rule_text, 'Do not use std::sort');
    assert.equal(savedConstraints[0].deduction, 2);
  } finally {
    await app.close();
  }
});

/**
 * FLOW AC4:
 * A TA from another class must not create a lab.
 */
test('FLOW AC4: TA from another class cannot create a lab', async () => {
  const app = await startApp();

  try {
    const response = await app.as('ta_b').post('/api/classes/1/labs', validLab());

    assert.equal(response.status, 404);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

/**
 * FLOW AC5:
 * A class TA cannot create a lab with an empty title.
 */
test('FLOW AC5: TA cannot create a lab with an empty title', async () => {
  const app = await startApp();

  try {
    const response = await app.as('ta_a').post('/api/classes/1/labs', {
      ...validLab(),
      title: '',
    });

    assert.equal(response.status, 400);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

/**
 * FLOW AC6:
 * A class TA cannot create a lab without test cases.
 */
test('FLOW AC6: TA cannot create a lab without test cases', async () => {
  const app = await startApp();

  try {
    const response = await app.as('ta_a').post('/api/classes/1/labs', {
      ...validLab(),
      tests: [],
    });

    assert.equal(response.status, 400);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

// ==================================================
// SUBMISSION: POST CODE
// ==================================================

/**
 * SUBMISSION AC1:
 * Authentication is required before submitting C++ code.
 */
test('SUBMISSION AC1: unauthenticated user cannot submit code', async () => {
  const app = await startApp();

  try {
    const response = await app.as(null).post('/api/labs/3/submissions', {
      code: 'int main() { return 0; }',
    });

    assert.equal(response.status, 401);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

/**
 * SUBMISSION AC2:
 * Students from another class cannot submit to this lab.
 */
test('SUBMISSION AC2: cross-class student cannot submit code', async () => {
  const app = await startApp();

  try {
    const response = await app.as('stu1').post('/api/labs/3/submissions', {
      code: 'int main() { return 0; }',
    });

    assert.equal(response.status, 404);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

/**
 * SUBMISSION AC3:
 * Source code exceeding 65536 UTF-8 bytes is rejected.
 */
test('SUBMISSION AC3: code larger than 65536 bytes is rejected', async () => {
  const app = await startApp();

  try {
    const response = await app.as('stu3').post('/api/labs/3/submissions', {
      code: 'a'.repeat(65537),
    });

    assert.equal(response.status, 400);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

/**
 * SUBMISSION AC4:
 * A student cannot submit after the deadline.
 */
test('SUBMISSION AC4: submission after deadline is rejected', async () => {
  const app = await startApp();

  try {
    const response = await app.as('stu1').post('/api/labs/1/submissions', {
      code: 'int main() { return 0; }',
    });

    assert.equal(response.status, 409);
    assert.match(response.type, /application\/problem\+json/);
  } finally {
    await app.close();
  }
});
