import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { matchRoute, problem, serveStatic } from './http.js';
import { createAuth } from './auth.js';
import { createHealthRoutes } from './routes/health.js';
import { createQueueRoutes } from './routes/queue.js';
import { createPublishRoutes } from './routes/publish.js';
import { createLabRoutes } from './routes/labs.js';
import { config } from './config.js';
import { createSubmissionRoutes } from './routes/submissions.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

/**
 * Creates the LeeTKOB HTTP application server wired to the given SQLite connection.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function createApp(db) {
  void config;
  // Retain db reference on the closure and server instance so V8 GC never finalizes
  // prepared statements while the HTTP server is listening (Node 22.13+ lifecycle rule).
  const activeDb = db;
  const auth = createAuth(activeDb);
  const routes = [
    ...createHealthRoutes(activeDb),
    ...createQueueRoutes(activeDb, auth),
    ...createPublishRoutes(activeDb, auth),
    ...createLabRoutes(activeDb, auth),
    ...createSubmissionRoutes(activeDb, auth),
  ];

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://x');

    const matched = matchRoute(req.method, url.pathname, routes);
    if (matched) {
      return matched.handler(req, res, matched.params);
    }

    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      if (serveStatic(PUBLIC_DIR, url.pathname, res)) return;
    }

    return problem(res, 404, 'not-found', 'No such lab', {
      detail: 'Requested endpoint was not found',
    });
  }

  const server = createServer((req, res) =>
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) {
        problem(res, 500, 'internal', 'Something went wrong', {
          detail: 'Something went wrong',
        });
      }
    }),
  );

  Object.defineProperty(server, '__db', { value: activeDb, enumerable: false });
  return server;
}
