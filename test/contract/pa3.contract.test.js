import assert from 'node:assert/strict';
import { test } from 'node:test';

import { open } from '../../src/db.js';
import { createApp } from '../../src/app.js';
import { processNextJob } from '../../src/worker.js';
import { createWorkerConstraintChecker } from '../../scripts/worker.js';

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

test('GET /api/labs/:labId/queue returns PA3 items with deductions & submissions overview, follows FAQ-02, and blocks cross-class TAs', async () => {
  const app = await startPa3();
  try {
    app.db
      .prepare(
        `INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
         VALUES (1, 'C1', 'Do not use std::sort', 3),
                (1, 'C2', 'Implement merge sort', 4)`,
      )
      .run();

    // stu1 submits twice before Lab 1 deadline: older violation + newer compliant AC submission
    const oldSub = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 4, 'violation', NULL, 'int main() { std::sort(); }', 'done', 'AC', '2026-10-31 10:00:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts (submission_id, constraint_code, verdict, source, evidence_json)
         VALUES (?, 'C1', 'violation', 'hard_rule', '[{"line":1,"text":"std::sort();"}]')`,
      )
      .run(oldSub);

    const newSub = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 4, 'pass', NULL, 'int main() { return 0; }', 'done', 'AC', '2026-10-31 20:00:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts (submission_id, constraint_code, verdict, source, evidence_json)
         VALUES (?, 'C1', 'pass', 'hard_rule', '[]'),
                (?, 'C2', 'pass', 'model', '[]')`,
      )
      .run(newSub, newSub);

    // stu2 latest submission before deadline has an unsure C2 verdict; also has an after-deadline row
    const stu2Sub = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 5, 'unsure', NULL, 'int main() {\n  return 0;\n}', 'done', 'AC', '2026-10-31 22:00:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts (submission_id, constraint_code, verdict, source, unsure_reason, evidence_json)
         VALUES (?, 'C2', 'unsure', 'model', 'model-timeout', '[]')`,
      )
      .run(stu2Sub);

    const crossClass = await app.as('tok-ta-b').get('/api/labs/1/queue');
    assert.equal(crossClass.status, 404);

    const res = await app.as('tok-ta-a').get('/api/labs/1/queue');
    assert.equal(res.status, 200);

    const pa3Items = res.body.items.filter((i) => i.verdictId !== undefined);
    // oldSub's C1 violation is superseded by newSub (FAQ-02); only stu2Sub's C2 unsure appears
    assert.equal(pa3Items.length, 1);
    assert.equal(pa3Items[0].id, stu2Sub);
    assert.equal(pa3Items[0].constraintCode, 'C2');
    assert.equal(pa3Items[0].deduction, 4);
    assert.equal(pa3Items[0].unsureReason, 'model-timeout');
    assert.equal(pa3Items[0].taDecision, null);

    // Counted submissions overview includes both stu1's newer compliant AC and stu2's unsure AC
    assert.equal(res.body.submissions.length, 2);
    const s1 = res.body.submissions.find((s) => s.id === newSub);
    assert.ok(s1);
    assert.equal(s1.verdicts.length, 2);
  } finally {
    await app.close();
  }
});

test('POST /api/verdicts/:verdictId/review validates evidence bounds, ownership, publish lock, and unblocks publish', async () => {
  const app = await startPa3();
  try {
    // Clear legacy PA2 pending submission 1 so only PA3 verdict controls Lab 1 publish gate
    app.db.prepare("UPDATE submissions SET decision = 'confirm' WHERE id = 1").run();
    app.db
      .prepare(
        `INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
         VALUES (1, 'C1', 'Do not use std::sort', 3)`,
      )
      .run();
    const subId = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 4, 'unsure', NULL, 'int main() {\n  // comment\n  return 0;\n}', 'done', 'AC', '2026-10-31 23:00:00')`,
        )
        .run().lastInsertRowid,
    );
    const verdictId = Number(
      app.db
        .prepare(
          `INSERT INTO constraint_verdicts (submission_id, constraint_code, verdict, source, unsure_reason, evidence_json)
           VALUES (?, 'C1', 'unsure', 'model', 'model-unsure', '[]')`,
        )
        .run(subId).lastInsertRowid,
    );

    // Unreviewed PA3 verdict on past-deadline Lab 1 MUST block publish (409)
    const blocked = await app.as('tok-ta-a').post('/api/labs/1/publish', {});
    assert.equal(blocked.status, 409);

    // Cross-class TA gets 404
    const wrongTa = await app.as('tok-ta-b').post(`/api/verdicts/${verdictId}/review`, {
      taDecision: 'pass',
    });
    assert.equal(wrongTa.status, 404);

    // Violation without evidence or out-of-range line 999 gets 400
    const missingEv = await app.as('tok-ta-a').post(`/api/verdicts/${verdictId}/review`, {
      taDecision: 'violation',
      evidence: [],
    });
    assert.equal(missingEv.status, 400);

    const outOfRange = await app.as('tok-ta-a').post(`/api/verdicts/${verdictId}/review`, {
      taDecision: 'violation',
      evidence: [{ line: 999, text: 'bad' }],
    });
    assert.equal(outOfRange.status, 400);

    // Reject fabricated evidence text that does not match the cited source line
    const mismatchedEv = await app.as('tok-ta-a').post(`/api/verdicts/${verdictId}/review`, {
      taDecision: 'violation',
      evidence: [{ line: 3, text: 'std::sort(a, a + n);' }],
    });
    assert.equal(mismatchedEv.status, 400);

    // Valid line evidence (normalized whitespace) succeeds, preserves source indentation, and unblocks publish
    const ok = await app.as('tok-ta-a').post(`/api/verdicts/${verdictId}/review`, {
      taDecision: 'violation',
      evidence: [{ line: 3, text: 'return 0;' }],
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.taDecision, 'violation');
    assert.deepEqual(ok.body.evidence, [{ line: 3, text: '  return 0;' }]);

    // Failed judge job on the latest counted submission blocks publish until resolved
    const failedSubId = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 5, 'unsure', NULL, 'int main(){}', 'queued', 'PENDING', '2026-10-31 23:10:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(`INSERT INTO judge_jobs (submission_id, status) VALUES (?, 'failed')`)
      .run(failedSubId);
    const blockedByFailedJob = await app.as('tok-ta-a').post('/api/labs/1/publish', {});
    assert.equal(blockedByFailedJob.status, 409);

    // Resubmitting a newer counted submission that finishes allows publish despite the superseded failed job
    const newerSubId = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 5, 'pass', NULL, 'int main(){ return 0; }', 'done', 'WA', '2026-10-31 23:20:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(`INSERT INTO judge_jobs (submission_id, status) VALUES (?, 'done')`)
      .run(newerSubId);

    const published = await app.as('tok-ta-a').post('/api/labs/1/publish', {});
    assert.equal(published.status, 200);

    // Reviewing after publish returns 409 already-published
    const afterPublish = await app.as('tok-ta-a').post(`/api/verdicts/${verdictId}/review`, {
      taDecision: 'pass',
    });
    assert.equal(afterPublish.status, 409);
  } finally {
    await app.close();
  }
});

