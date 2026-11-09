// Start the slice in-process on a fresh in-memory database.
import { open } from '../src/db.js';
import { createApp } from '../src/app.js';

export async function startApp() {
  const db = open();
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const base = `http://localhost:${port}`;

  /**
   * @param {string | null} user
   */
  function as(user) {
    /** @type {Record<string, string>} */
    const baseHeaders = user ? { authorization: `Bearer tok-${user.replace('_', '-')}` } : {};

    /**
     * @param {string} method
     * @param {string} path
     * @param {unknown} [body]
     * @param {Record<string, string>} [extraHeaders]
     * @param {boolean} [rawBody]
     */
    const call = async (method, path, body, extraHeaders = {}, rawBody = false) => {
      /** @type {Record<string, string>} */
      const headers = { ...baseHeaders, ...extraHeaders };
      let payload;
      if (body !== undefined) {
        if (!headers['content-type']) headers['content-type'] = 'application/json';
        payload = rawBody ? String(body) : JSON.stringify(body);
      }
      const res = await fetch(base + path, {
        method,
        headers,
        body: payload,
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return {
        status: res.status,
        type: res.headers.get('content-type') || '',
        headers: res.headers,
        body: json,
      };
    };

    return {
      /** @param {string} path */
      get: (path) => call('GET', path),
      /**
       * @param {string} path
       * @param {unknown} [body]
       * @param {Record<string, string>} [extraHeaders]
       */
      post: (path, body, extraHeaders) => call('POST', path, body, extraHeaders, false),
      /**
       * @param {string} path
       * @param {string} raw
       * @param {Record<string, string>} [extraHeaders]
       */
      postRaw: (path, raw, extraHeaders) => call('POST', path, raw, extraHeaders, true),
    };
  }

  /**
   * @param {number} lab
   * @returns {string | null}
   */
  const publishedAt = (lab) => {
    const row = /** @type {{ t: string | null } | undefined} */ (
      db.prepare('SELECT published_at AS t FROM labs WHERE id = ?').get(lab)
    );
    return row ? row.t : null;
  };

  const breakDb = () => {
    db.close();
  };

  return {
    as,
    publishedAt,
    breakDb,
    close: () => new Promise((r) => server.close(() => r(undefined))),
  };
}
