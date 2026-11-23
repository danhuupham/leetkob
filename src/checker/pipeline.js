// End-to-end constraint checker pipeline:
// 1. C++17 AST/syntax hard rules first (`D1` — zero model calls for ban-list constraints)
// 2. 1:1 line-preserving comment & student PII stripping (`sanitizeCode`)
// 3. `MODEL_OFF=1` & per-lab cost cap (`G4`) gates
// 4. Gemini 3 Flash Preview (`gemini-3-flash-preview`) semantic verification with timeout (`G3`), schema (`G1`), deduction strip (`G5`),
//    and exact source-line evidence verification (`G2`).

import { performance } from 'node:perf_hooks';
import { config } from '../config.js';
import { sanitizeCode } from './sanitize.js';
import { evaluateHardRule } from './hard-rules.js';
import { buildSemanticPrompt, callGeminiModel, computeGeminiCostUsd } from './llm-client.js';
import {
  isTimeoutError,
  parseAndValidateModelResponse,
  stripModelDeductions,
  validateAndMapEvidence,
  withModelTimeout,
} from './guardrails.js';

/**
 * @typedef {{
 *   id?: string,
 *   constraintCode?: string,
 *   constraint_code?: string,
 *   text?: string,
 *   ruleText?: string,
 *   rule_text?: string,
 *   deduction?: number
 * }} FlexibleConstraintInput
 *
 * @typedef {{
 *   rawText: string,
 *   providerRequestId?: string | null,
 *   model?: string,
 *   inputTokens?: number,
 *   outputTokens?: number
 * }} LlmTransportResponse
 *
 * @typedef {{
 *   providerRequestId: string | null,
 *   missingProviderRequestId: boolean,
 *   model: string,
 *   constraintCodes: string[],
 *   sanitizedPrompt: string,
 *   rawResponse: string | null,
 *   inputTokens: number,
 *   outputTokens: number,
 *   latencyMs: number,
 *   costUsd: number,
 *   status: 'ok' | 'timeout' | 'schema_error' | 'http_error' | 'cost_capped'
 * }} ModelCallLogEntry
 */

/**
 * Normalizes a constraint object from either `constraints.json` (`{ id, text }`)
 * or SQLite `lab_constraints` (`{ constraint_code, rule_text }`).
 *
 * @param {FlexibleConstraintInput} c
 * @returns {{ id: string, text: string }}
 */
function normalizeConstraint(c) {
  const id = String(c.id ?? c.constraintCode ?? c.constraint_code ?? '').trim();
  const text = String(c.text ?? c.ruleText ?? c.rule_text ?? '').trim();
  if (!id || !text) {
    throw new Error('Each constraint requires a non-empty id/constraintCode and text/ruleText');
  }
  return { id, text };
}

/**
 * Collects results in the exact order of `normalizedConstraints`.
 *
 * @param {Array<{ id: string, text: string }>} normalizedConstraints
 * @param {Map<string, import('./guardrails.js').CheckedConstraintResult>} resultsByCode
 * @returns {Array<import('./guardrails.js').CheckedConstraintResult>}
 */
function collectOrderedResults(normalizedConstraints, resultsByCode) {
  return normalizedConstraints.map((c) => {
    const r = resultsByCode.get(c.id);
    if (!r) throw new Error(`Missing result for ${c.id}`);
    return r;
  });
}

/**
 * Evaluates all declared lab constraints against an Accepted C++ submission.
 *
 * @param {{
 *   statement: string,
 *   constraints: FlexibleConstraintInput[],
 *   code: string,
 *   modelOff?: boolean,
 *   labCostSpentUsd?: number,
 *   modelConfig?: {
 *     modelName?: string,
 *     modelApiKey?: string,
 *     modelTimeoutMs?: number,
 *     modelMaxCostUsdPerLab?: number
 *   },
 *   llmTransport?: (args: {
 *     prompt: string,
 *     modelName: string,
 *     modelApiKey: string,
 *     signal: AbortSignal
 *   }) => Promise<LlmTransportResponse>,
 *   callLogWriter?: (entry: ModelCallLogEntry) => void | Promise<void>
 * }} params
 * @returns {Promise<Array<import('./guardrails.js').CheckedConstraintResult>>}
 */
