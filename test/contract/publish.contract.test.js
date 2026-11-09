// The contract in docs/contract/publish.md, as executable HTTP contract tests.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../helpers.js';

const BASE = 'https://leetkob.example/problems/';

/** @type {Awaited<ReturnType<typeof startApp>>} */
let app;
beforeEach(async () => {
  app = await startApp();
});
afterEach(() => app.close());

/**
 * @param {string | null} user
 * @param {number | string} lab
 * @param {unknown} [body]
 * @param {Record<string, string>} [extraHeaders]
 */
const publish = (user, lab, body, extraHeaders) =>
  app.as(user).post(`/api/labs/${lab}/publish`, body, extraHeaders);

/**
 * @param {{ status: number, type: string, body: any }} r
 * @param {number} status
 * @param {string} slug
 */
function assertProblem(r, status, slug) {
  assert.equal(r.status, status);
  assert.match(r.type, /^application\/problem\+json/);
  assert.equal(r.body.type, BASE + slug);
  assert.equal(r.body.status, status);
  assert.equal(typeof r.body.title, 'string');
  assert.ok(r.body.title.length > 0);
}

test('no token is 401 and publishes nothing', async () => {
  assertProblem(await publish(null, 2), 401, 'unauthenticated');
  assert.equal(app.publishedAt(2), null);
});

test('an unknown Bearer token is 401 and publishes nothing', async () => {
  assertProblem(await publish('unknown_user', 2), 401, 'unauthenticated');
  assert.equal(app.publishedAt(2), null);
});

test('a lab that does not exist is 404', async () => {
  assertProblem(await publish('admin', 99), 404, 'not-found');
});

test('a non-positive or non-integer labId is 404', async () => {
  assertProblem(await publish('admin', 0), 404, 'not-found');
  assertProblem(await publish('admin', -1), 404, 'not-found');
  assertProblem(await publish('admin', 'abc'), 404, 'not-found');
});

test('a student of the class is 403 and publishes nothing', async () => {
  assertProblem(await publish('stu3', 2), 403, 'forbidden');
  assert.equal(app.publishedAt(2), null);
});

test('a student of another class is 404 (same as non-existent lab) and publishes nothing', async () => {
  const notThere = await publish('admin', 99);
  const wrongClassStudent = await publish('stu1', 2);
  assertProblem(wrongClassStudent, 404, 'not-found');
  assert.equal(wrongClassStudent.body.type, notThere.body.type);
  assert.equal(app.publishedAt(2), null);
});

test('a TA of another class is 404 and publishes nothing', async () => {
  const r = await publish('ta_a', 2);
  assertProblem(r, 404, 'not-found');
  assert.equal(app.publishedAt(2), null);
});

test('it refuses while reviews are pending', async () => {
  const r = await publish('ta_a', 1);
  assertProblem(r, 409, 'reviews-pending');
  assert.equal(r.body.pending, 1);
  assert.equal(app.publishedAt(1), null);
});

test('malformed JSON in request body is 400 invalid-json and publishes nothing', async () => {
  const r = await app.as('ta_b').postRaw('/api/labs/2/publish', '{"broken":');
  assertProblem(r, 400, 'invalid-json');
  assert.equal(app.publishedAt(2), null);
});

test('a non-object JSON body or invalid Idempotency-Key is 400 validation and publishes nothing', async () => {
  const badBody = await publish('ta_b', 2, ['not-an-object']);
  assertProblem(badBody, 400, 'validation');
  assert.ok(Array.isArray(badBody.body.errors));
  assert.equal(app.publishedAt(2), null);

  const longKey = 'k'.repeat(256);
  const badKey = await publish('ta_b', 2, undefined, { 'Idempotency-Key': longKey });
  assertProblem(badKey, 400, 'validation');
  assert.equal(app.publishedAt(2), null);
});

test('the TA of the class publishes a lab with no pending review', async () => {
  const r = await publish('ta_b', 2);
  assert.equal(r.status, 200);
  assert.equal(r.body.lab, 2);
  assert.ok(r.body.publishedAt);
  assert.equal(app.publishedAt(2), r.body.publishedAt);
});

test('the TA can publish once all pending reviews in the queue are decided', async () => {
  const rev = await app.as('ta_a').post('/api/submissions/1/review', { decision: 'confirm' });
  assert.equal(rev.status, 200);

  const r = await publish('ta_a', 1);
  assert.equal(r.status, 200);
  assert.equal(r.body.lab, 1);
  assert.ok(r.body.publishedAt);
  assert.equal(app.publishedAt(1), r.body.publishedAt);
});

test('an admin may publish', async () => {
  assert.equal((await publish('admin', 2)).status, 200);
});

test('publishing again is safe and does not move the time', async () => {
  const first = await publish('ta_b', 2);
  await new Promise((r) => setTimeout(r, 1100)); // the clock has one-second resolution
  const again = await publish('ta_b', 2);
  assert.equal(again.status, 200);
  assert.equal(again.body.publishedAt, first.body.publishedAt);
});

test('retrying with Idempotency-Key replays the stored response with Idempotent-Replayed: true', async () => {
  const key = 'publish-lab-2-attempt-01';
  const first = await publish('ta_b', 2, undefined, { 'Idempotency-Key': key });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('idempotent-replayed'), null);

  const replay = await publish('ta_b', 2, undefined, { 'Idempotency-Key': key });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.publishedAt, first.body.publishedAt);
  assert.equal(replay.headers.get('idempotent-replayed'), 'true');
});

test('problem details never leak SQL queries, table names, or stack traces in detail', async () => {
  const responses = await Promise.all([
    publish(null, 2),
    publish('stu3', 2),
    publish('ta_a', 2),
    publish('ta_a', 1),
  ]);
  for (const r of responses) {
    assert.equal(typeof r.body.detail, 'string');
    assert.doesNotMatch(
      r.body.detail,
      /SELECT|UPDATE|INSERT|sqlite|class_staff|enrollments|\.js:/i,
    );
  }
});
