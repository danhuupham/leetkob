import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { send, problem, readJson } from './http.js';
import { needsReview } from './grades.js';

// A slice of LeeTKOB: the TA's review queue and publishing a lab's grades.
//
//   GET  /                            the page
//   GET  /api/labs/:labId/queue       staff of the lab's class, admin
//   POST /api/submissions/:id/review  staff of the lab's class, admin
//   POST /api/labs/:labId/publish     the contract is docs/contract/publish.md

const PAGE = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function createApp(db) {
  // Retain db reference on the closure so V8 GC never finalizes prepared statements
  // while the HTTP server is listening (fixes Node 22.13 ERR_INVALID_STATE in e2e).
  const activeDb = db;
  const q = {
    userByToken: activeDb.prepare('SELECT id, name, role FROM users WHERE token = ?'),
    lab: activeDb.prepare('SELECT id, class_id, published_at FROM labs WHERE id = ?'),
    staff: activeDb.prepare('SELECT 1 FROM class_staff WHERE class_id = ? AND user_id = ?'),
    enrolled: activeDb.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND user_id = ?'),
    byLab: activeDb.prepare(
      `SELECT s.id, u.name AS student, s.verdict, s.decision FROM submissions s
       JOIN users u ON u.id = s.student_id WHERE s.lab_id = ? ORDER BY s.id`,
    ),
    submission: activeDb.prepare(
      `SELECT s.id, l.class_id FROM submissions s
       JOIN labs l ON l.id = s.lab_id WHERE s.id = ?`,
    ),
    review: activeDb.prepare('UPDATE submissions SET decision = ? WHERE id = ?'),
    publish: activeDb.prepare(
      "UPDATE labs SET published_at = datetime('now') WHERE id = ? AND published_at IS NULL",
    ),
  };

  /** @type {Set<string>} */
  const usedIdempotencyKeys = new Set();

  /** @param {import('node:http').IncomingMessage} req */
  const whoIs = (req) => {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    return m
      ? /** @type {{ id: number, name: string, role: string } | undefined} */ (
          q.userByToken.get(m[1])
        )
      : undefined;
  };

  /**
   * @param {{ id: number, role: string }} me
   * @param {number} classId
   */
  const isStaff = (me, classId) => me.role === 'admin' || !!q.staff.get(classId, me.id);

  /**
   * @param {string | undefined} raw
   * @returns {number | null}
   */
  const parsePositiveInt = (raw) => {
    if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
    return Number(raw);
  };

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && p.length === 0) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }

    const me = whoIs(req);
    if (!me) {
      return problem(res, 401, 'unauthenticated', 'Sign in first', {
        detail: 'Valid Bearer token is required to call this endpoint',
      });
    }

    if (req.method === 'GET' && p[1] === 'labs' && p[3] === 'queue' && p.length === 4) {
      const labId = parsePositiveInt(p[2]);
      const lab =
        labId !== null
          ? /** @type {{ id: number, class_id: number, published_at: string | null } | undefined} */ (
              q.lab.get(labId)
            )
          : undefined;
      if (!lab || !isStaff(me, lab.class_id)) {
        return problem(res, 404, 'not-found', 'No such lab', {
          detail: 'Requested lab was not found',
        });
      }
      const items =
        /** @type {Array<{ id: number, student: string, verdict: string, decision: string | null }>} */ (
          q.byLab.all(lab.id)
        ).filter((s) => needsReview(s.verdict));
      return send(res, 200, {
        lab: lab.id,
        publishedAt: lab.published_at,
        items,
      });
    }

    if (req.method === 'POST' && p[1] === 'submissions' && p[3] === 'review' && p.length === 4) {
      const subId = parsePositiveInt(p[2]);
      const s =
        subId !== null
          ? /** @type {{ id: number, class_id: number } | undefined} */ (q.submission.get(subId))
          : undefined;
      if (!s || !isStaff(me, s.class_id)) {
        return problem(res, 404, 'not-found', 'No such submission', {
          detail: 'Requested submission was not found',
        });
      }
      const body = await readJson(req);
      if (!body || !['confirm', 'overturn'].includes(body.decision)) {
        return problem(res, 400, 'invalid-body', 'decision must be confirm or overturn', {
          detail: 'decision field must be either confirm or overturn',
        });
      }
      q.review.run(body.decision, s.id);
      return send(res, 200, { id: s.id, decision: body.decision });
    }

    if (req.method === 'POST' && p[1] === 'labs' && p[3] === 'publish' && p.length === 4) {
      const labId = parsePositiveInt(p[2]);
      const lab =
        labId !== null
          ? /** @type {{ id: number, class_id: number, published_at: string | null } | undefined} */ (
              q.lab.get(labId)
            )
          : undefined;
      if (!lab) {
        return problem(res, 404, 'not-found', 'No such lab', {
          detail: 'Requested lab was not found',
        });
      }

      // Check role and class-ownership BEFORE any state mutation (fixes refused-but-published bug).
      if (!isStaff(me, lab.class_id)) {
        if (q.enrolled.get(lab.class_id, me.id)) {
          return problem(res, 403, 'forbidden', 'Only staff of this class may publish', {
            detail: 'Students enrolled in this class may not publish lab grades',
          });
        }
        return problem(res, 404, 'not-found', 'No such lab', {
          detail: 'Requested lab was not found',
        });
      }

      // Validate optional Idempotency-Key header.
      const rawIdemKey = req.headers['idempotency-key'];
      const idemKey = Array.isArray(rawIdemKey) ? rawIdemKey[0] : rawIdemKey;
      if (idemKey !== undefined && (idemKey.trim().length === 0 || idemKey.length > 255)) {
        return problem(res, 400, 'validation', 'Invalid request', {
          detail: 'Idempotency-Key header must be 1 to 255 non-empty characters',
          errors: [
            { parameter: 'Idempotency-Key', detail: 'must be 1 to 255 non-empty characters' },
          ],
        });
      }

      // Validate optional request body.
      const body = await readJson(req);
      if (body === null) {
        return problem(res, 400, 'invalid-json', 'Malformed JSON', {
          detail: 'Request body is not valid JSON',
        });
      }
      if (body.__nonObjectJson) {
        return problem(res, 400, 'validation', 'Invalid request', {
          detail: 'Request body must be a JSON object or empty',
          errors: [{ pointer: '', detail: 'request body must be a JSON object or empty' }],
        });
      }

      // Refuse while any violation or unsure review is still pending a TA decision (FAQ-09, FAQ-12).
      const pending = /** @type {Array<{ verdict: string, decision: string | null }>} */ (
        q.byLab.all(lab.id)
      ).filter((s) => needsReview(s.verdict) && !s.decision).length;

      if (pending > 0) {
        return problem(res, 409, 'reviews-pending', 'Reviews pending', {
          detail: `${pending} submission(s) still require TA review before grades can be published`,
          pending,
        });
      }

      const scopedKey = idemKey ? `${lab.id}:${idemKey}` : null;
      const isReplay = scopedKey !== null && usedIdempotencyKeys.has(scopedKey);

      if (!lab.published_at) {
        q.publish.run(lab.id);
      }
      if (scopedKey) {
        usedIdempotencyKeys.add(scopedKey);
      }

      const updated = /** @type {{ published_at: string }} */ (q.lab.get(lab.id));
      return send(
        res,
        200,
        { lab: lab.id, publishedAt: updated.published_at },
        isReplay ? { 'idempotent-replayed': 'true' } : {},
      );
    }

    return problem(res, 404, 'not-found', 'No such route', {
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
  // Attach db to server instance so it stays rooted for the lifetime of the server.
  Object.defineProperty(server, '__db', { value: activeDb, enumerable: false });
  return server;
}
