// Shared Bearer-token authentication, class-ownership checks, and ID parsing.
import { problem } from './http.js';

/**
 * @typedef {{ id: number, name: string, role: string }} AuthUser
 */

/**
 * Parses a positive base-10 integer path parameter (`/^[1-9]\d*$/`).
 * @param {string | undefined} raw
 * @returns {number | null}
 */
export function parsePositiveInt(raw) {
  if (!raw || !/^[1-9]\d*$/u.test(raw)) return null;
  return Number(raw);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function createAuth(db) {
  const q = {
    userByToken: db.prepare('SELECT id, name, role FROM users WHERE token = ?'),
    staff: db.prepare('SELECT 1 FROM class_staff WHERE class_id = ? AND user_id = ?'),
    enrolled: db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND user_id = ?'),
  };

  /**
   * @param {import('node:http').IncomingMessage} req
   * @returns {AuthUser | undefined}
   */
  const whoIs = (req) => {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    return m ? /** @type {AuthUser | undefined} */ (q.userByToken.get(m[1])) : undefined;
  };

  /**
   * Authenticates caller or writes `401 unauthenticated` RFC 9457 response.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @returns {AuthUser | null}
   */
  const requireAuth = (req, res) => {
    const me = whoIs(req);
    if (!me) {
      problem(res, 401, 'unauthenticated', 'Sign in first', {
        detail: 'Valid Bearer token is required to call this endpoint',
      });
      return null;
    }
    return me;
  };

  /**
   * @param {AuthUser} me
   * @param {number} classId
   */
  const isStaff = (me, classId) => me.role === 'admin' || Boolean(q.staff.get(classId, me.id));

  /**
   * @param {AuthUser} me
   * @param {number} classId
   */
  const isEnrolled = (me, classId) => Boolean(q.enrolled.get(classId, me.id));

  return { whoIs, requireAuth, isStaff, isEnrolled };
}
