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

export function createApp(db) {
  const q = {
    userByToken: db.prepare('SELECT id, name, role FROM users WHERE token = ?'),
    lab: db.prepare('SELECT id, class_id, published_at FROM labs WHERE id = ?'),
    staff: db.prepare('SELECT 1 FROM class_staff WHERE class_id = ? AND user_id = ?'),
    enrolled: db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND user_id = ?'),
    byLab: db.prepare(`SELECT s.id, u.name AS student, s.verdict, s.decision FROM submissions s
                       JOIN users u ON u.id = s.student_id WHERE s.lab_id = ? ORDER BY s.id`),
    submission: db.prepare(`SELECT s.id, l.class_id FROM submissions s
                            JOIN labs l ON l.id = s.lab_id WHERE s.id = ?`),
    review: db.prepare('UPDATE submissions SET decision = ? WHERE id = ?'),
    publish: db.prepare(
      "UPDATE labs SET published_at = datetime('now') WHERE id = ? AND published_at IS NULL",
    ),
  };

  const whoIs = (req) => {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    return m ? q.userByToken.get(m[1]) : undefined;
  };
  const isStaff = (me, classId) => me.role === 'admin' || !!q.staff.get(classId, me.id);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && p.length === 0) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }

    const me = whoIs(req);
    if (!me) return problem(res, 401, 'unauthenticated', 'Sign in first');

    if (req.method === 'GET' && p[1] === 'labs' && p[3] === 'queue' && p.length === 4) {
      const lab = q.lab.get(Number(p[2]));
      if (!lab || !isStaff(me, lab.class_id)) return problem(res, 404, 'not-found', 'No such lab');
      return send(res, 200, {
        lab: lab.id,
        publishedAt: lab.published_at,
        items: q.byLab.all(lab.id).filter((s) => needsReview(s.verdict)),
      });
    }

    if (req.method === 'POST' && p[1] === 'submissions' && p[3] === 'review' && p.length === 4) {
      const s = q.submission.get(Number(p[2]));
      if (!s || !isStaff(me, s.class_id)) {
        return problem(res, 404, 'not-found', 'No such submission');
      }
      const body = await readJson(req);
      if (!body || !['confirm', 'overturn'].includes(body.decision)) {
        return problem(res, 400, 'invalid-body', 'decision must be confirm or overturn');
      }
      q.review.run(body.decision, s.id);
      return send(res, 200, { id: s.id, decision: body.decision });
    }

    if (req.method === 'POST' && p[1] === 'labs' && p[3] === 'publish' && p.length === 4) {
      const lab = q.lab.get(Number(p[2]));
      if (!lab) return problem(res, 404, 'not-found', 'No such lab');
      // Mark it first, so a double click on Publish cannot race.
      q.publish.run(lab.id);
      if (!isStaff(me, lab.class_id)) {
        if (q.enrolled.get(lab.class_id, me.id)) {
          return problem(res, 403, 'forbidden', 'Only staff of this class may publish');
        }
        return problem(res, 404, 'not-found', 'No such lab');
      }
      return send(res, 200, { lab: lab.id, publishedAt: q.lab.get(lab.id).published_at });
    }

    return problem(res, 404, 'not-found', 'No such route');
  }

  return createServer((req, res) =>
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) problem(res, 500, 'internal', 'Something went wrong');
    }),
  );
}
