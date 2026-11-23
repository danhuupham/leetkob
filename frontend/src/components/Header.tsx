import { useState } from 'react';
import type { MeResponse } from '../types';
import { BrandIcon } from './Icons';

interface HeaderProps {
  me: MeResponse | null;
  selectedWho: string;
  tokenInput: string;
  statusMessage: string;
  statusTone: 'info' | 'success' | 'error';
  onSelectWho: (who: string) => void;
  onTokenChange: (nextToken: string) => void;
  onConnectToken: () => void;
  onSignOut: () => void;
}

export function Header({
  me,
  selectedWho,
  tokenInput,
  statusMessage,
  statusTone,
  onSelectWho,
  onTokenChange,
  onConnectToken,
  onSignOut,
}: HeaderProps) {
  const [showCustomToken, setShowCustomToken] = useState(false);

  const bannerClass = statusMessage
    ? `status-banner ${statusTone === 'error' ? 'is-error' : statusTone === 'success' ? 'is-success' : ''}`
    : 'status-banner is-empty';

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">
              <BrandIcon />
            </div>
            <div>
              <h1 className="brand-title">LeeTKOB</h1>
              <p className="brand-sub">C++ Lab Judge &amp; TA Constraint Review</p>
            </div>
          </div>

          <div className="auth-controls">
            <div className="field-inline">
              <label htmlFor="who">Signed in as</label>
              <select
                id="who"
                className="select"
                value={selectedWho}
                onChange={(e) => onSelectWho(e.target.value)}
              >
                <option value="">choose...</option>
                <option value="ta_a">ta_a</option>
                <option value="ta_b">ta_b</option>
                <option value="stu1">stu1</option>
                <option value="stu2">stu2</option>
                <option value="stu4">stu4</option>
                <option value="stu3">stu3</option>
                <option value="admin">admin</option>
              </select>
            </div>

            {me && (
              <span className="pill pill-accent">
                {me.name} · {me.role.toUpperCase()}
              </span>
            )}

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowCustomToken((prev) => !prev)}
            >
              {showCustomToken ? 'Hide token' : 'Custom token'}
            </button>

            {showCustomToken && (
              <div className="field-inline">
                <label htmlFor="token" className="sr-only">
                  Bearer token
                </label>
                <input
                  id="token"
                  className="input input-token"
                  type="password"
                  autoComplete="off"
                  placeholder="tok-..."
                  value={tokenInput}
                  onChange={(e) => onTokenChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onConnectToken();
                  }}
                />
                <button
                  id="load"
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onConnectToken}
                >
                  Connect
                </button>
              </div>
            )}

            {me && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="status-strip">
        <p id="status" role="status" className={bannerClass.trim()}>
          {statusMessage}
        </p>
      </div>
    </>
  );
}
