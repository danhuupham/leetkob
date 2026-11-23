import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/db.js';

/**
 * Ensures a database row exists before accessing its fields.
 *
 * @template T
 * @param {T | undefined} value
 * @returns {T}
 */
function required(value) {
  assert.ok(value !== undefined, 'Expected database row to exist');
  return value;
}

/**
 * Creates an isolated in-memory SQLite database for each test.
 *
 * @param {'AC'|'WA'|'TLE'|'MLE'|'RE'|'CE'} [testVerdict]
 */
function setup(testVerdict = 'AC') {
  const db = new DatabaseSync(':memory:');

  migrate(db);

  db.prepare(
    "INSERT INTO users (id, name, role, token) VALUES (1, 'student', 'student', 'test-token')",
  ).run();

  db.prepare("INSERT INTO labs (id, class_id, title) VALUES (1, 1, 'Queue test')").run();

  db.prepare(
    `INSERT INTO lab_tests
       (lab_id, ordinal, input_text, expected_output)
     VALUES (1, 1, '2', '2')`,
  ).run();

  db.prepare(
    `INSERT INTO lab_constraints
       (lab_id, constraint_code, rule_text, deduction)
     VALUES (1, 'C1', 'Do not use std::sort', 2)`,
  ).run();

  db.prepare(
    `INSERT INTO submissions
       (id, lab_id, student_id, verdict, code, judge_status, test_verdict)
     VALUES (1, 1, 1, 'pass', 'int main() {}', 'queued', ?)`,
  ).run('PENDING');

  db.prepare('INSERT INTO judge_jobs (id, submission_id) VALUES (1, 1)').run();

  const calls = {
    sandbox: 0,
    checker: 0,
  };

  /**
   * Fake sandbox runner.
   * No real Docker container is executed.
   *
   * @type {import('../../src/worker.js').WorkerOptions['sandboxRunner']}
   */
  const sandboxRunner = async ({ code, tests }) => {
    calls.sandbox += 1;

    assert.equal(code, 'int main() {}');

    assert.deepEqual(tests, [
      {
        ordinal: 1,
        inputText: '2',
        expectedOutput: '2',
      },
    ]);

    return {
      testVerdict,
      compileStderr: '',
      testResults:
        testVerdict === 'CE'
          ? []
          : [
              {
                ordinal: 1,
                verdict: testVerdict,
              },
            ],
      durationMs: 1,
    };
  };

  /**
   * Fake constraint checker.
   * No real Gemini API or hard-rule engine is called.
   *
   * @type {import('../../src/worker.js').WorkerOptions['constraintChecker']}
   */
  const constraintChecker = async () => {
    calls.checker += 1;

    return [
      {
        constraintCode: 'C1',
        verdict: 'violation',
        source: 'hard_rule',
        unsureReason: null,
        evidence: [
          {
            line: 1,
            text: 'int main() {}',
          },
        ],
        rationale: 'Fake verdict for offline testing',
      },
    ];
  };

  return {
    db,
    calls,
    sandboxRunner,
    constraintChecker,
  };
}

/**
 * Reads the submission state.
 *
 * @param {DatabaseSync} db
 */
function submission(db) {
  return required(
    db
      .prepare(
        `SELECT judge_status, test_verdict
         FROM submissions
         WHERE id = 1`,
      )
      .get(),
  );
}

/**
 * Counts saved constraint verdicts.
 *
 * @param {DatabaseSync} db
 */
