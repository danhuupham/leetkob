import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCliArgs, discoverDataset, runDatasetChecker } from '../../src/cli/check-dataset.js';
import {
  callGeminiModel,
  computeGeminiCostUsd,
  resetKeyCooldowns,
} from '../../src/checker/llm-client.js';

test('parseCliArgs parses all flags, --help/-h, and rejects invalid arguments', () => {
  const parsed = parseCliArgs([
    '--data',
    'eval/custom-cases',
    '--out',
    '-',
    '--call-log',
    'out/calls.jsonl',
    '--model',
    'gemini-3.8-flash',
    '--concurrency',
    '2',
    '--delay-ms',
    '500',
  ]);
  assert.equal(parsed.dataDir, 'eval/custom-cases');
  assert.equal(parsed.outPath, '-');
  assert.equal(parsed.callLogPath, 'out/calls.jsonl');
  assert.equal(parsed.modelName, 'gemini-3.8-flash');
  assert.equal(parsed.concurrency, 2);
  assert.equal(parsed.delayMs, 500);
  assert.equal(parsed.help, false);

  assert.equal(parseCliArgs(['--help']).help, true);
  assert.equal(parseCliArgs(['-h']).help, true);

  assert.throws(() => parseCliArgs(['--data', 'only-data']), /--concurrency/);
  assert.throws(() => parseCliArgs(['--unknown']), /Unknown CLI argument/);
  assert.throws(
    () => parseCliArgs(['--data', 'a', '--out', 'b', '--concurrency', '99']),
    /Invalid/,
  );
});

test('discoverDataset finds all custom-cases solutions cleanly without reading labels.jsonl', () => {
  const items = discoverDataset('eval/custom-cases');
  assert.equal(items.length, 6);
  assert.deepEqual(
    items.map((i) => i.solutionId),
    [
      'binary-search/s01',
      'binary-search/s02',
      'binary-search/s03',
      'sort-merge/s01',
      'sort-merge/s02',
      'sort-merge/s03',
    ],
  );
});

test('runDatasetChecker supports MODEL_OFF=1, --out file & stdout, fails fast without MODEL_API_KEY, and preserves modelName when modelConfig.modelName is undefined', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'leetkob-cli-test-'));
  try {
    const outFile = join(tmpDir, 'preds.jsonl');
    const summary = await runDatasetChecker({
      dataDir: 'eval/custom-cases',
      outPath: outFile,
      modelOff: true,
    });
    assert.equal(summary.solutionsCount, 6);
    assert.equal(summary.predictionsCount, 12);
    assert.equal(summary.callLogsCount, 0);
    const lines = readFileSync(outFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 12);

    // Fail fast when MODEL_OFF is false and MODEL_API_KEY is missing or comma-only
    const prevKey = process.env.MODEL_API_KEY;
    delete process.env.MODEL_API_KEY;
    try {
      for (const emptyKey of ['', ' , ']) {
        await assert.rejects(
          () =>
            runDatasetChecker({
              dataDir: 'eval/custom-cases',
              outPath: outFile,
              modelOff: false,
              modelConfig: { modelApiKey: emptyKey },
            }),
          /MODEL_API_KEY is required/,
        );
      }
    } finally {
      if (prevKey !== undefined) process.env.MODEL_API_KEY = prevKey;
    }

    // --out '-' writes valid JSONL lines directly to stdout
    const stdoutText = execFileSync(
      process.execPath,
      ['src/cli/check-dataset.js', '--data', 'eval/custom-cases', '--out', '-'],
      { env: { ...process.env, NODE_ENV: 'test', MODEL_OFF: '1' }, encoding: 'utf8' },
    );
    assert.equal(stdoutText.trim().split('\n').length, 12);

    // modelConfig with undefined modelName must NOT overwrite resolved modelName
    /** @type {string[]} */
    const seenModels = [];
    await runDatasetChecker({
      dataDir: 'eval/custom-cases',
      outPath: outFile,
      modelOff: false,
      modelName: 'gemini-3.8-flash',
      modelConfig: { modelName: undefined, modelTimeoutMs: 5000 },
      llmTransport: async ({ modelName }) => {
        seenModels.push(modelName);
        return {
          rawText: JSON.stringify({
            results: [{ constraint: 'C2', verdict: 'pass', evidence: [] }],
          }),
          providerRequestId: 'req-mock',
          model: modelName,
          inputTokens: 100,
          outputTokens: 20,
        };
      },
    });
    assert.equal(seenModels.length, 6);
    assert.ok(seenModels.every((m) => m === 'gemini-3.8-flash'));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('callGeminiModel rotates keys on daily 429 with expiring TTL cooldown, sleeps backoff on 503, and includes thoughtsTokenCount in outputTokens', async () => {
  resetKeyCooldowns();

  // 1. Daily quota 429 puts key1 in short TTL cooldown and immediately switches to key2;
  //    thoughtsTokenCount is added to candidatesTokenCount in outputTokens.
  /** @type {string[]} */
  const usedKeys = [];
  const res1 = await callGeminiModel({
    prompt: 'test',
    modelName: 'gemini-3-flash-preview',
    modelApiKey: 'key1,key2',
    signal: new AbortController().signal,
    dailyQuotaCooldownMs: 30,
    baseBackoffMs: 0,
    fetchImpl: async (_url, init) => {
      const k = /** @type {Record<string, string>} */ (init?.headers ?? {})['x-goog-api-key'];
      usedKeys.push(k);
      if (k === 'key1') {
        return {
          ok: false,
          status: 429,
          text: async () => '{"error":{"message":"GenerateRequestsPerDay exceeded"}}',
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'req-key2' },
        text: async () =>
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"results":[]}' }] } }],
            usageMetadata: {
              promptTokenCount: 500,
              candidatesTokenCount: 100,
              thoughtsTokenCount: 40,
            },
          }),
      };
    },
  });

  assert.deepEqual(usedKeys, ['key1', 'key2']);
  assert.equal(res1.providerRequestId, 'req-key2');
  assert.equal(res1.inputTokens, 500);
  assert.equal(res1.outputTokens, 140);
  assert.ok(
    Math.abs(
      computeGeminiCostUsd(500, 140, 'gemini-3-flash-preview') -
        (500 * 0.5 + 140 * 3.0) / 1_000_000,
    ) < 1e-12,
  );

  // Wait for key1's 30ms TTL cooldown to expire and confirm key1 is usable again
  await new Promise((r) => setTimeout(r, 45));
  const resAfterExpiry = await callGeminiModel({
    prompt: 'test-expiry',
    modelName: 'gemini-3.8-flash',
    modelApiKey: 'key1',
    signal: new AbortController().signal,
    baseBackoffMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'req-key1-recovered' },
      text: async () =>
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"results":[]}' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
    }),
  });
  assert.equal(resAfterExpiry.providerRequestId, 'req-key1-recovered');

  // 2. Service-wide 503 UNAVAILABLE MUST sleep backoff even when multiple keys are configured
  resetKeyCooldowns();
  let calls = 0;
  const t0 = Date.now();
  const res503 = await callGeminiModel({
    prompt: 'test-503',
    modelName: 'gemini-3.8-flash',
    modelApiKey: 'kA,kB',
    signal: new AbortController().signal,
    maxAttempts: 3,
    baseBackoffMs: 40,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) {
        return {
          ok: false,
          status: 503,
          text: async () => '{"error":{"status":"UNAVAILABLE"}}',
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'req-503-ok' },
        text: async () =>
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"results":[]}' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          }),
      };
    },
  });
  const elapsed = Date.now() - t0;
  assert.equal(calls, 3);
  assert.equal(res503.providerRequestId, 'req-503-ok');
  assert.ok(
    elapsed >= 100,
    `Expected 503 backoff sleep >= 100ms across 2 retries, got ${elapsed}ms`,
  );
});

