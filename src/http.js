// No framework on purpose: every status code in the contract is visible in src/app.js.

const PROBLEM_BASE = 'https://leetkob.example/problems/';

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [extraHeaders]
 */
export function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(body));
}

/**
 * RFC 9457 problem details, the same error model as session 5.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} slug
 * @param {string} title
 * @param {Record<string, unknown>} [extra]
 */
export function problem(res, status, slug, title, extra = {}) {
  const detail = typeof extra.detail === 'string' ? extra.detail : title;
  res.writeHead(status, { 'content-type': 'application/problem+json' });
  res.end(JSON.stringify({ type: PROBLEM_BASE + slug, title, status, detail, ...extra }));
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, any> | null>}
 */
export async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { __nonObjectJson: true };
    }
    return parsed;
  } catch {
    return null;
  }
}
