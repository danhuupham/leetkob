import { send } from '../http.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createMeRoutes(db, auth) {
  const q = {
    adminClasses: db.prepare('SELECT id FROM classes ORDER BY id'),
    taClasses: db.prepare('SELECT class_id FROM class_staff WHERE user_id = ? ORDER BY class_id'),
    studentClasses: db.prepare(
      'SELECT class_id FROM enrollments WHERE user_id = ? ORDER BY class_id',
    ),
    adminClassDetails: db.prepare('SELECT id, code, title FROM classes ORDER BY id'),
    taClassDetails: db.prepare(`
      SELECT c.id, c.code, c.title
      FROM class_staff cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.user_id = ?
      ORDER BY c.id
    `),
    studentClassDetails: db.prepare(`
      SELECT c.id, c.code, c.title
      FROM enrollments e
      JOIN classes c ON c.id = e.class_id
      WHERE e.user_id = ?
      ORDER BY c.id
    `),
  };

  return [
    [
      'GET',
      '/api/me',
      (req, res) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const classes =
          me.role === 'admin'
            ? q.adminClasses.all().map((r) => r.id)
            : me.role === 'ta'
              ? q.taClasses.all(me.id).map((r) => r.class_id)
              : q.studentClasses.all(me.id).map((r) => r.class_id);

        const rawDetails =
          me.role === 'admin'
            ? q.adminClassDetails.all()
            : me.role === 'ta'
              ? q.taClassDetails.all(me.id)
              : q.studentClassDetails.all(me.id);

        const classDetails = /** @type {Array<{ id: number, code: string, title: string }>} */ (
          rawDetails
        ).map((c) => ({
          id: Number(c.id),
          code: c.code,
          title: c.title,
        }));

        return send(res, 200, {
          id: me.id,
          name: me.name,
          role: me.role,
          classes,
          classDetails,
        });
      },
    ],
  ];
}
