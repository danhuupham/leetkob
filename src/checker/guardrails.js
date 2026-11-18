// Model output guardrails (`G1` Schema, `G2` Evidence Mapping, `G3` Timeout, `G5` No Model Deduction).
// Modularized so each guardrail can be tested and extended independently across PA#3 and PA#4.

const VALID_VERDICTS = new Set(['pass', 'violation', 'unsure']);

/**
 * @typedef {'model-unsure' | 'schema-invalid' | 'evidence-mismatch' | 'model-timeout' | 'cost-cap-exceeded' | 'model-off'} UnsureReason
 *
 * @typedef {{
 *   constraintCode: string,
 *   verdict: 'pass' | 'violation' | 'unsure',
 *   source: 'hard_rule' | 'model',
 *   unsureReason: UnsureReason | null,
 *   evidence: Array<{ line: number, text: string }>,
 *   rationale?: string
 * }} CheckedConstraintResult
 *
 * @typedef {{
 *   verdict: 'pass' | 'violation' | 'unsure',
 *   unsureReason: 'model-unsure' | 'schema-invalid' | null,
 *   rawEvidence: Array<{ line: number, text: string }>,
 *   rawFields: Record<string, unknown>,
 *   rationale?: string
 * }} ParsedConstraintEntry
 */

/**
 * Normalizes horizontal whitespace for single-line C++ evidence comparison.
 *
 * @param {string} line
 * @returns {string}
 */
function normalizeCodeLine(line) {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * `G5`: Strips any `deduction`, `points`, `mark`, or prompt-injected grading fields from a model item,
 * retaining strictly the verified `CheckedConstraintResult` fields.
 *
 * @param {Record<string, unknown>} rawFields
 * @param {CheckedConstraintResult} baseResult
 * @returns {CheckedConstraintResult}
 */
export function stripModelDeductions(rawFields, baseResult) {
  /** @type {Record<string, unknown>} */
  const merged = { ...rawFields, ...baseResult };
  delete merged.constraint;
  delete merged.deduction;
  delete merged.points;
  delete merged.mark;
  delete merged.score;
  delete merged.grade;
  delete merged.instructions;
  return /** @type {CheckedConstraintResult} */ (merged);
}

/**
 * `G1` + `G5`: Strictly parses and validates raw LLM JSON output against the expected schema.
 * Rejects markdown code fences (` ```json `), prose wrappers, malformed JSON, unknown verdicts,
 * invalid evidence shapes, and missing or duplicate constraint IDs.
 *
 * @param {string} rawText
 * @param {string[]} expectedConstraintIds
 * @returns {{ batchValid: boolean, byConstraint: Map<string, ParsedConstraintEntry> }}
 */
export function parseAndValidateModelResponse(rawText, expectedConstraintIds) {
  const expectedSet = new Set(expectedConstraintIds);
  /** @type {Map<string, ParsedConstraintEntry>} */
  const byConstraint = new Map();

  /** @returns {{ batchValid: boolean, byConstraint: Map<string, ParsedConstraintEntry> }} */
  const failAll = () => {
    for (const id of expectedConstraintIds) {
      byConstraint.set(id, {
        verdict: 'unsure',
        unsureReason: 'schema-invalid',
        rawEvidence: [],
        rawFields: {},
      });
    }
    return { batchValid: false, byConstraint };
  };

  if (typeof rawText !== 'string') return failAll();
  const trimmed = rawText.trim();
  if (
    trimmed.length === 0 ||
    trimmed.includes('```') ||
    !trimmed.startsWith('{') ||
    !trimmed.endsWith('}')
  ) {
    return failAll();
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return failAll();
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return failAll();
  }

  const root = /** @type {Record<string, unknown>} */ (parsed);
  if (!Array.isArray(root.results)) {
    return failAll();
  }

  /** @type {Set<string>} */
  const seenIds = new Set();
  /** @type {Set<string>} */
  const invalidIds = new Set();
  let batchValid = true;

  for (const item of root.results) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return failAll();
    }
    const clean = /** @type {Record<string, unknown>} */ (item);
    if (typeof clean.constraint !== 'string' || !expectedSet.has(clean.constraint)) {
      return failAll();
    }

    const cid = clean.constraint;
    if (seenIds.has(cid)) {
      invalidIds.add(cid);
      batchValid = false;
      continue;
    }
    seenIds.add(cid);

    if (typeof clean.verdict !== 'string' || !VALID_VERDICTS.has(clean.verdict)) {
      invalidIds.add(cid);
      batchValid = false;
      continue;
    }

    if (!Array.isArray(clean.evidence)) {
      invalidIds.add(cid);
      batchValid = false;
      continue;
    }

    /** @type {Array<{ line: number, text: string }>} */
    const rawEvidence = [];
    let evidenceShapeOk = true;
    for (const ev of clean.evidence) {
      if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) {
        evidenceShapeOk = false;
        break;
      }
      const evRec = /** @type {Record<string, unknown>} */ (ev);
      if (
        typeof evRec.line !== 'number' ||
        !Number.isInteger(evRec.line) ||
        evRec.line < 1 ||
        typeof evRec.text !== 'string'
      ) {
        evidenceShapeOk = false;
        break;
      }
      rawEvidence.push({ line: evRec.line, text: evRec.text });
    }

    if (!evidenceShapeOk) {
      invalidIds.add(cid);
      batchValid = false;
      continue;
    }

    const verdict = /** @type {'pass' | 'violation' | 'unsure'} */ (clean.verdict);
    byConstraint.set(cid, {
      verdict,
      unsureReason: verdict === 'unsure' ? 'model-unsure' : null,
      rawEvidence,
      rawFields: clean,
      ...(typeof clean.rationale === 'string' && clean.rationale.trim().length > 0
        ? { rationale: clean.rationale.trim() }
        : {}),
    });
  }

  for (const id of expectedConstraintIds) {
    if (!byConstraint.has(id) || invalidIds.has(id)) {
      batchValid = false;
      byConstraint.set(id, {
        verdict: 'unsure',
        unsureReason: 'schema-invalid',
        rawEvidence: [],
        rawFields: {},
      });
    }
  }

  return { batchValid, byConstraint };
}

