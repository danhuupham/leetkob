// Container liveness & database readiness route (Session 8 HEALTHCHECK).
import { send } from '../http.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createHealthRoutes(db) {
  const ping = db.prepare('SELECT 1 AS ok');

  return [
    [
      'GET',
      '/health',
      (_req, res) => {
        ping.get();
        return send(res, 200, { status: 'ok' });
      },
    ],
  ];
}
