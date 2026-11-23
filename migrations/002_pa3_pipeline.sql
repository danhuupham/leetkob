CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO classes (id, code, title, invite_code) VALUES
  (1, 'CSC13114-01', 'Intro C++ Programming — Class 1', 'INV-CLASS-1'),
  (2, 'CSC13114-02', 'Intro C++ Programming — Class 2', 'INV-CLASS-2');

ALTER TABLE labs ADD COLUMN statement TEXT NOT NULL DEFAULT '';
ALTER TABLE labs ADD COLUMN cpu_limit_sec INTEGER NOT NULL DEFAULT 1 CHECK (cpu_limit_sec BETWEEN 1 AND 5);
ALTER TABLE labs ADD COLUMN memory_limit_mb INTEGER NOT NULL DEFAULT 256 CHECK (memory_limit_mb BETWEEN 64 AND 512);
ALTER TABLE labs ADD COLUMN cost_spent_usd REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS lab_tests (
  id INTEGER PRIMARY KEY,
  lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  input_text TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  UNIQUE (lab_id, ordinal)
);

CREATE TABLE IF NOT EXISTS lab_constraints (
  id INTEGER PRIMARY KEY,
  lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  constraint_code TEXT NOT NULL, -- e.g. 'C1', 'C2'
  rule_text TEXT NOT NULL,
  deduction INTEGER NOT NULL CHECK (deduction BETWEEN 0 AND 10),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lab_id, constraint_code)
);

ALTER TABLE submissions ADD COLUMN code TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN judge_status TEXT NOT NULL DEFAULT 'done'
  CHECK (judge_status IN ('queued', 'running', 'done'));
ALTER TABLE submissions ADD COLUMN test_verdict TEXT NOT NULL DEFAULT 'AC'
  CHECK (test_verdict IN ('PENDING', 'AC', 'WA', 'TLE', 'MLE', 'RE', 'CE'));
ALTER TABLE submissions ADD COLUMN test_results_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN manual_mark REAL CHECK (manual_mark IS NULL OR (manual_mark >= 0 AND manual_mark <= 10));
ALTER TABLE submissions ADD COLUMN manual_reason TEXT;
-- SQLite forbids non-constant expressions like datetime('now') in ALTER TABLE ADD COLUMN DEFAULT.
ALTER TABLE submissions ADD COLUMN submitted_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
UPDATE submissions
   SET submitted_at = COALESCE(
     (SELECT l.deadline_at FROM labs l WHERE l.id = submissions.lab_id),
     datetime('now')
   )
 WHERE submitted_at = '1970-01-01 00:00:00';
ALTER TABLE submissions ADD COLUMN trace_id TEXT;

CREATE TABLE IF NOT EXISTS judge_jobs (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  trace_id TEXT,
  enqueued_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS constraint_verdicts (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  constraint_code TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'violation', 'unsure')),
  source TEXT NOT NULL CHECK (source IN ('hard_rule', 'model', 'ta_override')),
  unsure_reason TEXT CHECK (
    unsure_reason IS NULL OR unsure_reason IN (
      'model-unsure',
      'schema-invalid',
      'evidence-mismatch',
      'model-timeout',
      'cost-cap-exceeded',
      'model-off'
    )
  ),
  evidence_json TEXT NOT NULL DEFAULT '[]', -- Array<{ line: number, text: string }>
  model_rationale TEXT,
  queued_for_review INTEGER NOT NULL DEFAULT 0 CHECK (queued_for_review IN (0, 1)),
  ta_decision TEXT CHECK (ta_decision IS NULL OR ta_decision IN ('pass', 'violation')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  UNIQUE (submission_id, constraint_code)
);

CREATE TABLE IF NOT EXISTS model_calls (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
  lab_id INTEGER REFERENCES labs(id) ON DELETE SET NULL,
  provider_request_id TEXT,
  model_name TEXT NOT NULL,
  constraint_codes_json TEXT NOT NULL,
  sanitized_prompt TEXT NOT NULL,
  raw_response TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ok', 'timeout', 'schema_error', 'http_error', 'cost_capped')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
