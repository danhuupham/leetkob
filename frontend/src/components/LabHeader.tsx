import type { LabDetail, UserRole } from '../types';

interface LabHeaderProps {
  lab: LabDetail;
  role: UserRole;
  costSpentUsd?: number;
}

export function LabHeader({ lab, role, costSpentUsd }: LabHeaderProps) {
  const isStaff = role !== 'student';
  const spent = costSpentUsd ?? lab.costSpentUsd;

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 id="labTitle" className="card-title">
            Lab #{lab.id}: {lab.title}
          </h2>
          <p id="labDeadline" className="muted">
            {lab.classCode ? `${lab.classCode} · ` : `Class ${lab.classId} · `}
            Deadline: {lab.deadlineAt} UTC
          </p>
        </div>

        <div className="toolbar-row">
          {lab.publishedAt ? (
            <span className="pill pill-success">Published {lab.publishedAt} UTC</span>
          ) : lab.deadlinePassed ? (
            <span className="pill">Deadline passed</span>
          ) : (
            <span className="pill pill-accent">Accepting submissions</span>
          )}
          <span className="pill">
            {lab.cpuLimitSec}s CPU · {lab.memoryLimitMb} MB RAM
          </span>
          {isStaff && spent !== undefined && (
            <span className="pill">AI Spend: ${spent.toFixed(4)} / $0.50 cap</span>
          )}
        </div>
      </div>
    </section>
  );
}