function verdictCount(db) {
  return required(
    db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM constraint_verdicts
         WHERE submission_id = 1`,
      )
      .get(),
  ).n;
}

/**
 * AC1
 *
 * A submission must remain queued when no worker is running.
 * Once the worker starts, the job must finish successfully.
 */
test('AC1: queued submission waits while worker is stopped, then completes', async () => {
  const ctx = setup();

  try {
    assert.equal(submission(ctx.db).judge_status, 'queued');

    assert.equal(verdictCount(ctx.db), 0);

    const queuedJob = required(ctx.db.prepare('SELECT status FROM judge_jobs WHERE id = 1').get());

    assert.equal(queuedJob.status, 'queued');
    assert.equal(ctx.calls.sandbox, 0);

    const { processNextJob } = await import('../../src/worker.js');

    assert.equal(await processNextJob(ctx), true);

    assert.equal(submission(ctx.db).judge_status, 'done');
    assert.equal(submission(ctx.db).test_verdict, 'AC');

    const completedJob = required(
      ctx.db.prepare('SELECT status FROM judge_jobs WHERE id = 1').get(),
    );

    assert.equal(completedJob.status, 'done');

    assert.equal(ctx.calls.sandbox, 1);
    assert.equal(ctx.calls.checker, 1);
    assert.equal(verdictCount(ctx.db), 1);

    // No additional queued job should remain.
    assert.equal(await processNextJob(ctx), false);
  } finally {
    ctx.db.close();
  }
});

/**
 * AC2
 *
 * A crashed worker may leave a job in the running state.
 * A stale job must be reclaimed without duplicating verdicts.
 */
test('AC2: stale running job is reclaimed without duplicating constraint verdicts', async () => {
  const ctx = setup();

  try {
    // Simulate a worker that crashed 120 seconds ago.
    ctx.db
      .prepare(
        `UPDATE judge_jobs
         SET status = 'running',
             locked_at = datetime('now', '-120 seconds'),
             attempts = 1
         WHERE id = 1`,
      )
      .run();

    // Simulate a verdict saved before the interruption.
    ctx.db
      .prepare(
        `INSERT INTO constraint_verdicts
           (submission_id, constraint_code, verdict, source, evidence_json)
         VALUES
           (1, 'C1', 'pass', 'hard_rule', '[]')`,
      )
      .run();

    const { processNextJob } = await import('../../src/worker.js');

    assert.equal(await processNextJob(ctx), true);

    assert.equal(submission(ctx.db).judge_status, 'done');

    const job = required(
      ctx.db.prepare('SELECT status, attempts FROM judge_jobs WHERE id = 1').get(),
    );

    assert.equal(job.status, 'done');
    assert.equal(job.attempts, 2);

    // An existing verdict must be updated, not duplicated.
    assert.equal(verdictCount(ctx.db), 1);

    const savedVerdict = required(
      ctx.db
        .prepare(
          `SELECT verdict
           FROM constraint_verdicts
           WHERE submission_id = 1
             AND constraint_code = 'C1'`,
        )
        .get(),
    );

    assert.equal(savedVerdict.verdict, 'violation');
    assert.equal(ctx.calls.checker, 1);
  } finally {
    ctx.db.close();
  }
});

/**
 * AC3
 *
 * WA and CE submissions must not invoke the constraint checker.
 */
for (const testVerdict of /** @type {const} */ (['WA', 'CE'])) {
  test(`AC3: ${testVerdict} completes without calling constraintChecker`, async () => {
    const ctx = setup(testVerdict);

    try {
      const { processNextJob } = await import('../../src/worker.js');

      assert.equal(await processNextJob(ctx), true);

      assert.equal(submission(ctx.db).judge_status, 'done');
      assert.equal(submission(ctx.db).test_verdict, testVerdict);

      const completedJob = required(
        ctx.db.prepare('SELECT status FROM judge_jobs WHERE id = 1').get(),
      );

      assert.equal(completedJob.status, 'done');

      // WA and CE must not generate constraint verdicts.
      assert.equal(verdictCount(ctx.db), 0);

      // The constraint checker must never be called.
      assert.equal(ctx.calls.checker, 0);

      // The sandbox should still run exactly once.
      assert.equal(ctx.calls.sandbox, 1);
    } finally {
      ctx.db.close();
    }
  });
}

test('AC4: transient sandbox failure requeues job until maxAttempts, then marks failed without leaving submission running', async () => {
  const ctx = setup('AC');

  try {
    const { processNextJob } = await import('../../src/worker.js');
    const failingCtx = {
      db: ctx.db,
      sandboxRunner: async () => {
        throw new Error('Docker daemon busy');
      },
      constraintChecker: ctx.constraintChecker,
      maxAttempts: 2,
    };

    await assert.rejects(() => processNextJob(failingCtx), /Docker daemon busy/);
    const afterAttempt1 = required(
      ctx.db.prepare('SELECT status, attempts, locked_at FROM judge_jobs WHERE id = 1').get(),
    );
    assert.equal(afterAttempt1.status, 'queued');
    assert.equal(afterAttempt1.attempts, 1);
    assert.equal(afterAttempt1.locked_at, null);
    assert.equal(submission(ctx.db).judge_status, 'queued');

    await assert.rejects(() => processNextJob(failingCtx), /Docker daemon busy/);
    const afterAttempt2 = required(
      ctx.db.prepare('SELECT status, attempts, finished_at FROM judge_jobs WHERE id = 1').get(),
    );
    assert.equal(afterAttempt2.status, 'failed');
    assert.equal(afterAttempt2.attempts, 2);
    assert.ok(afterAttempt2.finished_at !== null);
    assert.equal(submission(ctx.db).judge_status, 'queued');
  } finally {
    ctx.db.close();
  }
});

test('AC5: startWorkerLoop catches job errors and continues processing remaining jobs', async () => {
  const ctx = setup('AC');

  try {
    ctx.db
      .prepare(
        `INSERT INTO submissions
           (id, lab_id, student_id, verdict, code, judge_status, test_verdict)
         VALUES (2, 1, 1, 'pass', 'int main() { return 0; }', 'queued', 'PENDING')`,
      )
      .run();
    ctx.db.prepare('INSERT INTO judge_jobs (id, submission_id) VALUES (2, 2)').run();

    const { startWorkerLoop } = await import('../../src/worker.js');
    const abort = new AbortController();
    /** @type {unknown[]} */
    const caughtErrors = [];

    const loopPromise = startWorkerLoop({
      db: ctx.db,
      signal: abort.signal,
      pollIntervalMs: 10,
      maxAttempts: 1,
      onError: (err) => caughtErrors.push(err),
      sandboxRunner: async ({ jobId }) => {
        if (jobId === 1) {
          throw new Error('Simulated job 1 failure');
        }
        return {
          testVerdict: 'AC',
          compileStderr: '',
          testResults: [{ ordinal: 1, verdict: 'AC' }],
          durationMs: 1,
        };
      },
      constraintChecker: ctx.constraintChecker,
    });

    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const job2 = required(ctx.db.prepare('SELECT status FROM judge_jobs WHERE id = 2').get());
      if (job2.status === 'done') break;
      await new Promise((r) => setTimeout(r, 15));
    }
    abort.abort();
    await loopPromise;

    assert.equal(caughtErrors.length, 1);
    const job1 = required(ctx.db.prepare('SELECT status FROM judge_jobs WHERE id = 1').get());
    const job2 = required(ctx.db.prepare('SELECT status FROM judge_jobs WHERE id = 2').get());
    const sub2 = required(
      ctx.db.prepare('SELECT judge_status FROM submissions WHERE id = 2').get(),
    );
    assert.equal(job1.status, 'failed');
    assert.equal(job2.status, 'done');
    assert.equal(sub2.judge_status, 'done');
  } finally {
    ctx.db.close();
  }
});

test('AC6: claimNextJob enforces maxAttempts on stale locks and fencing prevents stale overwrite', async () => {
  const ctx = setup('AC');

  try {
    const { claimNextJob, processNextJob } = await import('../../src/worker.js');

    // A stale running job that already reached maxAttempts must not be reclaimed endlessly.
    ctx.db
      .prepare(
        `UPDATE judge_jobs
            SET status = 'running',
                locked_at = datetime('now', '-120 seconds'),
                attempts = 2
          WHERE id = 1`,
      )
      .run();
    assert.equal(claimNextJob(ctx.db, 2), undefined);

    // Reset job 1 cleanly, then simulate stale-lock takeover while worker 1 is mid-run.
    ctx.db
      .prepare(
        `UPDATE judge_jobs
            SET status = 'queued',
                locked_at = NULL,
                attempts = 0
          WHERE id = 1`,
      )
      .run();

    for (const outcome of /** @type {const} */ (['resolve', 'reject'])) {
      ctx.db
        .prepare(
          `UPDATE judge_jobs
              SET status = 'queued',
                  locked_at = NULL,
                  finished_at = NULL,
                  attempts = 0
            WHERE id = 1`,
        )
        .run();
      ctx.db
        .prepare(
          `UPDATE submissions
              SET judge_status = 'queued',
                  test_verdict = 'PENDING'
            WHERE id = 1`,
        )
        .run();
      ctx.db.prepare('DELETE FROM constraint_verdicts WHERE submission_id = 1').run();

      const workerPromise = processNextJob({
        db: ctx.db,
        maxAttempts: 3,
        heartbeatIntervalMs: 0,
        sandboxRunner: async () => {
          // Worker 2 took over and finished the job cleanly while worker 1 was stalled.
          ctx.db
            .prepare(
              `UPDATE judge_jobs
                  SET status = 'done',
                      locked_at = NULL,
                      attempts = 2,
                      finished_at = datetime('now')
                WHERE id = 1`,
            )
            .run();
          ctx.db
            .prepare(
              `UPDATE submissions
                  SET judge_status = 'done',
                      test_verdict = 'AC'
                WHERE id = 1`,
            )
            .run();
          ctx.db
            .prepare(
              `INSERT INTO constraint_verdicts
                 (submission_id, constraint_code, verdict, source, evidence_json)
               VALUES (1, 'C1', 'pass', 'hard_rule', '[]')`,
            )
            .run();

          if (outcome === 'reject') {
            throw new Error('Stale worker timed out');
          }
          return {
            testVerdict: 'WA',
            compileStderr: '',
            testResults: [{ ordinal: 1, verdict: 'WA' }],
            durationMs: 1,
          };
        },
        constraintChecker: ctx.constraintChecker,
      });

      if (outcome === 'reject') {
        await assert.rejects(() => workerPromise, /Stale worker timed out/);
      } else {
        await workerPromise;
      }

      const job = required(
        ctx.db.prepare('SELECT status, attempts FROM judge_jobs WHERE id = 1').get(),
      );
      const sub = submission(ctx.db);
      const verdicts = ctx.db
        .prepare('SELECT constraint_code, verdict FROM constraint_verdicts WHERE submission_id = 1')
        .all();
      assert.equal(job.status, 'done');
      assert.equal(job.attempts, 2);
      assert.equal(sub.judge_status, 'done');
      assert.equal(sub.test_verdict, 'AC');
      assert.equal(verdicts.length, 1);
      assert.equal(verdicts[0].verdict, 'pass');
    }
  } finally {
    ctx.db.close();
  }
});
