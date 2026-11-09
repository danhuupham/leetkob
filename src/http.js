// No framework on purpose: every status code in the contract is visible in src/app.js.

const PROBLEM_BASE = 'https://leetkob.example/problems/';

export function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// RFC 9457 problem details, the same error model as session 5.
export function problem(res, status, slug, title, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/problem+json' });
  res.end(JSON.stringify({ type: PROBLEM_BASE + slug, title, status, ...extra }));
}

export async function readJson(req) {
  const legacyLimit = 1024;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
