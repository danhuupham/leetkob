import { open, USERS } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { startWorkerLoop } from './worker.js';
import { runInSandbox } from './sandbox/runner.js';
import { checkSubmissionConstraints } from './checker/pipeline.js';

const db = open(config.databaseUrl);
const server = createApp(db).listen(config.port, () => {
  console.log(`LeeTKOB listening on http://localhost:${config.port} (db: ${config.databaseUrl})`);
  if (config.nodeEnv !== 'production') {
    console.log('dev tokens: ' + USERS.map((u) => `${u.name}=${u.token}`).join('  '));
  }
});

const workerAbort = new AbortController();
void startWorkerLoop({
  db,
  signal: workerAbort.signal,
  sandboxRunner: runInSandbox,
  constraintChecker: async ({ submissionId, labId, code, constraints }) => {
    const lab = /** @type {{ statement: string } | undefined} */ (
      db.prepare('SELECT statement FROM labs WHERE id = ?').get(labId)
    );
    if (!lab) throw new Error('Worker lab not found');

    return checkSubmissionConstraints({
      statement: lab.statement,
      constraints,
      code,
      modelOff: process.env.MODEL_OFF === '1',
      labCostSpentUsd: Number(
        /** @type {{ cost_spent_usd: number } | undefined} */ (
          db.prepare('SELECT cost_spent_usd FROM labs WHERE id = ?').get(labId)
        )?.cost_spent_usd ?? 0,
      ),
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
        db.prepare(
          `UPDATE labs
           SET cost_spent_usd = cost_spent_usd + ?
           WHERE id = ?`,
        ).run(entry.costUsd, labId);
      },
    });
  },
});

let shuttingDown = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    workerAbort.abort();
    server.close(() => {
      try {
        db.close();
      } catch {
        // Ignore if already closed.
      }
      process.exit(0);
    });
    server.closeIdleConnections?.();
  });
}
