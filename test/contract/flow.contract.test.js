import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from '../helpers.js';

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
 * Start a PA3 application with an isolated in-memory SQLite database.
 */
async function startPa3App() {
  return startApp();
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

test('GET /api/me returns role and accessible classes and rejects unauthenticated requests', async () => {
  const app = await startApp();
  try {
    const unauth = await app.as(null).get('/api/me');
    assert.equal(unauth.status, 401);

    const admin = await app.as('admin').get('/api/me');
    assert.equal(admin.status, 200);
    assert.deepEqual(admin.body.classes, [1, 2]);

    const taA = await app.as('ta_a').get('/api/me');
    assert.equal(taA.status, 200);
    assert.deepEqual(taA.body.classes, [1]);

    const stu3 = await app.as('stu3').get('/api/me');
    assert.equal(stu3.status, 200);
    assert.deepEqual(stu3.body.classes, [2]);
  } finally {
    await app.close();
  }
});

test('POST /api/classes/:classId/labs validates class existence, dates, limits, and constraint id/code normalization', async () => {
  const app = await startApp();
  try {
    const missingClass = await app.as('admin').post('/api/classes/999/labs', validLab());
    assert.equal(missingClass.status, 404);

    const badCalendarDate = await app.as('ta_a').post('/api/classes/1/labs', {
      ...validLab(),
      deadlineAt: '2026-02-31 00:00:00',
    });
    assert.equal(badCalendarDate.status, 400);

    const badCpu = await app.as('ta_a').post('/api/classes/1/labs', {
      ...validLab(),
      cpuLimitSec: 9,
    });
    assert.equal(badCpu.status, 400);

    const dupTrimmed = await app.as('ta_a').post('/api/classes/1/labs', {
      ...validLab(),
      constraints: [
        { code: ' C1 ', text: 'Rule 1', deduction: 2 },
        { code: 'C1', text: 'Rule 2', deduction: 3 },
      ],
    });
    assert.equal(dupTrimmed.status, 400);

    const ok = await app.as('ta_a').post('/api/classes/1/labs', {
      ...validLab(),
      cpuLimitSec: 2,
      memoryLimitMb: 512,
      constraints: [{ id: ' C1 ', text: ' Do not use std::sort ', deduction: 3 }],
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.cpuLimitSec, 2);
    assert.equal(ok.body.memoryLimitMb, 512);
    assert.equal(ok.body.constraints[0].code, 'C1');

    const details = await app.as('stu1').get(`/api/labs/${ok.body.id}`);
    assert.equal(details.status, 200);
    assert.equal(typeof details.body.reviewNotice, 'string');
    assert.ok(details.body.reviewNotice.includes('hard rules'));
    assert.equal(details.body.cpuLimitSec, 2);
    assert.equal(details.body.memoryLimitMb, 512);
    assert.equal(Object.hasOwn(details.body, 'tests'), false);
    assert.equal(Object.hasOwn(details.body, 'lab_tests'), false);
  } finally {
    await app.close();
  }
});

test('POST /api/labs/:labId/submissions blocks TAs (403/404) and >1MiB payloads (400 code-too-large)', async () => {
  const app = await startApp();
  try {
    const sameClassTa = await app.as('ta_b').post('/api/labs/3/submissions', {
      code: 'int main() { return 0; }',
    });
    assert.equal(sameClassTa.status, 403);

    const otherClassTa = await app.as('ta_a').post('/api/labs/3/submissions', {
      code: 'int main() { return 0; }',
    });
    assert.equal(otherClassTa.status, 404);

    const oversized = await app.as('stu3').post('/api/labs/3/submissions', {
      code: 'x'.repeat(1_200_000),
    });
    assert.equal(oversized.status, 400);
    assert.equal(oversized.body.type, 'https://leetkob.example/problems/code-too-large');
  } finally {
    await app.close();
  }
});
