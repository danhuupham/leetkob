import { useState } from 'react';
import type { FormEvent } from 'react';
import type { LabSummary, MeResponse } from '../types';
import { PlusIcon } from './Icons';

interface SidebarProps {
  me: MeResponse;
  labs: LabSummary[];
  activeLabId: number | null;
  activeView: 'lab' | 'create';
  loadingLabs: boolean;
  onSelectLab: (labId: number) => void;
  onOpenCreate: () => void;
}

export function Sidebar({
  me,
  labs,
  activeLabId,
  activeView,
  loadingLabs,
  onSelectLab,
  onOpenCreate,
}: SidebarProps) {
  const [lookupId, setLookupId] = useState('');
  const isStaff = me.role !== 'student';

  function handleLookup(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(lookupId.trim());
    if (!Number.isInteger(parsed) || parsed < 1) return;
    onSelectLab(parsed);
  }

  return (
    <aside className="sidebar" aria-label="Course Labs">
      {isStaff && (
        <button
          type="button"
          className={activeView === 'create' ? 'btn btn-primary' : 'btn btn-primary'}
          onClick={onOpenCreate}
        >
          <PlusIcon />
          <span>New Lab</span>
        </button>
      )}

      <div className="sidebar-section">
        <p className="sidebar-label">Your Labs ({labs.length})</p>
        {loadingLabs && labs.length === 0 ? (
          <p className="muted">Loading labs...</p>
        ) : labs.length === 0 ? (
          <p className="muted">No labs available in your classes yet.</p>
        ) : (
          <div className="lab-nav-list">
            {labs.map((lab) => {
              const isSelected = activeView === 'lab' && activeLabId === lab.id;
              return (
                <button
                  key={lab.id}
                  type="button"
                  className={`lab-nav-item ${isSelected ? 'is-active' : ''}`}
                  onClick={() => onSelectLab(lab.id)}
                >
                  <div className="lab-nav-top">
                    <span className="lab-nav-title">
                      #{lab.id} · {lab.title}
                    </span>
                    {lab.publishedAt ? (
                      <span className="pill pill-success">Published</span>
                    ) : lab.deadlinePassed ? (
                      <span className="pill">Closed</span>
                    ) : (
                      <span className="pill pill-accent">Open</span>
                    )}
                  </div>

                  <div className="lab-nav-meta">
                    <span>{lab.classCode}</span>
                    {isStaff && (lab.pendingReviews ?? 0) > 0 && (
                      <span className="pill pill-warn">{lab.pendingReviews} pending</span>
                    )}
                    {!isStaff && lab.latestSubmission && (
                      <span
                        className={
                          lab.latestSubmission.testVerdict === 'AC'
                            ? 'pill pill-success'
                            : 'pill pill-danger'
                        }
                      >
                        {lab.latestSubmission.judgeStatus === 'done'
                          ? lab.latestSubmission.testVerdict
                          : lab.latestSubmission.judgeStatus}
                        {lab.latestSubmission.mark !== undefined
                          ? ` · ${lab.latestSubmission.mark}/10`
                          : ''}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <form className="sidebar-section" onSubmit={handleLookup}>
        <label htmlFor="labId" className="sidebar-label">
          Open by Lab ID
        </label>
        <div className="lookup-form">
          <input
            id="labId"
            className="input input-compact"
            type="number"
            min="1"
            placeholder="Lab ID"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
          <button id="loadLab" type="submit" className="btn btn-sm">
            Open
          </button>
        </div>
      </form>
    </aside>
  );
}
