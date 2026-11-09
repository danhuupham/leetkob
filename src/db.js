import { DatabaseSync } from 'node:sqlite';

// An in-memory database, created and seeded on every start.
//
//   class 1  TA: ta_a  students: stu1, stu2  lab 1
//     submission 1  stu1  violation  not reviewed yet  -> lab 1 cannot be published yet
//     submission 2  stu2  pass       needs no review
//   class 2  TA: ta_b  students: stu3        lab 2
//     submission 3  stu3  violation  already reviewed  -> lab 2 can be published
//   admin: every class
export const USERS = [
  { id: 1, name: 'admin', role: 'admin', token: 'tok-admin' },
  { id: 2, name: 'ta_a', role: 'ta', token: 'tok-ta-a' },
  { id: 3, name: 'ta_b', role: 'ta', token: 'tok-ta-b' },
  { id: 4, name: 'stu1', role: 'student', token: 'tok-stu1' },
  { id: 5, name: 'stu2', role: 'student', token: 'tok-stu2' },
  { id: 6, name: 'stu3', role: 'student', token: 'tok-stu3' },
];

const SCHEMA = `
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','ta','student')), token TEXT NOT NULL UNIQUE);
CREATE TABLE class_staff (class_id INTEGER NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (class_id, user_id));
CREATE TABLE enrollments (class_id INTEGER NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (class_id, user_id));
CREATE TABLE labs (id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL, title TEXT NOT NULL,
  published_at TEXT);
CREATE TABLE submissions (id INTEGER PRIMARY KEY, lab_id INTEGER NOT NULL REFERENCES labs(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('pass','violation','unsure')),
  decision TEXT CHECK (decision IN ('confirm','overturn')));
`;

export function open() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const u = db.prepare('INSERT INTO users (id, name, role, token) VALUES (?, ?, ?, ?)');
  for (const x of USERS) u.run(x.id, x.name, x.role, x.token);
  db.exec(`
    INSERT INTO class_staff VALUES (1, 2), (2, 3);
    INSERT INTO enrollments VALUES (1, 4), (1, 5), (2, 6);
    INSERT INTO labs (id, class_id, title) VALUES (1, 1, 'Merge sort'), (2, 2, 'Merge sort');
    INSERT INTO submissions VALUES
      (1, 1, 4, 'violation', NULL),
      (2, 1, 5, 'pass', NULL),
      (3, 2, 6, 'violation', 'confirm');
  `);
  return db;
}
