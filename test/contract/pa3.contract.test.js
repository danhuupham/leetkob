import assert from 'node:assert/strict';
import { test } from 'node:test';

import { open } from '../../src/db.js';
import { createApp } from '../../src/app.js';
import { processNextJob } from '../../src/worker.js';

async function startPa3() {
  const db = open(':memory:', { migrateOnOpen: true, seed: true });
  const server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const call = async (method, path, token, body) => {
    /** @type {Record<string, string>} */
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    let payload;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(baseUrl + path, { method, headers, body: payload });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return {
      status: response.status,
      type: response.headers.get('content-type') || '',
      body: json,
    };
  };

  return {
    db,
    as: (token) => ({
      get: (path) => call('GET', path, token),
      post: (path, body) => call('POST', path, token, body),
    }),
    close: () =>
      new Promise((resolve) => server.close(() => resolve(undefined))).finally(() => db.close()),
  };
}

test('PA3 migration and seed create pipeline schema without expanding positional seed inserts', async () => {
  const db = open(':memory:', { migrateOnOpen: true, seed: true });
  try {
    const submissionColumns = db
      .prepare('PRAGMA table_info(submissions)')
      .all()
      .map((row) => row.name);
    assert.ok(submissionColumns.includes('code'));
    assert.ok(submissionColumns.includes('submitted_at'));
    const jobCount = /** @type {{ count: number }} */ (
      db.prepare('SELECT COUNT(*) AS count FROM judge_jobs').get()
    );
    assert.equal(jobCount.count, 0);
  } finally {
    db.close();
  }
});

test('lab detail hides hidden tests while returning public constraints', async () => {
  const app = await startPa3();
  try {
    app.db
      .prepare(`UPDATE labs SET statement = 'Use C++17', published_at = NULL WHERE id = 3`)
      .run();
    app.db
      .prepare(
        `INSERT INTO lab_tests (lab_id, ordinal, input_text, expected_output)
         VALUES (3, 1, 'secret-input', 'secret-output')`,
      )
      .run();
    app.db
      .prepare(
        `INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
         VALUES (3, 'C1', 'Do not use std::sort', 2)`,
      )
      .run();

    const response = await app.as('tok-stu3').get('/api/labs/3');
    assert.equal(response.status, 200);
    assert.equal(response.body.statement, 'Use C++17');
    assert.equal(response.body.constraints[0].deduction, 2);
    assert.equal(Object.hasOwn(response.body, 'lab_tests'), false);
  } finally {
    await app.close();
  }
});

test('submission is atomic with exactly one job and rejected owners stay hidden', async () => {
  const app = await startPa3();
  try {
    app.db
      .prepare(
        `INSERT INTO lab_tests (lab_id, ordinal, input_text, expected_output)
         VALUES (3, 1, '1', '1')`,
      )
      .run();
    const submitted = await app.as('tok-stu3').post('/api/labs/3/submissions', {
      code: 'int main() { return 0; }',
    });
    assert.equal(submitted.status, 202);
    assert.ok(submitted.body);
    assert.equal(submitted.body.status, 'queued');
    assert.equal(
      /** @type {{ count: number }} */ (
        app.db.prepare('SELECT COUNT(*) AS count FROM judge_jobs').get()
      ).count,
      1,
    );
    assert.ok(submitted.body);
    assert.equal(
      /** @type {{ count: number }} */ (
        app.db
          .prepare('SELECT COUNT(*) AS count FROM judge_jobs WHERE submission_id = ?')
          .get(submitted.body.id)
      ).count,
      1,
    );

    const owner = await app.as('tok-stu3').get(`/api/submissions/${submitted.body.id}`);
    assert.equal(owner.status, 200);
    assert.equal(Object.hasOwn(owner.body, 'deductions'), false);
    assert.equal(Object.hasOwn(owner.body, 'mark'), false);

    const other = await app.as('tok-stu1').get(`/api/submissions/${submitted.body.id}`);
    assert.equal(other.status, 404);
  } finally {
    await app.close();
  }
});

test('student sees no deductions before publish and confirmed deductions after publish', async () => {
  const app = await startPa3();
  try {
    app.db
      .prepare(
        `INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
         VALUES (1, 'C1', 'Do not use std::sort', 2)`,
      )
      .run();
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts
           (submission_id, constraint_code, verdict, source, evidence_json, ta_decision)
         VALUES (1, 'C1', 'violation', 'model', '[{"line":1,"text":"std::sort(a.begin(), a.end());"}]', 'violation')`,
      )
      .run();

    const before = await app.as('tok-stu1').get('/api/submissions/1');
    assert.equal(before.status, 200);
    assert.equal(Object.hasOwn(before.body, 'constraintVerdicts'), false);
    assert.equal(Object.hasOwn(before.body, 'deductions'), false);
    assert.equal(Object.hasOwn(before.body, 'mark'), false);

    app.db.prepare(`UPDATE labs SET published_at = datetime('now') WHERE id = 1`).run();
    const after = await app.as('tok-stu1').get('/api/submissions/1');
    assert.equal(after.status, 200);
    assert.equal(after.body.mark, 8);
    assert.equal(after.body.deductions.length, 1);
    assert.equal(after.body.deductions[0].constraintCode, 'C1');
  } finally {
    await app.close();
  }
});

test('queued jobs block publication and worker stores a processed result', async () => {
  const app = await startPa3();
  try {
    app.db
      .prepare(
        `INSERT INTO lab_tests (lab_id, ordinal, input_text, expected_output)
         VALUES (1, 1, '1', '1')`,
      )
      .run();
    app.db
      .prepare(
        `INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
         VALUES (1, 'C1', 'Do not use std::sort', 2)`,
      )
      .run();
    const inserted = app.db
      .prepare(
        `INSERT INTO submissions
           (lab_id, student_id, verdict, decision, code, judge_status,
            test_verdict, submitted_at)
         VALUES (1, 4, 'unsure', NULL, 'int main() { return 0; }', 'queued',
                 'PENDING', datetime('now'))`,
      )
      .run();
    app.db
      .prepare(`INSERT INTO judge_jobs (submission_id, status) VALUES (?, 'queued')`)
      .run(inserted.lastInsertRowid);

    const blocked = await app.as('tok-ta-a').post('/api/labs/1/publish', {});
    assert.equal(blocked.status, 409);
    assert.match(blocked.type, /application\/problem\+json/);

    const processed = await processNextJob({
      db: app.db,
      sandboxRunner: async () => ({
        testVerdict: 'AC',
        compileStderr: '',
        testResults: [{ ordinal: 1, verdict: 'AC' }],
        durationMs: 1,
      }),
      constraintChecker: async () => [
        {
          constraintCode: 'C1',
          verdict: 'pass',
          source: 'hard_rule',
          evidence: [],
        },
      ],
    });
    assert.equal(processed, true);
    const job = /** @type {{ status: string } | undefined} */ (
      app.db
        .prepare('SELECT status FROM judge_jobs WHERE submission_id = ?')
        .get(inserted.lastInsertRowid)
    );
    assert.ok(job);
    assert.equal(job.status, 'done');
  } finally {
    await app.close();
  }
});
