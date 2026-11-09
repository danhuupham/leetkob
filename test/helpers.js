// Start the slice in-process on a fresh in-memory database.
import { open } from '../src/db.js';
import { createApp } from '../src/app.js';

export async function startApp() {
  const db = open();
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;

  function as(user) {
    const headers = user ? { authorization: `Bearer tok-${user.replace('_', '-')}` } : {};
    const call = async (method, path, body) => {
      const res = await fetch(base + path, {
        method,
        headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { status: res.status, type: res.headers.get('content-type'), body: json };
    };
    return { get: (path) => call('GET', path), post: (path, body) => call('POST', path, body) };
  }

  const publishedAt = (lab) =>
    db.prepare('SELECT published_at AS t FROM labs WHERE id = ?').get(lab).t;

  return { as, publishedAt, close: () => new Promise((r) => server.close(r)) };
}
