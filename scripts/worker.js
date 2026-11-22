import { open } from '../src/db.js';
import { config } from '../src/config.js';
import { startWorkerLoop } from '../src/worker.js';
import { runInSandbox } from '../src/sandbox/runner.js';
import { checkSubmissionConstraints } from '../src/checker/pipeline.js';

const db = open(config.databaseUrl, { migrateOnOpen: false, seed: false });
const abort = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => abort.abort());
}

await startWorkerLoop({
  db,
  signal: abort.signal,
  sandboxRunner: runInSandbox,
  constraintChecker: async ({ submissionId, labId, code, constraints }) => {
    const lab = /** @type {{ statement: string } | undefined} */ (
      db.prepare('SELECT statement FROM labs WHERE id = ?').get(labId)
    );
    if (!lab) throw new Error('Worker lab not found');
    const spent = db.prepare('SELECT cost_spent_usd FROM labs WHERE id = ?').get(labId);
    return checkSubmissionConstraints({
      statement: lab.statement,
      constraints,
      code,
      modelOff: process.env.MODEL_OFF === '1',
      labCostSpentUsd: Number(spent?.cost_spent_usd ?? 0),
      modelConfig: {
        modelName: config.modelName,
        modelApiKey: config.modelApiKey,
        modelTimeoutMs: config.modelTimeoutMs,
        modelMaxCostUsdPerLab: config.modelMaxCostUsdPerLab,
      },
      callLogWriter: (entry) => {
        db.prepare(
          `INSERT INTO model_calls (
             submission_id, lab_id, provider_request_id, model_name,
             constraint_codes_json, sanitized_prompt, raw_response,
             input_tokens, output_tokens, latency_ms, cost_usd, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
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
        db.prepare('UPDATE labs SET cost_spent_usd = cost_spent_usd + ? WHERE id = ?').run(
          entry.costUsd,
          labId,
        );
      },
    });
  },
});
db.close();
