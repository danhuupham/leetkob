import { send } from '../http.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof import('../auth.js').createAuth>} auth
 * @returns {import('../http.js').RouteEntry[]}
 */
export function createMeRoutes(db, auth) {
  return [
    [
      'GET',
      '/api/me',
      (req, res) => {
        const me = auth.requireAuth(req, res);
        if (!me) return;

        const classes =
          me.role === 'admin'
            ? db
                .prepare('SELECT id FROM classes ORDER BY id')
                .all()
                .map((r) => r.id)
            : me.role === 'ta'
              ? db
                  .prepare('SELECT class_id FROM class_staff WHERE user_id = ? ORDER BY class_id')
                  .all(me.id)
                  .map((r) => r.class_id)
              : db
                  .prepare('SELECT class_id FROM enrollments WHERE user_id = ? ORDER BY class_id')
                  .all(me.id)
                  .map((r) => r.class_id);

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
