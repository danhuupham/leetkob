// Zero-framework HTTP helpers, route matching, and safe static asset serving.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const PROBLEM_BASE = 'https://leetkob.example/problems/';

/** @type {Record<string, string>} */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * @typedef {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, params: Record<string, string>) => Promise<void> | void} RouteHandler
 * @typedef {[string, string, RouteHandler]} RouteEntry
 */

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
 * RFC 9457 problem details response.
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
  let bytes = 0;
  let tooLarge = false;
  const maxBytes = 1_048_576;
  for await (const chunk of req) {
    if (tooLarge) continue;
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += part.length;
    if (bytes > maxBytes) {
      tooLarge = true;
      raw = '';
      continue;
    }
    raw += part.toString('utf8');
  }
  if (tooLarge) return { __payloadTooLarge: true };
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

/**
 * Matches a request method and URL pathname against registered `[method, pattern, handler]` entries.
 * Runs before authentication so unknown `/api/*` routes return `404 not-found` per contract §4.3.
 *
 * @param {string | undefined} method
 * @param {string} pathname
 * @param {RouteEntry[]} routes
 * @returns {{ handler: RouteHandler, params: Record<string, string> } | null}
 */
export function matchRoute(method, pathname, routes) {
  const actual = pathname.split('/').filter(Boolean);
  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue;
    const expected = pattern.split('/').filter(Boolean);
    if (expected.length !== actual.length) continue;

    /** @type {Record<string, string>} */
    const params = {};
    let matched = true;
    for (let i = 0; i < expected.length; i += 1) {
      const seg = expected[i];
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(actual[i]);
      } else if (seg !== actual[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler, params };
  }
  return null;
}

/**
 * Safely serves static files from `publicDir`, blocking path traversal outside `publicDir`.
 *
 * @param {string} publicDir
 * @param {string} pathname
 * @param {import('node:http').ServerResponse} res
 * @param {boolean} [headOnly]
 * @returns {boolean}
 */
export function serveStatic(publicDir, pathname, res, headOnly = false) {
  const root = resolve(publicDir);
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + sep)) return false;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return false;

  const contentType = MIME_TYPES[extname(candidate)] || 'application/octet-stream';
  const body = readFileSync(candidate);
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': String(body.length),
  });
  res.end(headOnly ? undefined : body);
  return true;
}
