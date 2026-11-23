import { useState } from 'react';
import { isBanListRuleText } from '../api';
import type { EvidenceLine, LabDetail, QueueItem, QueueResponse } from '../types';
import { CodeViewer } from './CodeViewer';
import { VerdictCard } from './VerdictCard';

interface TaWorkspaceProps {
  token: string;
  lab: LabDetail;
  queue: QueueResponse | null;
  onRefreshQueue: () => Promise<void>;
  onConfirmLegacy: (item: QueueItem) => Promise<void>;
  onReviewVerdict: (
    verdictId: number,
    decision: 'pass' | 'violation',
    evidence?: EvidenceLine[],
  ) => Promise<void>;
  onPublish: () => Promise<void>;
  onError: (msg: string) => void;
}

export function TaWorkspace({
  token,
  lab,
  queue,
  onRefreshQueue,
  onConfirmLegacy,
  onReviewVerdict,
  onPublish,
  onError,
}: TaWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'queue' | 'submissions' | 'problem'>('queue');
  const published = Boolean(queue?.publishedAt || lab.publishedAt);
  const items = queue?.items ?? [];
  const countedSubmissions = queue?.submissions ?? [];
  const pendingCount = items.filter((item) =>
    item.verdictId ? !item.taDecision : !item.decision,
  ).length;

  return (
    <div id="taPanel" className="builder-list">
      {/* Publish Gate Summary Card (always visible for TA) */}
      <section className="publish-card">
        <div className="publish-meta">
          <div className="toolbar-row">
            <strong>Grade Publishing Gate</strong>
            {published ? (
              <span className="pill pill-success">
                Published at {queue?.publishedAt ?? lab.publishedAt}
              </span>
            ) : (
              <>
                <span className={lab.deadlinePassed ? 'pill pill-success' : 'pill pill-warn'}>
                  {lab.deadlinePassed ? 'Deadline passed' : `Open until ${lab.deadlineAt} UTC`}
                </span>
                <span className={pendingCount === 0 ? 'pill pill-success' : 'pill pill-warn'}>
                  {pendingCount === 0
                    ? '0 pending reviews'
                    : `${pendingCount} review(s) awaiting TA decision`}
                </span>
              </>
            )}
          </div>
          <span className="muted">
            Publishing requires deadline passed, zero queued/running/failed jobs, and all flagged
            verdicts reviewed.
          </span>
        </div>

        <div className="toolbar-row">
          <button type="button" className="btn btn-sm" onClick={() => void onRefreshQueue()}>
            Refresh queue
          </button>
          <button
            id="publish"
            type="button"
            className="btn btn-success"
            onClick={() => void onPublish()}
          >
            Publish grades
          </button>
        </div>
      </section>

      {/* Workspace Tabs */}
      <section className="card">
        <div className="tabs" role="tablist" aria-label="TA Lab Views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'queue'}
            className={`tab-btn ${activeTab === 'queue' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            <span>Review Queue</span>
            <span className="pill">{items.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'submissions'}
            className={`tab-btn ${activeTab === 'submissions' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('submissions')}
          >
            <span>Counted Submissions</span>
            <span className="pill">{countedSubmissions.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'problem'}
            className={`tab-btn ${activeTab === 'problem' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('problem')}
          >
            <span>Problem &amp; Constraints</span>
          </button>
        </div>

        {activeTab === 'queue' && (
          <div className="builder-list">
            {items.length === 0 ? (
              <p className="muted">
                No flagged violations or unsure verdicts in the review queue for this lab.
              </p>
            ) : (
              items.map((item) => {
                if (!item.verdictId) {
                  return (
                    <div key={`legacy-${item.id}`} className="verdict-card">
                      <div className="verdict-head">
                        <div className="toolbar-row">
                          <strong>
                            #{item.id} · {item.student}
                          </strong>
                          <span
                            className={
                              item.verdict === 'violation' ? 'pill pill-danger' : 'pill pill-warn'
                            }
                          >
                            {item.verdict}
                          </span>
                        </div>
                        {item.decision ? (
                          <span className="pill pill-success">Decision: {item.decision}</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => void onConfirmLegacy(item)}
                          >
                            Confirm {item.student}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <VerdictCard
                    key={`verdict-${item.verdictId}`}
                    token={token}
                    published={published}
                    item={{
                      verdictId: item.verdictId,
                      submissionId: item.id,
                      student: item.student,
                      constraintCode: item.constraintCode ?? 'C',
                      ruleText: item.ruleText,
                      deduction: item.deduction,
                      verdict: (item.verdict as 'pass' | 'violation' | 'unsure') ?? 'unsure',
                      source: item.source ?? 'model',
                      unsureReason: item.unsureReason,
                      evidence: item.evidence ?? [],
                      rationale: item.rationale,
                      taDecision: item.taDecision ?? null,
                    }}
                    onReviewDecision={onReviewVerdict}
                    onError={onError}
                  />
                );
              })
            )}
          </div>
        )}

        {activeTab === 'submissions' && (
          <div className="builder-list">
            {countedSubmissions.length === 0 ? (
              <p className="muted">No counted C++ submissions before deadline yet.</p>
            ) : (
              countedSubmissions.map((sub) => (
                <div key={sub.id} className="verdict-card">
                  <div className="verdict-head">
                    <div className="toolbar-row">
                      <strong>
                        Submission #{sub.id} · {sub.student}
                      </strong>
                      <span
                        className={
                          sub.testVerdict === 'AC'
                            ? 'pill pill-success'
                            : sub.testVerdict === 'PENDING'
                              ? 'pill pill-accent'
                              : 'pill pill-danger'
                        }
                      >
                        {sub.testVerdict}
                      </span>
                      <span className="pill">
                        judge={sub.judgeStatus}
                        {sub.jobStatus === 'failed' ? ' (FAILED)' : ''}
                      </span>
                    </div>
                    <span className="muted">{sub.submittedAt} UTC</span>
                  </div>

                  <CodeViewer
                    token={token}
                    submissionId={sub.id}
                    highlightLines={sub.verdicts.flatMap((v) => v.evidence)}
                  />

                  {sub.verdicts.length > 0 && (
                    <div className="builder-list">
                      {sub.verdicts.map((v) => (
                        <VerdictCard
                          key={v.verdictId}
                          token={token}
                          published={published}
                          showStudentCodeViewer={false}
                          item={{
                            verdictId: v.verdictId,
                            submissionId: sub.id,
                            student: sub.student,
                            constraintCode: v.constraintCode,
                            ruleText: v.ruleText,
                            deduction: v.deduction,
                            verdict: v.verdict,
                            source: v.source,
                            unsureReason: v.unsureReason,
                            evidence: v.evidence,
                            rationale: v.rationale,
                            taDecision: v.taDecision,
                          }}
                          onReviewDecision={onReviewVerdict}
                          onError={onError}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'problem' && (
          <div className="builder-list">
            <div>
              <h3 className="section-heading">Problem Statement</h3>
              <pre id="statement" className="statement-box">
                {lab.statement || '(No statement text provided for this lab.)'}
              </pre>
            </div>

            <div>
              <h3 className="section-heading">Public Constraints</h3>
              {lab.constraints.length === 0 ? (
                <p className="muted">No constraints configured.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Rule</th>
                        <th>Checker</th>
                        <th>Deduction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lab.constraints.map((c) => (
                        <tr key={c.code}>
                          <td>
                            <strong>{c.code}</strong>
                          </td>
                          <td>{c.text}</td>
                          <td>
                            <span
                              className={
                                isBanListRuleText(c.text) ? 'pill pill-accent' : 'pill pill-warn'
                              }
                            >
                              {isBanListRuleText(c.text) ? 'Hard rule' : 'AI model'}
                            </span>
                          </td>
                          <td>-{c.deduction} pts</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {lab.reviewNotice && <div className="notice-box">{lab.reviewNotice}</div>}
          </div>
        )}
      </section>
    </div>
  );
}
