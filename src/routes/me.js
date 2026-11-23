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

        return send(res, 200, {
          id: me.id,
          name: me.name,
          role: me.role,
          classes,
        });
      },
    ],
  ];
}