export async function checkSubmissionConstraints(params) {
  const {
    statement,
    constraints,
    code,
    modelOff = process.env.MODEL_OFF === '1',
    labCostSpentUsd = 0,
    modelConfig,
    llmTransport,
    callLogWriter,
  } = params;

  const normalizedConstraints = constraints.map(normalizeConstraint);
  /** @type {Map<string, import('./guardrails.js').CheckedConstraintResult>} */
  const resultsByCode = new Map();
  /** @type {Array<{ id: string, text: string }>} */
  const semanticConstraints = [];

  // Step 1: Evaluate deterministic syntax-aware hard rules first (`D1`)
  for (const c of normalizedConstraints) {
    const hardRes = await evaluateHardRule(c, code);
    if (hardRes !== null) {
      resultsByCode.set(c.id, {
        constraintCode: c.id,
        verdict: hardRes.verdict,
        source: 'hard_rule',
        unsureReason: null,
        evidence: hardRes.evidence,
      });
    } else {
      semanticConstraints.push(c);
    }
  }

  // Step 2: If all constraints were decided by hard rules, make ZERO model calls
  if (semanticConstraints.length === 0) {
    return collectOrderedResults(normalizedConstraints, resultsByCode);
  }

  // Step 3: Offline switch `MODEL_OFF=1` — zero network calls, semantic constraints become `unsure`
  if (modelOff) {
    for (const c of semanticConstraints) {
      resultsByCode.set(c.id, {
        constraintCode: c.id,
        verdict: 'unsure',
        source: 'model',
        unsureReason: 'model-off',
        evidence: [],
      });
    }
    return collectOrderedResults(normalizedConstraints, resultsByCode);
  }

  const modelName = modelConfig?.modelName ?? config.modelName;
  const modelApiKey = modelConfig?.modelApiKey ?? config.modelApiKey;
  const modelTimeoutMs = modelConfig?.modelTimeoutMs ?? config.modelTimeoutMs;
  const maxCostUsd = modelConfig?.modelMaxCostUsdPerLab ?? config.modelMaxCostUsdPerLab;
  const semanticIds = semanticConstraints.map((c) => c.id);

  // Step 4: Per-lab cost cap (`G4`, `FAQ-09`) — if reached, skip model call and report `cost-cap-exceeded`
  if (labCostSpentUsd >= maxCostUsd) {
    if (callLogWriter) {
      await callLogWriter({
        providerRequestId: null,
        missingProviderRequestId: false,
        model: modelName,
        constraintCodes: semanticIds,
        sanitizedPrompt: '',
        rawResponse: null,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        costUsd: 0,
        status: 'cost_capped',
      });
    }
    for (const c of semanticConstraints) {
      resultsByCode.set(c.id, {
        constraintCode: c.id,
        verdict: 'unsure',
        source: 'model',
        unsureReason: 'cost-cap-exceeded',
        evidence: [],
      });
    }
    return collectOrderedResults(normalizedConstraints, resultsByCode);
  }

  // Step 5: Sanitize comments & student PII while preserving 1:1 line count
  const sanitized = sanitizeCode(code);
  const prompt = buildSemanticPrompt({
    statement,
    constraints: semanticConstraints,
    numberedPromptCode: sanitized.numberedPromptCode,
  });

  const transport =
    llmTransport ??
    (({ prompt: p, modelName: m, modelApiKey: k, signal }) =>
      callGeminiModel({ prompt: p, modelName: m, modelApiKey: k, signal }));

  // Step 6: Execute model call with wall-clock timeout guardrail (`G3`)
  const t0 = performance.now();
  /** @type {LlmTransportResponse} */
  let transportRes;
  try {
    transportRes = await withModelTimeout(
      (signal) =>
        transport({
          prompt,
          modelName,
          modelApiKey,
          signal,
        }),
      modelTimeoutMs,
    );
  } catch (err) {
    const latencyMs = Math.max(1, Math.round(performance.now() - t0));
    const timedOut = isTimeoutError(err);
    if (callLogWriter) {
      await callLogWriter({
        providerRequestId: null,
        missingProviderRequestId: false,
        model: modelName,
        constraintCodes: semanticIds,
        sanitizedPrompt: prompt,
        rawResponse: null,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        costUsd: 0,
        status: timedOut ? 'timeout' : 'http_error',
      });
    }
    for (const c of semanticConstraints) {
      resultsByCode.set(c.id, {
        constraintCode: c.id,
        verdict: 'unsure',
        source: 'model',
        unsureReason: timedOut ? 'model-timeout' : 'model-unsure',
        evidence: [],
      });
    }
    return collectOrderedResults(normalizedConstraints, resultsByCode);
  }

  const latencyMs = Math.max(1, Math.round(performance.now() - t0));
  const inputTokens = Number(transportRes.inputTokens ?? 0);
  const outputTokens = Number(transportRes.outputTokens ?? 0);
  const rawProviderRequestId =
    typeof transportRes.providerRequestId === 'string' ? transportRes.providerRequestId.trim() : '';
  const providerRequestId = rawProviderRequestId || null;
  const missingProviderRequestId = providerRequestId === null;
  const effectiveModel = transportRes.model || modelName;
  const costUsd = computeGeminiCostUsd(inputTokens, outputTokens, effectiveModel);

  // Step 7: Validate schema (`G1` + `G5`) and line-level evidence (`G2`)
  const parsed = parseAndValidateModelResponse(transportRes.rawText, semanticIds);

  if (callLogWriter) {
    await callLogWriter({
      providerRequestId,
      missingProviderRequestId,
      model: effectiveModel,
      constraintCodes: semanticIds,
      sanitizedPrompt: prompt,
      rawResponse: transportRes.rawText,
      inputTokens,
      outputTokens,
      latencyMs,
      costUsd,
      status: parsed.batchValid ? 'ok' : 'schema_error',
    });
  }

  for (const c of semanticConstraints) {
    const entry = parsed.byConstraint.get(c.id);
    if (!entry || entry.unsureReason === 'schema-invalid') {
      resultsByCode.set(c.id, {
        constraintCode: c.id,
        verdict: 'unsure',
        source: 'model',
        unsureReason: 'schema-invalid',
        evidence: [],
      });
      continue;
    }

    const mapped = validateAndMapEvidence(entry.verdict, entry.rawEvidence, sanitized);
    resultsByCode.set(
      c.id,
      stripModelDeductions(entry.rawFields, {
        constraintCode: c.id,
        verdict: mapped.verdict,
        source: 'model',
        unsureReason: mapped.unsureReason,
        evidence: mapped.evidence,
        ...(entry.rationale ? { rationale: entry.rationale } : {}),
      }),
    );
  }

  return collectOrderedResults(normalizedConstraints, resultsByCode);
}