test('GET /api/submissions/:id after publish handles FAQ-04 (non-AC = 0), FAQ-09 (confirmed unsure deducts), and FAQ-08 (overturned hidden)', async () => {
  const app = await startPa3();
  try {
    app.db
      .prepare(
        `INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
         VALUES (2, 'C1', 'Do not use std::sort', 3),
                (2, 'C2', 'Use merge sort', 4)`,
      )
      .run();

    // stu3: AC submission with C1 overturned (pass) and C2 unsure->confirmed (violation)
    const acSub = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (2, 6, 'pass', NULL, 'int main() { return 0; }', 'done', 'AC', '2026-10-31 12:00:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts (submission_id, constraint_code, verdict, source, evidence_json, ta_decision)
         VALUES (?, 'C1', 'violation', 'model', '[{"line":1,"text":"int main() { return 0; }"}]', 'pass'),
                (?, 'C2', 'unsure', 'model', '[{"line":1,"text":"int main() { return 0; }"}]', 'violation')`,
      )
      .run(acSub, acSub);

    // WA submission on Lab 2 for stu3 (FAQ-04 => 0 marks, 0 deductions)
    const waSub = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (2, 6, 'pass', NULL, 'int main() { return 1; }', 'done', 'WA', '2026-10-31 11:00:00')`,
        )
        .run().lastInsertRowid,
    );

    app.db.prepare(`UPDATE labs SET published_at = datetime('now') WHERE id = 2`).run();

    const acRes = await app.as('tok-stu3').get(`/api/submissions/${acSub}`);
    assert.equal(acRes.status, 200);
    assert.equal(acRes.body.mark, 6); // 10 - 4 (C2 confirmed); C1 overturned is excluded
    assert.equal(acRes.body.deductions.length, 1);
    assert.equal(acRes.body.deductions[0].constraintCode, 'C2');
    assert.equal(Object.hasOwn(acRes.body, 'constraintVerdicts'), false);

    const waRes = await app.as('tok-stu3').get(`/api/submissions/${waSub}`);
    assert.equal(waRes.status, 200);
    assert.equal(waRes.body.mark, 0);
    assert.deepEqual(waRes.body.deductions, []);
  } finally {
    await app.close();
  }
});

