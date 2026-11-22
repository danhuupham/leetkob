import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

// Default reference accounts for local development and automated tests:
//   class 1  TA: ta_a  students: stu1, stu2
//     lab 1 (deadline passed): submission 1 violation (unreviewed), submission 2 pass
//   class 2  TA: ta_b  students: stu3
//     lab 2 (deadline passed): submission 3 violation (confirmed)
//     lab 3 (deadline in future: 2099-12-31 23:59:59)
//   admin: every class
export const USERS = [
  { id: 1, name: 'admin', role: 'admin', token: 'tok-admin' },
  { id: 2, name: 'ta_a', role: 'ta', token: 'tok-ta-a' },
  { id: 3, name: 'ta_b', role: 'ta', token: 'tok-ta-b' },
  { id: 4, name: 'stu1', role: 'student', token: 'tok-stu1' },
  { id: 5, name: 'stu2', role: 'student', token: 'tok-stu2' },
  { id: 6, name: 'stu3', role: 'student', token: 'tok-stu3' },
];

/**
 * Applies pending SQL migrations in alphabetical order.
 * @param {DatabaseSync} db
 * @returns {string[]} Applied migration filenames
 */
export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const applied = new Set(
    /** @type {Array<{ filename: string }>} */ (
      db.prepare('SELECT filename FROM schema_migrations').all()
    ).map((r) => r.filename),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const markApplied = db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)');
  /** @type {string[]} */
  const newlyApplied = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(sql);
      if (file === '002_pa3_pipeline.sql') {
        db.prepare(
          `UPDATE submissions
           SET submitted_at = datetime('now')
           WHERE submitted_at = '1970-01-01 00:00:00'`,
        ).run();
      }
      markApplied.run(file);
      db.exec('COMMIT;');
      newlyApplied.push(file);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
  return newlyApplied;
}

/**
 * Idempotently seeds reference users, classes, labs, and submissions.
 * @param {DatabaseSync} db
 */
export function seedDemoData(db) {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, name, role, token) VALUES (?, ?, ?, ?)',
  );
  for (const u of USERS) insertUser.run(u.id, u.name, u.role, u.token);

  db.exec(`
    INSERT OR IGNORE INTO class_staff VALUES (1, 2), (2, 3);
    INSERT OR IGNORE INTO enrollments VALUES (1, 4), (1, 5), (2, 6);
    INSERT OR IGNORE INTO labs (id, class_id, title, deadline_at) VALUES
      (1, 1, 'Merge sort', '2026-11-01 00:00:00'),
      (2, 2, 'Merge sort', '2026-11-01 00:00:00'),
      (3, 2, 'Binary search', '2099-12-31 23:59:59');
  `);
  db.prepare(
    `INSERT OR IGNORE INTO submissions
       (id, lab_id, student_id, verdict, decision, submitted_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).run(1, 1, 4, 'violation', null);
  db.prepare(
    `INSERT OR IGNORE INTO submissions
       (id, lab_id, student_id, verdict, decision, submitted_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).run(2, 1, 5, 'pass', null);
  db.prepare(
    `INSERT OR IGNORE INTO submissions
       (id, lab_id, student_id, verdict, decision, submitted_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).run(3, 2, 6, 'violation', 'confirm');
}

/**
 * Opens a SQLite database connection. In-memory databases are migrated and seeded
 * automatically for test/dev ergonomics; file-backed databases enable WAL + busy_timeout
 * and rely on explicit `npm run migrate` (Session 8 container lifecycle rule).
 *
 * @param {string} [databaseUrl]
 * @param {{ migrateOnOpen?: boolean, seed?: boolean }} [options]
 * @returns {DatabaseSync}
 */
export function open(databaseUrl = ':memory:', options = {}) {
  const isMemory = databaseUrl === ':memory:';
  if (!isMemory) {
    mkdirSync(dirname(databaseUrl), { recursive: true });
  }
  const db = new DatabaseSync(databaseUrl);
  db.exec('PRAGMA foreign_keys = ON;');
  if (!isMemory) {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
  }
  if (options.migrateOnOpen ?? isMemory) {
    migrate(db);
  }
  if (options.seed ?? isMemory) {
    seedDemoData(db);
  }
  return db;
}
