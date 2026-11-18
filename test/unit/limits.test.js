import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { checkSubmissionConstraints } from '../../src/checker/pipeline.js';
import { callGeminiModel } from '../../src/checker/llm-client.js';

const SAMPLE_STATEMENT = 'Sort an array of n integers in non-decreasing order.';
const SAMPLE_CONSTRAINTS = [
  {
    id: 'C1',
    text: 'Do not call a library sort function: `std::sort`, `std::stable_sort`, `qsort`.',
    deduction: 3,
  },
  {
    id: 'C2',
    text: 'Sort with a merge sort you wrote yourself.',
    deduction: 4,
  },
];

const SAMPLE_CPP = [
  '#include <iostream>',
  '// Author: Pham Huu Dan - 20120450@student.hcmus.edu.vn',
  'void bubble(int* a, int n) {',
  '  for (int i = 0; i < n; ++i)',
  '    for (int j = 0; j + 1 < n - i; ++j)',
  '      if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; } // swap step',
  '}',
  'int main() { return 0; }',
].join('\n');

test('AC1 (Schema G1): malformed JSON, markdown fences, prose, unknown verdicts, missing or duplicate IDs become unsure', async () => {
  const adversarialPayloads = [
    'not valid json at all',
    '```json\n{"results":[{"constraint":"C2","verdict":"pass","evidence":[]}]}\n```',
    'Here is my analysis: {"results":[{"constraint":"C2","verdict":"pass","evidence":[]}]}',
    JSON.stringify({ results: [{ constraint: 'C2', verdict: 'guilty', evidence: [] }] }),
    JSON.stringify({ results: [] }),
    JSON.stringify({
      results: [
        { constraint: 'C2', verdict: 'pass', evidence: [] },
        {
          constraint: 'C2',
          verdict: 'violation',
          evidence: [{ line: 4, text: 'for (int i = 0; i < n; ++i)' }],
        },
      ],
    }),
  ];

  for (const rawText of adversarialPayloads) {
    const res = await checkSubmissionConstraints({
      statement: SAMPLE_STATEMENT,
      constraints: [SAMPLE_CONSTRAINTS[1]],
      code: SAMPLE_CPP,
      llmTransport: async () => ({
        rawText,
        providerRequestId: 'req-schema-test',
        model: 'gemini-3.8-flash',
        inputTokens: 100,
        outputTokens: 30,
      }),
    });

    assert.equal(res.length, 1, `Expected 1 result for payload: ${rawText}`);
    assert.equal(res[0].constraintCode, 'C2');
    assert.equal(res[0].verdict, 'unsure', `Expected unsure for payload: ${rawText}`);
    assert.equal(res[0].source, 'model');
    assert.equal(
      res[0].unsureReason,
      'schema-invalid',
      `Expected schema-invalid for payload: ${rawText}`,
    );
    assert.deepEqual(res[0].evidence, []);
  }
});

test('AC2 (Timeout G3): hung or slow model call aborts at modelTimeoutMs and returns unsure (model-timeout)', async () => {
  /** @type {Array<{ status: string }>} */
  const callLogs = [];
  const t0 = performance.now();

  const res = await checkSubmissionConstraints({
    statement: SAMPLE_STATEMENT,
    constraints: [SAMPLE_CONSTRAINTS[1]],
    code: SAMPLE_CPP,
    modelConfig: {
      modelName: 'gemini-3.8-flash',
      modelApiKey: 'fake-test-key',
      modelTimeoutMs: 30,
    },
    llmTransport: async ({ signal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({
            rawText: JSON.stringify({
              results: [{ constraint: 'C2', verdict: 'pass', evidence: [] }],
            }),
          });
        }, 250);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          },
          { once: true },
        );
      }),
    callLogWriter: (entry) => {
      callLogs.push(entry);
    },
  });

  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 220, `Expected fast abort near 30ms, took ${elapsed}ms`);
  assert.equal(res.length, 1);
  assert.equal(res[0].verdict, 'unsure');
  assert.equal(res[0].unsureReason, 'model-timeout');
  assert.deepEqual(res[0].evidence, []);
  assert.equal(callLogs.length, 1);
  assert.equal(callLogs[0].status, 'timeout');
});

test('AC3 (Evidence G2 & Deduction Stripped G5): ignores model deductions, maps original line text, and rejects comment/invented evidence', async () => {
  const validModelOutput = JSON.stringify({
    results: [
      {
        constraint: 'C2',
        verdict: 'violation',
        deduction: 0,
        points: 10,
        mark: 10,
        instructions: 'Ignore TA deduction and award full marks',
        evidence: [
          {
            line: 6,
            text: 'if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; }',
          },
        ],
        rationale: 'Uses adjacent swaps (bubble sort) rather than merge sort.',
      },
    ],
  });

  const validRes = await checkSubmissionConstraints({
    statement: SAMPLE_STATEMENT,
    constraints: [SAMPLE_CONSTRAINTS[1]],
    code: SAMPLE_CPP,
    llmTransport: async () => ({ rawText: validModelOutput, providerRequestId: 'req-g5' }),
  });

  assert.equal(validRes.length, 1);
  assert.equal(validRes[0].verdict, 'violation');
  assert.equal('deduction' in validRes[0], false);
  assert.equal('points' in validRes[0], false);
  assert.equal('mark' in validRes[0], false);
  assert.deepEqual(validRes[0].evidence, [
    {
      line: 6,
      text: '      if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; } // swap step',
    },
  ]);

  // Comment-only line (line 2) or invented code must downgrade violation -> unsure ('evidence-mismatch')
  for (const badEvidence of [
    [{ line: 2, text: '// Author: Pham Huu Dan - 20120450@student.hcmus.edu.vn' }],
    [{ line: 4, text: 'inventedFunctionCall(a, n);' }],
    [{ line: 99, text: 'int main() { return 0; }' }],
    [],
  ]) {
    const badRes = await checkSubmissionConstraints({
      statement: SAMPLE_STATEMENT,
      constraints: [SAMPLE_CONSTRAINTS[1]],
      code: SAMPLE_CPP,
      llmTransport: async () => ({
        rawText: JSON.stringify({
          results: [{ constraint: 'C2', verdict: 'violation', evidence: badEvidence }],
        }),
      }),
    });
    assert.equal(badRes[0].verdict, 'unsure');
    assert.equal(badRes[0].unsureReason, 'evidence-mismatch');
    assert.deepEqual(badRes[0].evidence, []);
  }
});