test('GET /api/submissions/:id exposes jobStatus on failed jobs and counted flag across resubmissions (FAQ-02)', async () => {
  const app = await startPa3();
  try {
    const first = await app.as('tok-stu3').post('/api/labs/3/submissions', {
      code: 'int main() { return 0; }',
    });
    assert.equal(first.status, 202);
    const sub1Id = first.body.id;

    app.db.prepare(`UPDATE judge_jobs SET status = 'failed' WHERE submission_id = ?`).run(sub1Id);

    const second = await app.as('tok-stu3').post('/api/labs/3/submissions', {
      code: 'int main() { return 1; }',
    });
    assert.equal(second.status, 202);
    const sub2Id = second.body.id;

    const res1 = await app.as('tok-stu3').get(`/api/submissions/${sub1Id}`);
    assert.equal(res1.status, 200);
    assert.equal(res1.body.jobStatus, 'failed');
    assert.equal(res1.body.counted, false);

    const res2 = await app.as('tok-stu3').get(`/api/submissions/${sub2Id}`);
    assert.equal(res2.status, 200);
    assert.equal(res2.body.jobStatus, 'queued');
    assert.equal(res2.body.counted, true);
  } finally {
    await app.close();
  }
});

test('createWorkerConstraintChecker persists model_calls, atomically updates labs.cost_spent_usd, and enforces cost-cap-exceeded', async () => {
  const db = open(':memory:', { migrateOnOpen: true, seed: true });
  try {
    db.prepare(
      `UPDATE labs SET statement = 'Implement merge sort', published_at = NULL WHERE id = 3`,
    ).run();
    const subId = Number(
      db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (3, 6, 'unsure', NULL, 'int main() {\n  return 0;\n}', 'running', 'PENDING', '2026-11-01 00:00:00')`,
        )
        .run().lastInsertRowid,
    );

    let calls = 0;
    const checker = createWorkerConstraintChecker(db, {
      modelOff: false,
      modelConfig: {
        modelName: 'gemini-3.8-flash',
        modelApiKey: 'fake-key',
        modelTimeoutMs: 5000,
        modelMaxCostUsdPerLab: 0.001,
      },
      llmTransport: async () => {
        calls += 1;
        return {
          rawText: JSON.stringify({
            results: [{ constraint: 'C2', verdict: 'pass', evidence: [] }],
          }),
          providerRequestId: 'req-worker-1',
          model: 'gemini-3.8-flash',
          inputTokens: 1000,
          outputTokens: 200,
        };
      },
    });

    const first = await checker({
      jobId: 1,
      submissionId: subId,
      labId: 3,
      code: 'int main() {\n  return 0;\n}',
      constraints: [{ id: 'C2', text: 'Use recursive merge sort' }],
    });
    assert.equal(calls, 1);
    assert.equal(first[0].verdict, 'pass');

    const labAfterFirst = /** @type {{ cost_spent_usd: number }} */ (
      db.prepare('SELECT cost_spent_usd FROM labs WHERE id = 3').get()
    );
    assert.ok(Math.abs(labAfterFirst.cost_spent_usd - 0.0015) < 1e-9);

    const second = await checker({
      jobId: 2,
      submissionId: subId,
      labId: 3,
      code: 'int main() {\n  return 0;\n}',
      constraints: [{ id: 'C2', text: 'Use recursive merge sort' }],
    });
    assert.equal(calls, 1);
    assert.equal(second[0].verdict, 'unsure');
    assert.equal(second[0].unsureReason, 'cost-cap-exceeded');

    const modelCalls = /** @type {Array<{ status: string }>} */ (
      db.prepare('SELECT status FROM model_calls WHERE lab_id = 3 ORDER BY id').all()
    );
    assert.deepEqual(
      modelCalls.map((r) => r.status),
      ['ok', 'cost_capped'],
    );
  } finally {
    db.close();
  }
});

test('Class 1 includes third student stu4 and GET /api/labs/:labId/queue exposes supersededSubmissions alongside counted submissions', async () => {
  const app = await startPa3();
  try {
    const meStu4 = await app.as('tok-stu4').get('/api/me');
    assert.equal(meStu4.status, 200);
    assert.equal(meStu4.body.name, 'stu4');
    assert.equal(meStu4.body.role, 'student');
    assert.deepEqual(meStu4.body.classes, [1]);

    const lab1Res = await app.as('tok-stu4').get('/api/labs/1');
    assert.equal(lab1Res.status, 200);
    const lab3Res = await app.as('tok-stu4').get('/api/labs/3');
    assert.equal(lab3Res.status, 404);

    app.db
      .prepare(
        `INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
         VALUES (1, 'C1', 'Do not use std::sort', 3),
                (1, 'C2', 'Implement merge sort', 4)`,
      )
      .run();

    const oldSub = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 4, 'violation', NULL, 'int main() { std::sort(); }', 'done', 'AC', '2026-10-31 10:00:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts (submission_id, constraint_code, verdict, source, evidence_json)
         VALUES (?, 'C1', 'violation', 'hard_rule', '[{"line":1,"text":"int main() { std::sort(); }"}]')`,
      )
      .run(oldSub);

    const newSub = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 4, 'pass', NULL, 'int main() { return 0; }', 'done', 'AC', '2026-10-31 20:00:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts (submission_id, constraint_code, verdict, source, evidence_json)
         VALUES (?, 'C1', 'pass', 'hard_rule', '[]'),
                (?, 'C2', 'pass', 'model', '[]')`,
      )
      .run(newSub, newSub);

    const stu2Sub = Number(
      app.db
        .prepare(
          `INSERT INTO submissions
             (lab_id, student_id, verdict, decision, code, judge_status, test_verdict, submitted_at)
           VALUES (1, 5, 'pass', NULL, 'int main() { return 0; }', 'done', 'AC', '2026-10-31 22:00:00')`,
        )
        .run().lastInsertRowid,
    );
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts (submission_id, constraint_code, verdict, source, evidence_json)
         VALUES (?, 'C1', 'pass', 'hard_rule', '[]'),
                (?, 'C2', 'pass', 'model', '[]')`,
      )
      .run(stu2Sub, stu2Sub);

    const queueRes = await app.as('tok-ta-a').get('/api/labs/1/queue');
    assert.equal(queueRes.status, 200);
    assert.deepEqual(
      queueRes.body.submissions.map((s) => s.id),
      [newSub, stu2Sub],
    );
    assert.equal(queueRes.body.items.filter((i) => i.verdictId !== undefined).length, 0);

    assert.ok(Array.isArray(queueRes.body.supersededSubmissions));
    assert.equal(queueRes.body.supersededSubmissions.length, 1);
    const sup = queueRes.body.supersededSubmissions[0];
    assert.equal(sup.id, oldSub);
    assert.equal(sup.student, 'stu1');
    assert.equal(sup.verdicts.length, 1);
    assert.equal(sup.verdicts[0].constraintCode, 'C1');
    assert.equal(sup.verdicts[0].verdict, 'violation');
    assert.equal(sup.verdicts[0].source, 'hard_rule');
    assert.equal(sup.verdicts[0].deduction, 3);
    assert.deepEqual(sup.verdicts[0].evidence, [{ line: 1, text: 'int main() { std::sort(); }' }]);
  } finally {
    await app.close();
  }
});
