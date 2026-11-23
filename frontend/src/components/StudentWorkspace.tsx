import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { apiFetch, isBanListRuleText } from '../api';
import type { LabDetail, LabSubmissionsResponse, SubmissionRecord } from '../types';
import { UploadIcon } from './Icons';

interface StudentWorkspaceProps {
  token: string;
  lab: LabDetail;
  onStatus: (message: string, tone: 'info' | 'success' | 'error') => void;
  onSubmissionSettled: () => Promise<void>;
}

const MAX_CODE_BYTES = 65_536;

const STARTER_CPP = `#include <iostream>

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);
  return 0;
}
`;

export function StudentWorkspace({
  token,
  lab,
  onStatus,
  onSubmissionSettled,
}: StudentWorkspaceProps) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const settledRef = useRef(onSubmissionSettled);
  settledRef.current = onSubmissionSettled;
  const historySeqRef = useRef(0);

  const codeBytes = new TextEncoder().encode(code).length;

  async function fetchHistory(selectId?: number) {
    const seq = ++historySeqRef.current;
    setLoadingHistory(true);
    try {
      const data = await apiFetch<LabSubmissionsResponse>(
        token,
        'GET',
        `/api/labs/${lab.id}/submissions`,
      );
      if (historySeqRef.current !== seq) return;
      setSubmissions(data.submissions);
      if (selectId !== undefined) {
        setSelectedId(selectId);
      } else if (data.submissions.length > 0) {
        setSelectedId((prev) =>
          prev && data.submissions.some((s) => s.id === prev) ? prev : data.submissions[0].id,
        );
      } else {
        setSelectedId(null);
      }
    } catch (err) {
      if (historySeqRef.current !== seq) return;
      onStatus(err instanceof Error ? err.message : 'Failed to load submission history.', 'error');
    } finally {
      if (historySeqRef.current === seq) {
        setLoadingHistory(false);
      }
    }
  }

  useEffect(() => {
    setCode('');
    setSubmissions([]);
    setSelectedId(null);
    void fetchHistory();
    return () => {
      historySeqRef.current += 1;
    };
  }, [lab.id, token]);

  const activeSub =
    submissions.find((s) => s.id === selectedId) ??
    (submissions.length > 0 ? submissions[0] : null);
  const activeSubId = activeSub?.id ?? null;

  const shouldPoll = Boolean(
    activeSub && activeSub.judgeStatus !== 'done' && activeSub.jobStatus !== 'failed',
  );

  useEffect(() => {
    if (activeSubId === null || !shouldPoll) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollOnce = async () => {
      if (cancelled) return;
      let keepPolling = true;
      try {
        const updated = await apiFetch<SubmissionRecord>(
          token,
          'GET',
          `/api/submissions/${activeSubId}`,
        );
        if (cancelled) return;
        setSubmissions((prev) =>
          prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
        );
        if (updated.judgeStatus === 'done' || updated.jobStatus === 'failed') {
          keepPolling = false;
          await settledRef.current();
        }
      } catch {
        // Retry cleanly on transient network error until settled or unmounted.
      }
      if (!cancelled && keepPolling) {
        timer = setTimeout(() => {
          void pollOnce();
        }, 1000);
      }
    };

    timer = setTimeout(() => {
      void pollOnce();
    }, 1000);

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [activeSubId, shouldPoll, token]);

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setCode(content);
    onStatus(`Loaded ${file.name} into editor`, 'info');
    e.target.value = '';
  }

  function handleEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const nextValue = `${code.slice(0, start)}  ${code.slice(end)}`;
    setCode(nextValue);
    setTimeout(() => {
      target.selectionStart = start + 2;
      target.selectionEnd = start + 2;
    }, 0);
  }

  async function handleSubmit() {
    if (!code.trim()) {
      onStatus('Write or upload C++ source code before submitting.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: number; status: string }>(
        token,
        'POST',
        `/api/labs/${lab.id}/submissions`,
        { code },
      );
      onStatus(`Submitted attempt #${created.id} (${created.status})`, 'success');
      await fetchHistory(created.id);
      await onSubmissionSettled();
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'Submission failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefreshActive() {
    if (!activeSub) return;
    try {
      const updated = await apiFetch<SubmissionRecord>(
        token,
        'GET',
        `/api/submissions/${activeSub.id}`,
      );
      setSubmissions((prev) =>
        prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
      );
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'Refresh failed.', 'error');
    }
  }

  return (
    <div id="studentPanel" className="student-grid">
      {/* Problem Statement & Constraints */}
      <div className="builder-list">
        <section className="card">
          <h3 className="section-heading">Problem Statement</h3>
          <pre id="statement" className="statement-box">
            {lab.statement || '(No problem statement provided yet.)'}
          </pre>

          <h3 className="section-heading">Public Constraints</h3>
          {lab.constraints.length === 0 ? (
            <p className="muted">No constraint deductions declared for this lab.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Requirement</th>
                    <th>Penalty</th>
                  </tr>
                </thead>
                <tbody>
                  {lab.constraints.map((c) => (
                    <tr key={c.code}>
                      <td>
                        <strong>{c.code}</strong>
                      </td>
                      <td>
                        <div>{c.text}</div>
                        <span className="muted">
                          {isBanListRuleText(c.text) ? 'Syntax ban rule' : 'Semantic constraint'}
                        </span>
                      </td>
                      <td>-{c.deduction} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lab.reviewNotice && (
            <div id="reviewNotice" className="notice-box">
              {lab.reviewNotice}
            </div>
          )}
        </section>
      </div>

      {/* C++ Editor & Submission Results */}
      <div className="builder-list">
        <section className="card">
          <div className="builder-header">
            <label htmlFor="code" className="section-heading">
              C++17 Solution Editor
            </label>
            <div className="toolbar-row">
              <label className="btn btn-sm file-btn">
                <UploadIcon />
                <span>Upload .cpp</span>
                <input
                  type="file"
                  accept=".cpp,.cc,.cxx,.c++,.txt"
                  onChange={(e) => void handleFileUpload(e)}
                />
              </label>
              <button type="button" className="btn btn-sm" onClick={() => setCode(STARTER_CPP)}>
                Starter template
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setCode('')}>
                Clear
              </button>
            </div>
          </div>

          <textarea
            id="code"
            className="textarea textarea-mono"
            rows={15}
            spellCheck={false}
            placeholder="// Paste or upload your C++17 solution here..."
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleEditorKeyDown}
          />

          {lab.deadlinePassed && !lab.publishedAt && (
            <div className="notice-box">
              Submission deadline has passed — new submissions are closed.
            </div>
          )}

          <div className="card-header">
            <span className={codeBytes > MAX_CODE_BYTES ? 'pill pill-danger' : 'muted'}>
              {codeBytes.toLocaleString()} / {MAX_CODE_BYTES.toLocaleString()} bytes
            </span>
            <button
              id="submit"
              type="button"
              className="btn btn-primary"
              disabled={
                submitting ||
                codeBytes > MAX_CODE_BYTES ||
                Boolean(lab.publishedAt) ||
                Boolean(lab.deadlinePassed)
              }
              onClick={() => void handleSubmit()}
            >
              {submitting ? 'Submitting...' : 'Submit C++'}
            </button>
          </div>
        </section>

        {/* Active Submission Result */}
        <section className="card">
          <div className="builder-header">
            <h3 className="section-heading">Submission Result</h3>
            {activeSub && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void handleRefreshActive()}
              >
                Refresh
              </button>
            )}
          </div>

          {loadingHistory && submissions.length === 0 ? (
            <p className="muted">Loading submission history...</p>
          ) : !activeSub ? (
            <p className="muted">You have not submitted a solution to this lab yet.</p>
          ) : (
            <div className="builder-list">
              <div className="stepper">
                <strong>Attempt #{activeSub.id}</strong>
                <span className={activeSub.judgeStatus === 'queued' ? 'pill pill-accent' : 'pill'}>
                  1. Queued
                </span>
                <span className={activeSub.judgeStatus === 'running' ? 'pill pill-accent' : 'pill'}>
                  2. Sandbox Judge
                </span>
                <span
                  className={
                    activeSub.jobStatus === 'failed'
                      ? 'pill pill-danger'
                      : activeSub.judgeStatus === 'done'
                        ? 'pill pill-success'
                        : 'pill'
                  }
                >
                  3. {activeSub.jobStatus === 'failed' ? 'Job Failed' : 'Done'}
                </span>
                <span
                  className={
                    activeSub.testVerdict === 'AC'
                      ? 'pill pill-success'
                      : activeSub.testVerdict === 'PENDING'
                        ? 'pill pill-accent'
                        : 'pill pill-danger'
                  }
                >
                  {activeSub.testVerdict}
                </span>
                {activeSub.counted && <span className="pill pill-accent">Counted for grade</span>}
              </div>

              {activeSub.testResults.length > 0 && (
                <div className="toolbar-row">
                  {activeSub.testResults.map((t) => (
                    <span
                      key={t.ordinal}
                      className={t.verdict === 'AC' ? 'pill pill-success' : 'pill pill-danger'}
                    >
                      Test #{t.ordinal}: {t.verdict}
                    </span>
                  ))}
                </div>
              )}

              {!lab.publishedAt ? (
                <div className="notice-box">
                  Grades and constraint review details remain hidden until the TA publishes results
                  after the deadline.
                </div>
              ) : !activeSub.counted ? (
                <div className="notice-box">
                  Not counted for grade — only your latest submission before the deadline is graded
                  (FAQ-02).
                </div>
              ) : activeSub.mark === undefined ? (
                <div className="notice-box">Grade breakdown unavailable for this submission.</div>
              ) : (
                <div className="builder-list">
                  <div className="mark-banner">
                    <span>Published Final Mark</span>
                    <span className="mark-score">{activeSub.mark} / 10</span>
                  </div>
                  {activeSub.manualReason && (
                    <p className="muted">TA note: {activeSub.manualReason}</p>
                  )}
                  {activeSub.deductions && activeSub.deductions.length > 0 ? (
                    <div className="evidence-box">
                      {activeSub.deductions.map((d) => (
                        <div key={d.constraintCode}>
                          <strong>
                            {d.constraintCode} (-{d.deduction} pts):
                          </strong>{' '}
                          {d.text}
                          {d.evidence.length > 0 &&
                            ` [${d.evidence.map((ev) => `L${ev.line}: ${ev.text}`).join(' | ')}]`}
                        </div>
                      ))}
                    </div>
                  ) : activeSub.testVerdict === 'AC' ? (
                    <p className="muted">No constraint deductions.</p>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {submissions.length > 0 && (
            <div className="builder-list">
              <span className="sidebar-label">Your Attempts ({submissions.length})</span>
              <div className="history-list">
                {submissions.map((sub) => (
                  <div
                    key={sub.id}
                    className={`history-item ${activeSub?.id === sub.id ? 'is-selected' : ''}`}
                  >
                    <div className="toolbar-row">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setSelectedId(sub.id)}
                      >
                        #{sub.id}
                      </button>
                      <span
                        className={
                          sub.testVerdict === 'AC'
                            ? 'pill pill-success'
                            : sub.testVerdict === 'PENDING'
                              ? 'pill pill-accent'
                              : 'pill pill-danger'
                        }
                      >
                        {sub.judgeStatus === 'done' ? sub.testVerdict : sub.judgeStatus}
                      </span>
                      {sub.counted && <span className="pill pill-accent">Counted</span>}
                      {sub.mark !== undefined && <span className="pill">{sub.mark}/10</span>}
                      <span className="muted">{sub.submittedAt} UTC</span>
                    </div>

                    {sub.code && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setCode(sub.code ?? '')}
                      >
                        Load in editor
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
