CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'ta', 'student')),
  token TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS class_staff (
  class_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (class_id, user_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  class_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (class_id, user_id)
);

CREATE TABLE IF NOT EXISTS labs (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  deadline_at TEXT NOT NULL DEFAULT '2026-11-01 00:00:00',
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  lab_id INTEGER NOT NULL REFERENCES labs(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'violation', 'unsure')),
  decision TEXT CHECK (decision IN ('confirm', 'overturn'))
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  lab_id INTEGER NOT NULL REFERENCES labs(id),
  key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lab_id, key)
);
