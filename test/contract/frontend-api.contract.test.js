import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { serveStatic } from '../../src/http.js';
import { startApp } from '../helpers.js';

test('GET /api/me includes classDetails for authorized classes', async () => {
  const app = await startApp();
  try {
    const ta = await app.as('ta_a').get('/api/me');
    assert.equal(ta.status, 200);
    assert.deepEqual(ta.body.classes, [1]);
    assert.equal(ta.body.classDetails.length, 1);
    assert.equal(ta.body.classDetails[0].id, 1);
    assert.equal(ta.body.classDetails[0].code, 'CSC13114-01');

    const admin = await app.as('admin').get('/api/me');
    assert.equal(admin.status, 200);
    assert.deepEqual(admin.body.classes, [1, 2]);
    assert.equal(admin.body.classDetails.length, 2);
  } finally {
    await app.close();
  }
});

test('GET /api/labs enforces class isolation and omits staff-only or hidden-test fields for students', async () => {
  const app = await startApp();
  try {
    const unauth = await app.as(null).get('/api/labs');
    assert.equal(unauth.status, 401);
    assert.match(unauth.type, /application\/problem\+json/);

    const taA = await app.as('ta_a').get('/api/labs');
    assert.equal(taA.status, 200);
    assert.deepEqual(
      taA.body.labs.map((/** @type {{ id: number }} */ l) => l.id),
      [1],
    );
    assert.equal(taA.body.labs[0].pendingReviews, 1);
    assert.equal(typeof taA.body.labs[0].costSpentUsd, 'number');

    const taB = await app.as('ta_b').get('/api/labs');
    assert.equal(taB.status, 200);
    assert.deepEqual(
      taB.body.labs.map((/** @type {{ id: number }} */ l) => l.id),
      [2, 3],
    );

    const stu1 = await app.as('stu1').get('/api/labs');
    assert.equal(stu1.status, 200);
    assert.deepEqual(
      stu1.body.labs.map((/** @type {{ id: number }} */ l) => l.id),
      [1],
    );
    assert.equal(Object.hasOwn(stu1.body.labs[0], 'pendingReviews'), false);
    assert.equal(Object.hasOwn(stu1.body.labs[0], 'costSpentUsd'), false);
    assert.equal(Object.hasOwn(stu1.body.labs[0], 'lab_tests'), false);
    assert.ok(stu1.body.labs[0].latestSubmission);
    assert.equal(Object.hasOwn(stu1.body.labs[0].latestSubmission, 'mark'), false);

    const admin = await app.as('admin').get('/api/labs');
    assert.equal(admin.status, 200);
    assert.deepEqual(
      admin.body.labs.map((/** @type {{ id: number }} */ l) => l.id),
      [1, 2, 3],
    );
  } finally {
    await app.close();
  }
});

