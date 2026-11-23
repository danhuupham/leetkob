import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiFetch, isBanListRuleText } from '../api';
import type { ClassDetail, LabConstraint, LabTestCase, MeResponse } from '../types';
import { PlusIcon, UploadIcon } from './Icons';

interface CreateLabViewProps {
  token: string;
  me: MeResponse;
  onCreated: (labId: number) => Promise<void>;
  onCancel: () => void;
  onStatus: (message: string, tone: 'info' | 'success' | 'error') => void;
}

function formatUtcDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function CreateLabView({ token, me, onCreated, onCancel, onStatus }: CreateLabViewProps) {
  const classOptions: ClassDetail[] =
    me.classDetails && me.classDetails.length > 0
      ? me.classDetails
      : me.classes.map((id) => ({ id, code: `Class ${id}`, title: '' }));

  const [classId, setClassId] = useState<number>(classOptions[0]?.id ?? 1);
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('2099-12-31 23:59:59');
  const [cpuLimitSec, setCpuLimitSec] = useState(2);
  const [memoryLimitMb, setMemoryLimitMb] = useState(256);

  const [testsMode, setTestsMode] = useState<'visual' | 'json'>('visual');
  const [tests, setTests] = useState<LabTestCase[]>([{ input: '', expectedOutput: '' }]);
  const [testsJson, setTestsJson] = useState('[{"input":"","expectedOutput":""}]');

  const [constraintsMode, setConstraintsMode] = useState<'visual' | 'json'>('visual');
  const [constraints, setConstraints] = useState<LabConstraint[]>([
    { code: 'C1', text: 'Do not use `std::sort`', deduction: 3 },
  ]);
  const [constraintsJson, setConstraintsJson] = useState(
    JSON.stringify([{ code: 'C1', text: 'Do not use `std::sort`', deduction: 3 }], null, 2),
  );

  const [submitting, setSubmitting] = useState(false);

  function switchTestsMode(nextMode: 'visual' | 'json') {
    if (nextMode === testsMode) return;
    if (nextMode === 'json') {
      setTestsJson(JSON.stringify(tests, null, 2));
      setTestsMode('json');
      return;
    }
    try {
      const parsed = JSON.parse(testsJson) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Hidden tests JSON must be an array.');
      setTests(
        parsed.map((t) => ({
          input: typeof (t as LabTestCase)?.input === 'string' ? (t as LabTestCase).input : '',
          expectedOutput:
            typeof (t as LabTestCase)?.expectedOutput === 'string'
              ? (t as LabTestCase).expectedOutput
              : '',
        })),
      );
      setTestsMode('visual');
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'Invalid tests JSON.', 'error');
    }
  }

  function switchConstraintsMode(nextMode: 'visual' | 'json') {
    if (nextMode === constraintsMode) return;
    if (nextMode === 'json') {
      setConstraintsJson(JSON.stringify(constraints, null, 2));
      setConstraintsMode('json');
      return;
    }
    try {
      const parsed = JSON.parse(constraintsJson) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Constraints JSON must be an array.');
      setConstraints(
        parsed.map((c, idx) => {
          const obj = (c ?? {}) as Record<string, unknown>;
          return {
            code:
              typeof obj.code === 'string'
                ? obj.code
                : typeof obj.id === 'string'
                  ? obj.id
                  : `C${idx + 1}`,
            text: typeof obj.text === 'string' ? obj.text : '',
            deduction: typeof obj.deduction === 'number' ? obj.deduction : 2,
          };
        }),
      );
      setConstraintsMode('visual');
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'Invalid constraints JSON.', 'error');
    }
  }

  async function handleStatementUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setStatement(text);
    if (!title.trim()) {
      const heading = text
        .split('\n')
        .find((l) => l.trim().startsWith('#'))
        ?.replace(/^#+\s*/, '')
        .trim();
      if (heading) setTitle(heading);
    }
    onStatus(`Loaded statement from ${file.name}`, 'info');
    e.target.value = '';
  }

  async function handleTestFilesUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const pairs = new Map<string, { input?: string; expectedOutput?: string }>();
    let ignoredCount = 0;

    for (const file of files) {
      const match = /^(.*)\.(in|out|ans)$/i.exec(file.name);
      if (!match) {
        ignoredCount += 1;
        continue;
      }
      const stem = match[1];
      const ext = match[2].toLowerCase();
      const entry = pairs.get(stem) ?? {};
      const content = await file.text();
      if (ext === 'in') entry.input = content;
      else entry.expectedOutput = content;
      pairs.set(stem, entry);
    }

    const sortedStems = Array.from(pairs.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    const loaded: LabTestCase[] = sortedStems.map((stem) => {
      const item = pairs.get(stem) ?? {};
      return {
        input: item.input ?? '',
        expectedOutput: item.expectedOutput ?? '',
      };
    });

    if (loaded.length === 0) {
      onStatus('Select .in and .out file pairs (e.g. 01.in + 01.out).', 'error');
      e.target.value = '';
      return;
    }

    setTests(loaded);
    setTestsJson(JSON.stringify(loaded, null, 2));
    const missingPairs = loaded.filter((t) => !t.input || !t.expectedOutput).length;
    onStatus(
      `Loaded ${loaded.length} test case(s)` +
        (missingPairs > 0 ? ` (${missingPairs} missing a matching .in/.out file)` : '') +
        (ignoredCount > 0 ? `, ignored ${ignoredCount} non-.in/.out file(s)` : ''),
      missingPairs > 0 ? 'info' : 'success',
    );
    e.target.value = '';
  }

  async function handleConstraintsUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const list = Array.isArray(raw)
        ? raw
        : raw &&
            typeof raw === 'object' &&
            Array.isArray((raw as { constraints?: unknown }).constraints)
          ? (raw as { constraints: unknown[] }).constraints
          : null;
      if (!list) {
        throw new Error('Expected a JSON array or {"constraints": [...]} object.');
      }
      const normalized: LabConstraint[] = list.map((c, idx) => {
        const obj = (c ?? {}) as Record<string, unknown>;
        return {
          code:
            typeof obj.code === 'string'
              ? obj.code
              : typeof obj.id === 'string'
                ? obj.id
                : `C${idx + 1}`,
          text: typeof obj.text === 'string' ? obj.text : '',
          deduction: typeof obj.deduction === 'number' ? obj.deduction : 2,
        };
      });
      setConstraints(normalized);
      setConstraintsJson(JSON.stringify(normalized, null, 2));
      onStatus(`Loaded ${normalized.length} constraint(s) from ${file.name}`, 'success');
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'Failed to parse constraints JSON.', 'error');
    }
    e.target.value = '';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let payloadTests = tests;
    let payloadConstraints = constraints;

    if (testsMode === 'json') {
      try {
        const parsed = JSON.parse(testsJson) as unknown;
        if (!Array.isArray(parsed)) throw new Error('Hidden tests JSON must be an array.');
        payloadTests = parsed as LabTestCase[];
      } catch (err) {
        onStatus(err instanceof Error ? err.message : 'Invalid hidden tests JSON.', 'error');
        return;
      }
    }

    if (constraintsMode === 'json') {
      try {
        const parsed = JSON.parse(constraintsJson) as unknown;
        if (!Array.isArray(parsed)) throw new Error('Constraints JSON must be an array.');
        payloadConstraints = parsed.map((c, idx) => {
          const obj = (c ?? {}) as Record<string, unknown>;
          return {
            code:
              typeof obj.code === 'string'
                ? obj.code
                : typeof obj.id === 'string'
                  ? obj.id
                  : `C${idx + 1}`,
            text: typeof obj.text === 'string' ? obj.text : '',
            deduction: typeof obj.deduction === 'number' ? obj.deduction : 2,
          };
        });
      } catch (err) {
        onStatus(err instanceof Error ? err.message : 'Invalid constraints JSON.', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: number }>(
        token,
        'POST',
        `/api/classes/${classId}/labs`,
        {
          title,
          statement,
          deadlineAt,
          cpuLimitSec,
          memoryLimitMb,
          tests: payloadTests,
          constraints: payloadConstraints,
        },
      );
      await onCreated(created.id);
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'Failed to create lab.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="createLabSection" className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Create New C++ Lab</h2>
          <p className="muted">
            Add hidden test pairs and public constraints. Ban-list rules starting with &ldquo;Do not
            use/call `...`&rdquo; are checked deterministically; other rules use AI.
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Back to lab
        </button>
      </div>

      <form className="builder-list" onSubmit={(e) => void handleSubmit(e)}>
        <div className="form-grid-2">
          <div className="form-field">
            <label htmlFor="classId">Class</label>
            <select
              id="classId"
              className="select"
              value={classId}
              onChange={(e) => setClassId(Number(e.target.value))}
            >
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.title ? `— ${c.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="newTitle">Lab Title</label>
            <input
              id="newTitle"
              className="input"
              type="text"
              placeholder="e.g. Lab 4 — Divide & Conquer Sorting"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <div className="builder-header">
            <label htmlFor="newStatement">Problem Statement</label>
            <label className="btn btn-sm file-btn">
              <UploadIcon />
              <span>Upload .md / .txt</span>
              <input
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={(e) => void handleStatementUpload(e)}
              />
            </label>
          </div>
          <textarea
            id="newStatement"
            className="textarea"
            rows={6}
            placeholder="Describe input format, output format, and algorithmic requirements..."
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
        </div>

        <div className="form-grid-3">
          <div className="form-field">
            <label htmlFor="newDeadline">Deadline (UTC YYYY-MM-DD HH:mm:ss)</label>
            <input
              id="newDeadline"
              className="input"
              type="text"
              value={deadlineAt}
              onChange={(e) => setDeadlineAt(e.target.value)}
            />
            <div className="toolbar-row">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDeadlineAt(formatUtcDateTime(new Date(Date.now() + 7 * 86400e3)))}
              >
                +7 days
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDeadlineAt(formatUtcDateTime(new Date(Date.now() + 3600e3)))}
              >
                +1 hour
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDeadlineAt('2099-12-31 23:59:59')}
              >
                Open (2099)
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDeadlineAt(formatUtcDateTime(new Date(Date.now() - 60e3)))}
              >
                Past (-1m)
              </button>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="newCpuLimit">CPU limit (1–5 sec)</label>
            <input
              id="newCpuLimit"
              className="input"
              type="number"
              min="1"
              max="5"
              value={cpuLimitSec}
              onChange={(e) => setCpuLimitSec(Number(e.target.value))}
            />
          </div>

          <div className="form-field">
            <label htmlFor="newMemoryLimit">Memory limit (64–512 MB)</label>
            <input
              id="newMemoryLimit"
              className="input"
              type="number"
              min="64"
              max="512"
              value={memoryLimitMb}
              onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Hidden Tests Builder */}
        <div className="builder-list">
          <div className="builder-header">
            <span className="field-label">Hidden Tests (stdin / expected stdout)</span>
            <div className="toolbar-row">
              <label className="btn btn-sm file-btn">
                <UploadIcon />
                <span>Upload .in / .out files</span>
                <input
                  type="file"
                  multiple
                  accept=".in,.out,.ans,.txt"
                  onChange={(e) => void handleTestFilesUpload(e)}
                />
              </label>
              <div className="segmented" role="group" aria-label="Hidden tests editor mode">
                <button
                  type="button"
                  className={testsMode === 'visual' ? 'is-active' : ''}
                  onClick={() => switchTestsMode('visual')}
                >
                  Visual
                </button>
                <button
                  type="button"
                  className={testsMode === 'json' ? 'is-active' : ''}
                  onClick={() => switchTestsMode('json')}
                >
                  JSON
                </button>
              </div>
            </div>
          </div>

          {testsMode === 'visual' ? (
            <div className="builder-list">
              {tests.map((tc, idx) => (
                <div key={idx} className="builder-card">
                  <div className="builder-card-top">
                    <strong>Test #{idx + 1}</strong>
                    {tests.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setTests((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="form-grid-2">
                    <div className="form-field">
                      <label htmlFor={`test-in-${idx}`}>Input (stdin)</label>
                      <textarea
                        id={`test-in-${idx}`}
                        className="textarea textarea-mono"
                        rows={3}
                        value={tc.input}
                        onChange={(e) =>
                          setTests((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, input: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor={`test-out-${idx}`}>Expected output (stdout)</label>
                      <textarea
                        id={`test-out-${idx}`}
                        className="textarea textarea-mono"
                        rows={3}
                        value={tc.expectedOutput}
                        onChange={(e) =>
                          setTests((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, expectedOutput: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setTests((prev) => [...prev, { input: '', expectedOutput: '' }])}
                >
                  <PlusIcon />
                  <span>Add test</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="newTests" className="sr-only">
                Hidden tests JSON
              </label>
              <textarea
                id="newTests"
                className="textarea textarea-mono"
                rows={6}
                value={testsJson}
                onChange={(e) => setTestsJson(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Public Constraints Builder */}
        <div className="builder-list">
          <div className="builder-header">
            <span className="field-label">Public Constraints &amp; Deductions</span>
            <div className="toolbar-row">
              <label className="btn btn-sm file-btn">
                <UploadIcon />
                <span>Upload constraints.json</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => void handleConstraintsUpload(e)}
                />
              </label>
              <div className="segmented" role="group" aria-label="Constraints editor mode">
                <button
                  type="button"
                  className={constraintsMode === 'visual' ? 'is-active' : ''}
                  onClick={() => switchConstraintsMode('visual')}
                >
                  Visual
                </button>
                <button
                  type="button"
                  className={constraintsMode === 'json' ? 'is-active' : ''}
                  onClick={() => switchConstraintsMode('json')}
                >
                  JSON
                </button>
              </div>
            </div>
          </div>

          {constraintsMode === 'visual' ? (
            <div className="builder-list">
              {constraints.map((c, idx) => (
                <div key={idx} className="builder-card">
                  <div className="builder-card-top">
                    <span
                      className={isBanListRuleText(c.text) ? 'pill pill-accent' : 'pill pill-warn'}
                    >
                      {isBanListRuleText(c.text) ? 'Hard rule (syntax AST)' : 'AI semantic check'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setConstraints((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="constraint-row">
                    <div className="form-field">
                      <label htmlFor={`c-code-${idx}`}>Code</label>
                      <input
                        id={`c-code-${idx}`}
                        className="input"
                        type="text"
                        value={c.code}
                        onChange={(e) =>
                          setConstraints((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, code: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor={`c-text-${idx}`}>Constraint rule</label>
                      <input
                        id={`c-text-${idx}`}
                        className="input"
                        type="text"
                        placeholder="e.g. Do not use `std::sort` or Implement bottom-up..."
                        value={c.text}
                        onChange={(e) =>
                          setConstraints((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, text: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor={`c-ded-${idx}`}>Deduction</label>
                      <input
                        id={`c-ded-${idx}`}
                        className="input"
                        type="number"
                        min="0"
                        max="10"
                        value={c.deduction}
                        onChange={(e) =>
                          setConstraints((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, deduction: Number(e.target.value) } : row,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    setConstraints((prev) => [
                      ...prev,
                      { code: `C${prev.length + 1}`, text: '', deduction: 2 },
                    ])
                  }
                >
                  <PlusIcon />
                  <span>Add constraint</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="newConstraints" className="sr-only">
                Public constraints JSON
              </label>
              <textarea
                id="newConstraints"
                className="textarea textarea-mono"
                rows={6}
                value={constraintsJson}
                onChange={(e) => setConstraintsJson(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="toolbar-row">
          <button id="createLab" type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create lab'}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
