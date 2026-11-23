import { useCallback, useState } from 'react';
import { apiFetch, DEMO_TOKENS } from './api';
import { CreateLabView } from './components/CreateLabView';
import { Header } from './components/Header';
import { LabHeader } from './components/LabHeader';
import { Sidebar } from './components/Sidebar';
import { StudentWorkspace } from './components/StudentWorkspace';
import { TaWorkspace } from './components/TaWorkspace';
import { WelcomeView } from './components/WelcomeView';
import type {
  EvidenceLine,
  LabDetail,
  LabSummary,
  MeResponse,
  QueueItem,
  QueueResponse,
} from './types';

function chooseDefaultLab(labs: LabSummary[], username: string): number | null {
  if (labs.length === 0) return null;
  const preferredId = username === 'ta_b' || username === 'stu3' ? 3 : 1;
  const preferred = labs.find((l) => l.id === preferredId);
  return preferred ? preferred.id : labs[0].id;
}

export function App() {
  const [selectedWho, setSelectedWho] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);

  const [labs, setLabs] = useState<LabSummary[]>([]);
  const [loadingLabs, setLoadingLabs] = useState(false);

  const [activeView, setActiveView] = useState<'lab' | 'create'>('lab');
  const [activeLabId, setActiveLabId] = useState<number | null>(null);
  const [labDetail, setLabDetail] = useState<LabDetail | null>(null);
  const [queue, setQueue] = useState<QueueResponse | null>(null);

  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'info' | 'success' | 'error'>('info');

  const setStatus = useCallback((message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    setStatusMessage(message);
    setStatusTone(tone);
  }, []);

  const loadLabById = useCallback(
    async (tok: string, role: MeResponse['role'], labId: number) => {
      try {
        const detail = await apiFetch<LabDetail>(tok, 'GET', `/api/labs/${labId}`);
        setLabDetail(detail);
        setActiveLabId(detail.id);
        setActiveView('lab');
        if (role !== 'student') {
          const qData = await apiFetch<QueueResponse>(tok, 'GET', `/api/labs/${labId}/queue`);
          setQueue(qData);
        } else {
          setQueue(null);
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Failed to load lab', 'error');
      }
    },
    [setStatus],
  );

  const refreshLabsList = useCallback(async (tok: string): Promise<LabSummary[]> => {
    setLoadingLabs(true);
    try {
      const res = await apiFetch<{ labs: LabSummary[] }>(tok, 'GET', '/api/labs');
      setLabs(res.labs);
      return res.labs;
    } finally {
      setLoadingLabs(false);
    }
  }, []);

  const connectWithToken = useCallback(
    async (rawToken: string, whoName: string) => {
      const trimmed = rawToken.trim();
      if (!trimmed) {
        setStatus('Enter a bearer token to connect.', 'error');
        return;
      }

      setLabDetail(null);
      setQueue(null);
      setActiveLabId(null);

      try {
        const user = await apiFetch<MeResponse>(trimmed, 'GET', '/api/me');
        setActiveToken(trimmed);
        setMe(user);
        setActiveView('lab');
        setStatus(`Signed in as ${user.name} (${user.role})`, 'info');

        const availableLabs = await refreshLabsList(trimmed);
        const defaultLabId = chooseDefaultLab(availableLabs, whoName || user.name);
        if (defaultLabId !== null) {
          await loadLabById(trimmed, user.role, defaultLabId);
        }
      } catch (err) {
        setMe(null);
        setActiveToken('');
        setLabs([]);
        setStatus(err instanceof Error ? err.message : 'Sign in failed', 'error');
      }
    },
    [loadLabById, refreshLabsList, setStatus],
  );

  function handleSelectWho(who: string) {
    setSelectedWho(who);
    const demoTok = DEMO_TOKENS[who];
    if (!demoTok) return;
    setTokenInput(demoTok);
    void connectWithToken(demoTok, who);
  }

  function handleSignOut() {
    setSelectedWho('');
    setTokenInput('');
    setActiveToken('');
    setMe(null);
    setLabs([]);
    setActiveLabId(null);
    setLabDetail(null);
    setQueue(null);
    setActiveView('lab');
    setStatus('', 'info');
  }

  async function handleRefreshQueue() {
    if (!activeToken || !me || me.role === 'student' || !activeLabId) return;
    try {
      const [qData] = await Promise.all([
        apiFetch<QueueResponse>(activeToken, 'GET', `/api/labs/${activeLabId}/queue`),
        refreshLabsList(activeToken),
      ]);
      setQueue(qData);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to refresh queue', 'error');
    }
  }

  async function handleConfirmLegacy(item: QueueItem) {
    try {
      await apiFetch(activeToken, 'POST', `/api/submissions/${item.id}/review`, {
        decision: 'confirm',
      });
      setStatus(`Reviewed submission ${item.id}`, 'success');
      await handleRefreshQueue();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Review failed', 'error');
    }
  }

  async function handleReviewVerdict(
    verdictId: number,
    decision: 'pass' | 'violation',
    evidence?: EvidenceLine[],
  ) {
    try {
      await apiFetch(activeToken, 'POST', `/api/verdicts/${verdictId}/review`, {
        taDecision: decision,
        ...(decision === 'violation' ? { evidence } : {}),
      });
      setStatus(`Reviewed verdict ${verdictId}: ${decision}`, 'success');
      await handleRefreshQueue();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Review failed', 'error');
    }
  }

  async function handlePublish() {
    if (!activeLabId) return;
    try {
      const result = await apiFetch<{ lab: number; publishedAt: string }>(
        activeToken,
        'POST',
        `/api/labs/${activeLabId}/publish`,
      );
      await loadLabById(activeToken, me?.role ?? 'ta', activeLabId);
      await refreshLabsList(activeToken);
      setStatus(`Published at ${result.publishedAt}`, 'success');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Publish refused', 'error');
    }
  }

  return (
    <div className="app-shell">
      <Header
        me={me}
        selectedWho={selectedWho}
        tokenInput={tokenInput}
        statusMessage={statusMessage}
        statusTone={statusTone}
        onSelectWho={handleSelectWho}
        onTokenChange={setTokenInput}
        onConnectToken={() => void connectWithToken(tokenInput, '')}
        onSignOut={handleSignOut}
      />

      {!me ? (
        <main>
          <WelcomeView onQuickSignIn={handleSelectWho} />
        </main>
      ) : (
        <main id="app" className="workspace-shell">
          <Sidebar
            me={me}
            labs={labs}
            activeLabId={activeLabId}
            activeView={activeView}
            loadingLabs={loadingLabs}
            onSelectLab={(labId) => void loadLabById(activeToken, me.role, labId)}
            onOpenCreate={() => setActiveView('create')}
          />

          <div className="main-pane">
            {activeView === 'create' && me.role !== 'student' ? (
              <CreateLabView
                token={activeToken}
                me={me}
                onCreated={async (createdId) => {
                  await refreshLabsList(activeToken);
                  await loadLabById(activeToken, me.role, createdId);
                  setStatus(`Created lab ${createdId}`, 'success');
                }}
                onCancel={() => setActiveView('lab')}
                onStatus={setStatus}
              />
            ) : labDetail ? (
              <article id="labPanel" className="builder-list">
                <LabHeader lab={labDetail} role={me.role} costSpentUsd={queue?.costSpentUsd} />
                {me.role === 'student' ? (
                  <StudentWorkspace
                    token={activeToken}
                    lab={labDetail}
                    onStatus={setStatus}
                    onSubmissionSettled={async () => {
                      await refreshLabsList(activeToken);
                    }}
                  />
                ) : (
                  <TaWorkspace
                    token={activeToken}
                    lab={labDetail}
                    queue={queue}
                    onRefreshQueue={handleRefreshQueue}
                    onConfirmLegacy={handleConfirmLegacy}
                    onReviewVerdict={handleReviewVerdict}
                    onPublish={handlePublish}
                    onError={(msg) => setStatus(msg, 'error')}
                  />
                )}
              </article>
            ) : (
              <section className="card">
                <h2 className="card-title">Select a Lab</h2>
                <p className="muted">
                  Choose a lab from the left sidebar or create a new lab to get started.
                </p>
              </section>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
