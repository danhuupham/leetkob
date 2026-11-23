import { useState } from 'react';
import { apiFetch } from '../api';
import type { EvidenceLine, SubmissionRecord } from '../types';

interface CodeViewerProps {
  token: string;
  submissionId: number;
  highlightLines?: EvidenceLine[];
  onSelectLine?: (lineNumber: number, lineText: string) => void;
}

export function CodeViewer({
  token,
  submissionId,
  highlightLines = [],
  onSelectLine,
}: CodeViewerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const highlightedSet = new Set(highlightLines.map((e) => e.line));

  async function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (code !== null) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const sub = await apiFetch<SubmissionRecord>(
        token,
        'GET',
        `/api/submissions/${submissionId}`,
      );
      setCode(sub.code ?? '');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load code');
    } finally {
      setLoading(false);
    }
  }

  const lines = (code ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  return (
    <div className="code-viewer-wrap">
      <div className="toolbar-row">
        <button type="button" className="btn btn-sm" onClick={() => void toggleOpen()}>
          {open ? 'Hide code' : 'View code'}
        </button>
        {open && onSelectLine && (
          <span className="muted">Tip: Click any non-empty code line below to fill evidence.</span>
        )}
      </div>

      {open && (
        <div className="code-block" aria-label={`Source code for submission ${submissionId}`}>
          {loading ? (
            <div className="code-line">
              <span className="code-linenum">...</span>
              <span>Loading source...</span>
            </div>
          ) : errorMsg ? (
            <div className="code-line">
              <span className="code-linenum">!</span>
              <span>{errorMsg}</span>
            </div>
          ) : code === '' ? (
            <div className="code-line">
              <span className="code-linenum">-</span>
              <span>(Legacy submission record has no C++ source code stored)</span>
            </div>
          ) : (
            lines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const isHighlighted = highlightedSet.has(lineNum);
              const clickable = Boolean(onSelectLine && lineText.trim().length > 0);
              return (
                <div
                  key={lineNum}
                  className={`code-line ${isHighlighted ? 'is-highlighted' : ''} ${clickable ? 'is-clickable' : ''}`}
                  onClick={() => {
                    if (clickable && onSelectLine) onSelectLine(lineNum, lineText);
                  }}
                >
                  <span className="code-linenum">{lineNum}</span>
                  <span>{lineText || ' '}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