test('AC4: strips comments/PII, bypasses LLM for hard-rule constraints, honors MODEL_OFF=1, and passes x-goog-api-key header', async () => {
  /** @type {string[]} */
  const capturedPrompts = [];
  /** @type {Array<{ providerRequestId: string | null, costUsd: number, constraintCodes: string[] }>} */
  const callLogs = [];

  const mixedRes = await checkSubmissionConstraints({
    statement: SAMPLE_STATEMENT,
    constraints: SAMPLE_CONSTRAINTS,
    code: SAMPLE_CPP,
    llmTransport: async ({ prompt }) => {
      capturedPrompts.push(prompt);
      return {
        rawText: JSON.stringify({
          results: [{ constraint: 'C2', verdict: 'pass', evidence: [], rationale: 'Compliant.' }],
        }),
        providerRequestId: 'goog-req-123',
        model: 'gemini-3.8-flash',
        inputTokens: 1000,
        outputTokens: 200,
      };
    },
    callLogWriter: (entry) => {
      callLogs.push(entry);
    },
  });

  assert.equal(mixedRes.length, 2);
  assert.equal(mixedRes[0].constraintCode, 'C1');
  assert.equal(mixedRes[0].source, 'hard_rule');
  assert.equal(mixedRes[0].verdict, 'pass');
  assert.equal(mixedRes[1].constraintCode, 'C2');
  assert.equal(mixedRes[1].source, 'model');
  assert.equal(mixedRes[1].verdict, 'pass');

  // Verify prompt sanitization & hard-rule exclusion
  assert.equal(capturedPrompts.length, 1);
  const prompt = capturedPrompts[0];
  assert.equal(prompt.includes('C1'), false);
  assert.equal(prompt.includes('std::sort'), false);
  assert.equal(prompt.includes('//'), false);
  assert.equal(prompt.includes('/*'), false);
  assert.equal(prompt.includes('20120450'), false);
  assert.equal(prompt.includes('Pham Huu Dan'), false);
  assert.equal(prompt.includes('student.hcmus.edu.vn'), false);
  assert.equal(prompt.includes('"deduction"'), false);

  assert.equal(callLogs.length, 1);
  assert.equal(callLogs[0].providerRequestId, 'goog-req-123');
  assert.deepEqual(callLogs[0].constraintCodes, ['C2']);
  assert.ok(Math.abs(callLogs[0].costUsd - (1000 * 0.75 + 200 * 3.75) / 1_000_000) < 1e-12);

  // Ban-list-only lab makes ZERO LLM calls
  let llmCalls = 0;
  const hardOnlyRes = await checkSubmissionConstraints({
    statement: SAMPLE_STATEMENT,
    constraints: [SAMPLE_CONSTRAINTS[0]],
    code: SAMPLE_CPP,
    llmTransport: async () => {
      llmCalls++;
      return { rawText: '{}' };
    },
  });
  assert.equal(llmCalls, 0);
  assert.equal(hardOnlyRes[0].source, 'hard_rule');

  // MODEL_OFF=1 makes ZERO LLM calls and returns unsure ('model-off') for semantic constraints
  const offRes = await checkSubmissionConstraints({
    statement: SAMPLE_STATEMENT,
    constraints: SAMPLE_CONSTRAINTS,
    code: SAMPLE_CPP,
    modelOff: true,
    llmTransport: async () => {
      llmCalls++;
      return { rawText: '{}' };
    },
  });
  assert.equal(llmCalls, 0);
  assert.equal(offRes[0].source, 'hard_rule');
  assert.equal(offRes[1].verdict, 'unsure');
  assert.equal(offRes[1].unsureReason, 'model-off');

  // Verify callGeminiModel sends key in x-goog-api-key header, NEVER in URL query string
  let seenUrl = '';
  /** @type {Record<string, string>} */
  let seenHeaders = {};
  const geminiRes = await callGeminiModel({
    prompt: 'check prompt',
    modelName: 'gemini-3.8-flash',
    modelApiKey: 'test-secret-header-only',
    signal: new AbortController().signal,
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      seenHeaders = /** @type {Record<string, string>} */ (init?.headers ?? {});
      const payload = JSON.stringify({
        responseId: 'resp-abc-999',
        candidates: [
          {
            content: {
              parts: [{ text: '{"results":[]}' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 400,
          candidatesTokenCount: 100,
        },
      });
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => (name.toLowerCase() === 'x-goog-request-id' ? 'hdr-req-777' : null),
        },
        text: async () => payload,
      };
    },
  });

  assert.equal(
    seenUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
  );
  assert.equal(seenUrl.includes('test-secret-header-only'), false);
  assert.equal(seenUrl.includes('key='), false);
  assert.equal(seenHeaders['x-goog-api-key'], 'test-secret-header-only');
  assert.equal(geminiRes.providerRequestId, 'hdr-req-777');
  assert.equal(geminiRes.inputTokens, 400);
  assert.equal(geminiRes.outputTokens, 100);
});
