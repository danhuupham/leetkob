import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../helpers.js';

/**
 * Valid request data for creating a PA3 lab.
 */
function validLab() {
  return {
    title: 'Merge Sort',
    statement: 'Implement merge sort in C++17.',
    deadlineAt: '2099-12-31 23:59:59',
    tests: [
      {
        input: '3\n3 1 2',
        expectedOutput: '1 2 3',
      },
    ],
    constraints: [
      {
        code: 'C1',
        text: 'Do not call std::sort',
        deduction: 2,
      },
    ],
  };
}

/**
 * AC1: Authentication is mandatory.
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
 * AC2: Students cannot create labs.
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
 * AC3: The TA assigned to the class can create a lab.
 */
test('FLOW AC3: class TA can create a lab', async () => {
  const app = await startApp();

  try {
    const response = await app.as('ta_a').post('/api/classes/1/labs', validLab());

    assert.equal(response.status, 201);
    assert.equal(response.body.classId, 1);
    assert.equal(response.body.title, 'Merge Sort');
    assert.ok(Number.isInteger(response.body.id));
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
 * Students from another class cannot access the lab.
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
 * A valid enrolled student must not submit oversized code.
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
