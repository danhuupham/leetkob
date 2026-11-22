import { config } from './config.js';

/**
 * Atomically claims the oldest available job.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function claimNextJob(db) {
  return db
    .prepare(
      `
    UPDATE judge_jobs
    SET status = 'running',
        locked_at = datetime('now'),
        started_at = COALESCE(started_at, datetime('now')),
        attempts = attempts + 1
    WHERE id = (
      SELECT id
      FROM judge_jobs
      WHERE status = 'queued'
         OR (
           status = 'running'
           AND locked_at <= datetime('now', '-60 seconds')
         )
      ORDER BY id ASC
      LIMIT 1
    )
    RETURNING id, submission_id, attempts, trace_id
  `,
    )
    .get();
}

/**
 * @typedef {{
 *   testVerdict: 'AC'|'WA'|'TLE'|'MLE'|'RE'|'CE',
 *   compileStderr: string,
 *   testResults: Array<{ordinal:number, verdict:string}>,
 *   durationMs: number
 * }} SandboxResult
 *
 * @typedef {{
 *   constraintCode: string,
 *   verdict: 'pass'|'violation'|'unsure',
 *   source: 'hard_rule'|'model',
 *   unsureReason?: 'model-unsure'|'schema-invalid'|
 *     'evidence-mismatch'|'model-timeout'|'cost-cap-exceeded'|'model-off'|null,
 *   evidence: Array<{line:number,text:string}>,
 *   rationale?: string
 * }} ConstraintResult
 *
 * @typedef {{
 *   db: import('node:sqlite').DatabaseSync,
 *   sandboxRunner: (args: {
 *     jobId: number,
 *     code: string,
 *     tests: Array<{
 *       ordinal:number,
 *       inputText:string,
 *       expectedOutput:string
 *     }>,
 *     cpuLimitSec:number,
 *     memoryLimitMb:number,
 *     sandboxConfig: typeof config.sandbox
 *   }) => Promise<SandboxResult>,
 *   constraintChecker: (args: {
 *     jobId:number,
 *     submissionId:number,
 *     labId:number,
 *     code:string,
 *     constraints:Array<{id:string,text:string}>
 *   }) => Promise<ConstraintResult[]>
 * }} WorkerOptions
 */

/**
 * Processes one job, or returns false if none exists.
 * @param {WorkerOptions} options
 */
export async function processNextJob({ db, sandboxRunner, constraintChecker }) {
  const job = /** @type {{
    id:number,
    submission_id:number,
    attempts:number,
    trace_id:string|null
  }|undefined} */ (claimNextJob(db));

  if (!job) return false;

  try {
    const submission = /** @type {{
      id:number,
      lab_id:number,
      code:string,
      cpu_limit_sec:number,
      memory_limit_mb:number
    }|undefined} */ (
      db
        .prepare(
          `
        SELECT s.id, s.lab_id, s.code,
               l.cpu_limit_sec, l.memory_limit_mb
        FROM submissions s
        JOIN labs l ON l.id = s.lab_id
        WHERE s.id = ?
      `,
        )
        .get(job.submission_id)
    );

    if (!submission) {
      throw new Error('Job submission not found');
    }

    db.prepare(
      `
      UPDATE submissions
      SET judge_status = 'running'
      WHERE id = ?
    `,
    ).run(submission.id);

    const tests = /** @type {Array<{
      ordinal:number,
      input_text:string,
      expected_output:string
    }>} */ (
      db
        .prepare(
          `
        SELECT ordinal, input_text, expected_output
        FROM lab_tests
        WHERE lab_id = ?
        ORDER BY ordinal ASC
      `,
        )
        .all(submission.lab_id)
    ).map((r) => ({
      ordinal: r.ordinal,
      inputText: r.input_text,
      expectedOutput: r.expected_output,
    }));

    const result = await sandboxRunner({
      jobId: job.id,
      code: submission.code,
      tests,
      cpuLimitSec: submission.cpu_limit_sec,
      memoryLimitMb: submission.memory_limit_mb,
      sandboxConfig: config.sandbox,
    });

    const constraints = /** @type {Array<{
      constraint_code:string,
      rule_text:string
    }>} */ (
      db
        .prepare(
          `
        SELECT constraint_code, rule_text
        FROM lab_constraints
        WHERE lab_id = ?
        ORDER BY id ASC
      `,
        )
        .all(submission.lab_id)
    ).map((r) => ({
      id: r.constraint_code,
      text: r.rule_text,
    }));

    /** @type {ConstraintResult[]} */
    let verdicts = [];

    if (result.testVerdict === 'AC' && constraints.length > 0) {
      verdicts = await constraintChecker({
        jobId: job.id,
        submissionId: submission.id,
        labId: submission.lab_id,
        code: submission.code,
        constraints,
      });
    }

    db.exec('BEGIN IMMEDIATE');

    try {
      if (result.testVerdict === 'AC') {
        const upsert = db.prepare(`
          INSERT INTO constraint_verdicts (
            submission_id,
            constraint_code,
            verdict,
            source,
            unsure_reason,
            evidence_json,
            model_rationale
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(submission_id, constraint_code)
          DO UPDATE SET
            verdict = excluded.verdict,
            source = excluded.source,
            unsure_reason = excluded.unsure_reason,
            evidence_json = excluded.evidence_json,
            model_rationale = excluded.model_rationale
        `);

        for (const v of verdicts) {
          if (!constraints.some((c) => c.id === v.constraintCode)) {
            throw new Error('Unknown constraint code');
          }

          upsert.run(
            submission.id,
            v.constraintCode,
            v.verdict,
            v.source,
            v.unsureReason ?? null,
            JSON.stringify(v.evidence),
            v.rationale ?? null,
          );
        }
      } else {
        db.prepare(
          `
          DELETE FROM constraint_verdicts
          WHERE submission_id = ?
        `,
        ).run(submission.id);
      }

      db.prepare(
        `
        UPDATE submissions
        SET judge_status = 'done',
            test_verdict = ?,
            test_results_json = ?
        WHERE id = ?
      `,
      ).run(result.testVerdict, JSON.stringify(result.testResults), submission.id);

      db.prepare(
        `
        UPDATE judge_jobs
        SET status = 'done',
            locked_at = NULL,
            finished_at = datetime('now')
        WHERE id = ?
      `,
      ).run(job.id);

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return true;
  } catch (error) {
    db.prepare(
      `
      UPDATE judge_jobs
      SET status = 'failed', locked_at = NULL
      WHERE id = ?
    `,
    ).run(job.id);

    throw error;
  }
}

/**
 * Polls until stopped with AbortController.
 * @param {WorkerOptions & {
 *   signal?:AbortSignal,
 *   pollIntervalMs?:number
 * }} options
 */
export async function startWorkerLoop(options) {
  const { signal, pollIntervalMs = 1000 } = options;

  while (!signal?.aborted) {
    const processed = await processNextJob(options);

    if (processed) continue;

    await new Promise((resolve) => {
      const timer = setTimeout(resolve, pollIntervalMs);

      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve(undefined);
        },
        { once: true },
      );
    });
  }
}
