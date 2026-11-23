import { DEMO_ACCOUNTS } from '../api';
import { CheckCircleIcon, ClockIcon, ShieldIcon } from './Icons';

interface WelcomeViewProps {
  onQuickSignIn: (username: string) => void;
}

export function WelcomeView({ onQuickSignIn }: WelcomeViewProps) {
  return (
    <div className="welcome-container">
      <section className="hero-card">
        <div>
          <h2>C++17 Sandbox Judging &amp; Human-Gated Constraint Review</h2>
          <p className="hero-lead">
            Select a seeded course role below (or in the header switcher) to explore LeeTKOB. Hidden
            tests stay server-side, AI constraint checks never alter grades without TA confirmation,
            and pre-publish results stay hidden from students.
          </p>
        </div>

        <div className="workflow-steps">
          <div className="workflow-step">
            <div className="workflow-step-head">
              <ClockIcon />
              <span>1. TA Creates Lab</span>
            </div>
            <p>
              Define statement, UTC deadline, sandbox CPU/RAM limits, hidden stdin/stdout tests, and
              public constraints.
            </p>
          </div>
          <div className="workflow-step">
            <div className="workflow-step-head">
              <ShieldIcon />
              <span>2. Queue &amp; Sandbox Judge</span>
            </div>
            <p>
              Worker compiles &amp; runs C++17 in an isolated container, then checks ban-list rules
              and AI semantic constraints.
            </p>
          </div>
          <div className="workflow-step">
            <div className="workflow-step-head">
              <CheckCircleIcon />
              <span>3. TA Reviews &amp; Publishes</span>
            </div>
            <p>
              Inspect line-level code evidence, mark Pass or Confirm Violation, and publish final
              marks after deadline.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="section-heading">Quick Sign In (Seeded Demo Accounts)</h3>
        <p className="muted">
          Click any role card to connect immediately without typing bearer tokens manually.
        </p>
        <div className="account-grid">
          {DEMO_ACCOUNTS.map((acct) => (
            <button
              key={acct.username}
              type="button"
              className="account-card"
              onClick={() => onQuickSignIn(acct.username)}
            >
              <div className="account-card-head">
                <span className="account-name">{acct.username}</span>
                <span
                  className={
                    acct.roleLabel === 'Teaching Assistant'
                      ? 'pill pill-accent'
                      : acct.roleLabel === 'Administrator'
                        ? 'pill pill-warn'
                        : 'pill'
                  }
                >
                  {acct.roleLabel}
                </span>
              </div>
              <div className="account-class">{acct.classLabel}</div>
              <div className="account-desc">{acct.summary}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
