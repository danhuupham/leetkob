import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from '../src/db.js';
import { config } from '../src/config.js';
import { startWorkerLoop } from '../src/worker.js';
import { runInSandbox } from '../src/sandbox/runner.js';
import { checkSubmissionConstraints } from '../src/checker/pipeline.js';

/**
 * Creates the durable constraintChecker callback backed by SQLite `labs` and `model_calls`.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{
 *   modelOff?: boolean,
 *   modelConfig?: Parameters<typeof checkSubmissionConstraints>[0]['modelConfig'],
 *   llmTransport?: Parameters<typeof checkSubmissionConstraints>[0]['llmTransport']
 * }} [options]
 * @returns {import('../src/worker.js').WorkerOptions['constraintChecker']}
 */
export function createWorkerConstraintChecker(db, options = {}) {
  const q = {
    getLab: db.prepare('SELECT statement, cost_spent_usd FROM labs WHERE id = ?'),
    insertCall: db.prepare(
      `INSERT INTO model_calls (
         submission_id, lab_id, provider_request_id, model_name,
         constraint_codes_json, sanitized_prompt, raw_response,
         input_tokens, output_tokens, latency_ms, cost_usd, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    addCost: db.prepare('UPDATE labs SET cost_spent_usd = cost_spent_usd + ? WHERE id = ?'),
  };

  return async ({ submissionId, labId, code, constraints }) => {
    const lab = /** @type {{ statement: string, cost_spent_usd: number } | undefined} */ (
      q.getLab.get(labId)
    );
    if (!lab) throw new Error('Worker lab not found');

    return checkSubmissionConstraints({
      statement: lab.statement,
      constraints,
      code,
      modelOff: options.modelOff ?? process.env.MODEL_OFF === '1',
      labCostSpentUsd: Number(lab.cost_spent_usd ?? 0),
      modelConfig: {
        modelName: config.modelName,
        modelApiKey: config.modelApiKey,
        modelTimeoutMs: config.modelTimeoutMs,
        modelMaxCostUsdPerLab: config.modelMaxCostUsdPerLab,
        ...options.modelConfig,
      },
      ...(options.llmTransport ? { llmTransport: options.llmTransport } : {}),
      callLogWriter: (entry) => {
        db.exec('BEGIN IMMEDIATE');
        try {
          q.insertCall.run(
            submissionId,
            labId,
            entry.providerRequestId,
            entry.model,
            JSON.stringify(entry.constraintCodes),
            entry.sanitizedPrompt,
            entry.rawResponse,
            entry.inputTokens,
            entry.outputTokens,
            entry.latencyMs,
            entry.costUsd,
            entry.status,
          );
          q.addCost.run(entry.costUsd, labId);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      },
    });
  };
}

const isMain =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  const db = open(config.databaseUrl, { migrateOnOpen: false, seed: false });
  const abort = new AbortController();

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => abort.abort());
  }

  console.log(`LeeTKOB worker started (db: ${config.databaseUrl}, model: ${config.modelName})`);

  try {
    await startWorkerLoop({
      db,
      signal: abort.signal,
      sandboxRunner: runInSandbox,
      onError: (err) => {
        console.error('Worker job error:', err);
      },
      constraintChecker: createWorkerConstraintChecker(db),
    });
  } finally {
    db.close();
  }
}