/**
 * `G2`: Verifies that every cited violation evidence line exists in the non-comment source code,
 * matches that line's normalized code, and maps `text` back to `sanitized.originalLines[line - 1]`.
 *
 * @param {'pass' | 'violation' | 'unsure'} verdict
 * @param {Array<{ line: number, text: string }>} rawEvidence
 * @param {import('./sanitize.js').SanitizedSource} sanitized
 * @returns {{
 *   verdict: 'pass' | 'violation' | 'unsure',
 *   unsureReason: 'model-unsure' | 'evidence-mismatch' | null,
 *   evidence: Array<{ line: number, text: string }>
 * }}
 */
export function validateAndMapEvidence(verdict, rawEvidence, sanitized) {
  if (verdict === 'pass') {
    return { verdict: 'pass', unsureReason: null, evidence: [] };
  }
  if (verdict === 'unsure') {
    return { verdict: 'unsure', unsureReason: 'model-unsure', evidence: [] };
  }

  if (rawEvidence.length === 0) {
    return { verdict: 'unsure', unsureReason: 'evidence-mismatch', evidence: [] };
  }

  /** @type {Set<number>} */
  const validLines = new Set();

  for (const item of rawEvidence) {
    const { line, text } = item;
    if (!Number.isInteger(line) || line < 1 || line > sanitized.originalLines.length) {
      return { verdict: 'unsure', unsureReason: 'evidence-mismatch', evidence: [] };
    }

    const strippedLine = sanitized.strippedLines[line - 1];
    const originalLine = sanitized.originalLines[line - 1];

    // Line must contain real code after comment stripping (rejects comment-only & blank lines)
    if (strippedLine.trim().length === 0) {
      return { verdict: 'unsure', unsureReason: 'evidence-mismatch', evidence: [] };
    }

    const withoutLinePrefix = text.replace(new RegExp(`^\\s*${line}\\s*:\\s*`), '');
    const normCited = normalizeCodeLine(withoutLinePrefix);
    const normStripped = normalizeCodeLine(strippedLine);
    const normOriginal = normalizeCodeLine(originalLine);

    if (normCited.length === 0 || (normCited !== normStripped && normCited !== normOriginal)) {
      return { verdict: 'unsure', unsureReason: 'evidence-mismatch', evidence: [] };
    }

    validLines.add(line);
  }

  const evidence = Array.from(validLines)
    .sort((a, b) => a - b)
    .map((line) => ({
      line,
      text: sanitized.originalLines[line - 1],
    }));

  return { verdict: 'violation', unsureReason: null, evidence };
}

/**
 * `G3`: Identifies AbortError / TimeoutError thrown when an LLM request exceeds `modelTimeoutMs`.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTimeoutError(err) {
  if (!err || typeof err !== 'object') return false;
  const e = /** @type {{ name?: unknown, code?: unknown }} */ (err);
  return e.name === 'TimeoutError' || e.name === 'AbortError' || e.code === 'ABORT_ERR';
}

/**
 * `G3`: Executes an async model call under a strict wall-clock timeout, aborting `signal`
 * and rejecting with `TimeoutError` even if the underlying transport ignores abort signals.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} fn
 * @param {number} timeoutMs
 * @returns {Promise<T>}
 */
export async function withModelTimeout(fn, timeoutMs) {
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = Object.assign(new Error(`Model request timed out after ${timeoutMs}ms`), {
        name: 'TimeoutError',
      });
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });

  try {
    return /** @type {T} */ (await Promise.race([fn(controller.signal), timeoutPromise]));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