test('GET /api/labs/:labId/submissions isolates students and enforces FAQ-08 before and after publish', async () => {
  const app = await startApp();
  try {
    const unauth = await app.as(null).get('/api/labs/3/submissions');
    assert.equal(unauth.status, 401);

    const crossStudent = await app.as('stu1').get('/api/labs/3/submissions');
    assert.equal(crossStudent.status, 404);

    const crossTa = await app.as('ta_a').get('/api/labs/3/submissions');
    assert.equal(crossTa.status, 404);

    app.db
      .prepare(
        `INSERT INTO lab_constraints (lab_id, constraint_code, rule_text, deduction)
         VALUES (3, 'C1', 'Do not use std::sort', 3),
                (3, 'C2', 'Use O(n log n) recursion', 4)`,
      )
      .run();

    const stu3Old = await app.as('stu3').post('/api/labs/3/submissions', {
      code: 'int main() { return 1; }',
    });
    assert.equal(stu3Old.status, 202);
    const oldSubId = stu3Old.body.id;
    app.db
      .prepare(`UPDATE submissions SET judge_status = 'done', test_verdict = 'WA' WHERE id = ?`)
      .run(oldSubId);
    app.db.prepare(`UPDATE judge_jobs SET status = 'done' WHERE submission_id = ?`).run(oldSubId);

    const stu3Sub = await app.as('stu3').post('/api/labs/3/submissions', {
      code: 'int main() { return 0; }',
    });
    assert.equal(stu3Sub.status, 202);
    const subId = stu3Sub.body.id;

    app.db
      .prepare(`UPDATE submissions SET judge_status = 'done', test_verdict = 'AC' WHERE id = ?`)
      .run(subId);
    app.db.prepare(`UPDATE judge_jobs SET status = 'done' WHERE submission_id = ?`).run(subId);
    app.db
      .prepare(
        `INSERT INTO constraint_verdicts
           (submission_id, constraint_code, verdict, source, evidence_json, ta_decision)
         VALUES (?, 'C1', 'violation', 'hard_rule', '[{"line":1,"text":"int main() { return 0; }"}]', 'violation'),
                (?, 'C2', 'unsure', 'model', '[]', 'pass')`,
      )
      .run(subId, subId);

    const beforePublish = await app.as('stu3').get('/api/labs/3/submissions');
    assert.equal(beforePublish.status, 200);
    assert.equal(beforePublish.body.publishedAt, null);
    assert.equal(beforePublish.body.submissions.length, 2);
    const hiddenItem = beforePublish.body.submissions[0];
    assert.equal(hiddenItem.id, subId);
    assert.equal(hiddenItem.testVerdict, 'AC');
    assert.equal(Object.hasOwn(hiddenItem, 'mark'), false);
    assert.equal(Object.hasOwn(hiddenItem, 'deductions'), false);
    assert.equal(Object.hasOwn(hiddenItem, 'constraintVerdicts'), false);

    // Enrolling stu2 in class 2 must still keep stu3's submissions private from stu2.
    app.db.prepare('INSERT INTO enrollments (class_id, user_id) VALUES (2, 5)').run();
    const stu2OwnOnly = await app.as('stu2').get('/api/labs/3/submissions');
    assert.equal(stu2OwnOnly.status, 200);
    assert.equal(stu2OwnOnly.body.submissions.length, 0);

    // Move deadline into past (with submissions prior to deadline per FAQ-02) and publish lab 3.
    app.db.prepare("UPDATE labs SET deadline_at = '2026-01-01 00:00:00' WHERE id = 3").run();
    app.db
      .prepare("UPDATE submissions SET submitted_at = '2025-12-31 23:59:59' WHERE id IN (?, ?)")
      .run(oldSubId, subId);
    const pub = await app.as('ta_b').post('/api/labs/3/publish');
    assert.equal(pub.status, 200);

    const taSubs = await app.as('ta_b').get('/api/labs/3/submissions');
    assert.equal(taSubs.status, 200);
    assert.equal(taSubs.body.submissions[0].student, 'stu3');
    assert.equal(taSubs.body.submissions[0].mark, 7);
    assert.equal(Object.hasOwn(taSubs.body.submissions[0], 'code'), false);

    const afterPublish = await app.as('stu3').get('/api/labs/3/submissions');
    assert.equal(afterPublish.status, 200);
    assert.ok(afterPublish.body.publishedAt);
    const countedItem = afterPublish.body.submissions.find(
      (/** @type {{ id: number }} */ s) => s.id === subId,
    );
    const supersededItem = afterPublish.body.submissions.find(
      (/** @type {{ id: number }} */ s) => s.id === oldSubId,
    );
    assert.equal(countedItem.counted, true);
    assert.equal(countedItem.mark, 7);
    assert.equal(countedItem.code, 'int main() { return 0; }');
    assert.equal(countedItem.deductions.length, 1);
    assert.equal(countedItem.deductions[0].constraintCode, 'C1');
    assert.equal(Object.hasOwn(countedItem, 'constraintVerdicts'), false);

    assert.equal(supersededItem.counted, false);
    assert.equal(Object.hasOwn(supersededItem, 'mark'), false);
    assert.equal(Object.hasOwn(supersededItem, 'deductions'), false);

    // Student lab summary reflects published mark too.
    const stu3Labs = await app.as('stu3').get('/api/labs');
    const lab3 = stu3Labs.body.labs.find((/** @type {{ id: number }} */ l) => l.id === 3);
    assert.equal(lab3.latestSubmission.mark, 7);
  } finally {
    await app.close();
  }
});

test('serveStatic writes headers and omits response body for HEAD requests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'leetkob-static-'));
  try {
    writeFileSync(join(dir, 'index.html'), '<h1>LeeTKOB</h1>', 'utf8');
    /** @type {{ status: number | null, headers: Record<string, string>, ended: unknown }} */
    const mockRes = { status: null, headers: {}, ended: 'unset' };
    const fakeRes = /** @type {import('node:http').ServerResponse} */ (
      /** @type {unknown} */ ({
        writeHead(status, headers) {
          mockRes.status = status;
          mockRes.headers = headers;
        },
        end(body) {
          mockRes.ended = body;
        },
      })
    );

    const handled = serveStatic(dir, '/', fakeRes, true);
    assert.equal(handled, true);
    assert.equal(mockRes.status, 200);
    assert.equal(mockRes.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(mockRes.headers['content-length'], '16');
    assert.equal(mockRes.ended, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