test('callGeminiModel advances key cursor past cooled-down keys on 429 RPM and honors RetryInfo retryDelay', async () => {
  resetKeyCooldowns();

  // Put k1 into cooldown with RetryInfo.retryDelay overriding a long fallback cooldown
  await assert.rejects(
    () =>
      callGeminiModel({
        prompt: 'seed-k1-daily',
        modelName: 'gemini-3.8-flash',
        modelApiKey: 'k1',
        signal: new AbortController().signal,
        dailyQuotaCooldownMs: 60_000,
        baseBackoffMs: 0,
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          text: async () =>
            '{"error":{"message":"GenerateRequestsPerDay exceeded","details":[{"retryDelay":"0.04s"}]}}',
        }),
      }),
    /HTTP 429/,
  );

  // With k1 in cooldown and k2 hitting 429 RPM, cursor must advance directly to k3 (never repeat k2)
  /** @type {string[]} */
  const sequence = [];
  const resRpm = await callGeminiModel({
    prompt: 'test-rpm-cursor',
    modelName: 'gemini-3.8-flash',
    modelApiKey: 'k1,k2,k3',
    signal: new AbortController().signal,
    baseBackoffMs: 0,
    fetchImpl: async (_url, init) => {
      const k = /** @type {Record<string, string>} */ (init?.headers ?? {})['x-goog-api-key'];
      sequence.push(k);
      if (k === 'k2') {
        return {
          ok: false,
          status: 429,
          text: async () => '{"error":{"message":"Rate limit exceeded"}}',
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => `req-${k}` },
        text: async () =>
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"results":[]}' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          }),
      };
    },
  });
  assert.deepEqual(sequence, ['k2', 'k3']);
  assert.equal(resRpm.providerRequestId, 'req-k3');

  // After 60ms (> 0.04s retryDelay), k1 must automatically recover even though fallback was 60_000ms
  await new Promise((r) => setTimeout(r, 60));
  const resRecovered = await callGeminiModel({
    prompt: 'test-retry-delay-expiry',
    modelName: 'gemini-3.8-flash',
    modelApiKey: 'k1',
    signal: new AbortController().signal,
    baseBackoffMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'req-k1-after-retrydelay' },
      text: async () =>
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"results":[]}' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
    }),
  });
  assert.equal(resRecovered.providerRequestId, 'req-k1-after-retrydelay');
});
