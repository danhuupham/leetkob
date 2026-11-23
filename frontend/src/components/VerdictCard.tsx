import { useState } from 'react';
import type { EvidenceLine } from '../types';
import { CodeViewer } from './CodeViewer';

export interface ReviewableVerdict {
  verdictId: number;
  submissionId: number;
  student: string;
  constraintCode: string;
  ruleText?: string | null;
  deduction?: number | null;
  verdict: 'pass' | 'violation' | 'unsure';
  source: 'hard_rule' | 'model' | 'ta_override';
  unsureReason?: string | null;
  evidence: EvidenceLine[];
  rationale?: string | null;
  taDecision: 'pass' | 'violation' | null;
}

interface VerdictCardProps {
  token: string;
  item: ReviewableVerdict;
  published: boolean;
  showStudentCodeViewer?: boolean;
  onReviewDecision: (
    verdictId: number,
    decision: 'pass' | 'violation',
    evidence?: EvidenceLine[],
  ) => Promise<void>;
  onError: (msg: string) => void;
}

export function VerdictCard({
  token,
  item,
  published,
  showStudentCodeViewer = true,
  onReviewDecision,
  onError,
}: VerdictCardProps) {
  const [lineInput, setLineInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [busy, setBusy] = useState(false);

  const hasSuggestedEvidence = item.evidence.length > 0;
  const verdictPillClass =
    item.verdict === 'pass'
      ? 'pill pill-success'
      : item.verdict === 'violation'
        ? 'pill pill-danger'
        : 'pill pill-warn';

  async function handlePass() {
    setBusy(true);
    try {
      await onReviewDecision(item.verdictId, 'pass');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmViolation() {
    let evidenceToSend = item.evidence;
    if (!hasSuggestedEvidence) {
      const parsedLine = Number(lineInput.trim());
      const trimmedText = textInput.trim();
      if (!Number.isInteger(parsedLine) || parsedLine < 1 || !trimmedText) {
        onError('Enter a valid positive source line number and code line text before confirming.');
        return;
      }
      evidenceToSend = [{ line: parsedLine, text: trimmedText }];
    }
    setBusy(true);
    try {
      await onReviewDecision(item.verdictId, 'violation', evidenceToSend);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="verdict-card">
      <div className="verdict-head">
        <div className="toolbar-row">
          <strong>
            #{item.submissionId} · {item.student}
          </strong>
          <span className="pill">
            {item.constraintCode}
            {item.deduction !== null && item.deduction !== undefined
              ? ` (-${item.deduction} pts)`
              : ''}
          </span>
          <span className={verdictPillClass}>{item.verdict}</span>
          <span className="pill">
            {item.source === 'hard_rule'
              ? 'Hard rule'
              : item.source === 'model'
                ? 'AI model'
                : item.source}
            {item.unsureReason ? ` · ${item.unsureReason}` : ''}
          </span>
        </div>

        {item.taDecision ? (
          <span
            className={item.taDecision === 'violation' ? 'pill pill-danger' : 'pill pill-success'}
          >
            TA: {item.taDecision}
          </span>
        ) : (
          <span className="pill pill-warn">Needs TA review</span>
        )}
      </div>

      {item.ruleText && <div className="muted">{item.ruleText}</div>}
      {item.rationale && <div className="muted">AI rationale: {item.rationale}</div>}

      {hasSuggestedEvidence && (
        <div className="evidence-box">
          {item.evidence.map((ev, idx) => (
            <div key={`${ev.line}-${idx}`}>
              Line {ev.line}: {ev.text}
            </div>
          ))}
        </div>
      )}

      {showStudentCodeViewer && (
        <CodeViewer
          token={token}
          submissionId={item.submissionId}
          highlightLines={item.evidence}
          onSelectLine={
            !published && !hasSuggestedEvidence
              ? (lineNum, lineText) => {
                  setLineInput(String(lineNum));
                  setTextInput(lineText.trim());
                }
              : undefined
          }
        />
      )}

      {!published && (
        <div className="toolbar-row">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void handlePass()}
          >
            Mark Pass
          </button>

          {!hasSuggestedEvidence && (
            <>
              <input
                type="number"
                min="1"
                className="input input-compact"
                placeholder="Line #"
                value={lineInput}
                onChange={(e) => setLineInput(e.target.value)}
                aria-label="Evidence line number"
              />
              <input
                type="text"
                className="input"
                placeholder="Matching source code line"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                aria-label="Evidence code text"
              />
            </>
          )}

          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() => void handleConfirmViolation()}
          >
            Confirm Violation
          </button>
        </div>
      )}
    </div>
  );
}
