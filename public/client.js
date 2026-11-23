const tokenInput = document.querySelector('#token');
const app = document.querySelector('#app');
const status = document.querySelector('#status');
const labPanel = document.querySelector('#labPanel');
const createLabSection = document.querySelector('#createLabSection');
const studentPanel = document.querySelector('#studentPanel');
const taPanel = document.querySelector('#taPanel');
const classSelect = document.querySelector('#classId');
const refreshBtn = document.querySelector('#refreshSubmission');
const submissionResult = document.querySelector('#submissionResult');

let me = null;
let activeSubmissionId = null;
let pollTimer = null;

const demoTokens = {
  ta_a: 'tok-ta-a',
  ta_b: 'tok-ta-b',
  stu1: 'tok-stu1',
  stu2: 'tok-stu2',
  stu3: 'tok-stu3',
  admin: 'tok-admin',
};

function stopPolling() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function headers(extra = {}) {
  return {
    authorization: `Bearer ${tokenInput.value.trim()}`,
    ...extra,
  };
}

async function api(method, path, body) {
  const init = { method, headers: headers(body ? { 'content-type': 'application/json' } : {}) };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(path, init);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { title: 'Invalid server response' };
  }
  if (!response.ok) throw Object.assign(new Error(data.title || 'Request failed'), { data });
  return data;
}

function populateClasses(classes) {
  classSelect.replaceChildren();
  for (const cid of classes) {
    const opt = document.createElement('option');
    opt.value = String(cid);
    opt.textContent = `Class ${cid}`;
    classSelect.append(opt);
  }
}

async function connect() {
  stopPolling();
  activeSubmissionId = null;
  refreshBtn.hidden = true;
  submissionResult.textContent = '';
  status.textContent = '';
  labPanel.hidden = true;
  try {
    me = await api('GET', '/api/me');
    app.hidden = false;
    const isStaff = me.role !== 'student';
    createLabSection.hidden = !isStaff;
    studentPanel.hidden = isStaff;
    taPanel.hidden = !isStaff;
    if (isStaff) {
      populateClasses(me.classes || []);
    }
    status.textContent = `Signed in as ${me.name} (${me.role})`;
    return true;
  } catch (error) {
    me = null;
    app.hidden = true;
    status.textContent = error.data?.detail || error.message;
    return false;
  }
}

function formatSubmissionOutput(sub) {
  const lines = [
    `Submission ${sub.id}: status=${sub.judgeStatus ?? sub.status}, testVerdict=${sub.testVerdict}`,
  ];
  if (Array.isArray(sub.testResults) && sub.testResults.length > 0) {
    lines.push(`Tests: ${sub.testResults.map((t) => `#${t.ordinal}:${t.verdict}`).join(', ')}`);
  }
  if (sub.mark !== undefined) {
    lines.push(`Mark: ${sub.mark}/10`);
    if (sub.manualReason) {
      lines.push(`Manual reason: ${sub.manualReason}`);
    }
    if (Array.isArray(sub.deductions) && sub.deductions.length > 0) {
      lines.push('Confirmed deductions:');
      for (const d of sub.deductions) {
        const ev = (d.evidence || []).map((e) => `L${e.line}: ${e.text}`).join(' | ');
        lines.push(`- ${d.constraintCode} (-${d.deduction}): ${d.text}${ev ? ` [${ev}]` : ''}`);
      }
    } else if (sub.testVerdict === 'AC') {
      lines.push('Deductions: none');
    }
  }
  return lines.join('\n');
}

async function refreshActiveSubmission() {
  if (!activeSubmissionId) return;
  try {
    const sub = await api('GET', `/api/submissions/${activeSubmissionId}`);
    submissionResult.textContent = formatSubmissionOutput(sub);
    const judgeStatus = sub.judgeStatus ?? sub.status;
    if (judgeStatus !== 'done') {
      stopPolling();
      pollTimer = setTimeout(() => {
        void refreshActiveSubmission();
      }, 1000);
    } else {
      stopPolling();
    }
  } catch (error) {
    stopPolling();
    submissionResult.textContent = error.data?.detail || error.message;
  }
}

function renderEvidenceList(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  const evList = document.createElement('ul');
  evList.className = 'evidence-list';
  for (const e of evidence) {
    const evItem = document.createElement('li');
    evItem.textContent = `Line ${e.line}: ${e.text}`;
    evList.append(evItem);
  }
  return evList;
}

function renderSubmissionsOverview(submissions) {
  const overview = document.querySelector('#submissionsOverview');
  overview.replaceChildren();
  if (!Array.isArray(submissions) || submissions.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No counted C++ submissions yet.';
    overview.append(empty);
    return;
  }
  for (const sub of submissions) {
    const li = document.createElement('li');
    const header = document.createElement('div');
    header.textContent = `Submission #${sub.id} (${sub.student}) — judge=${sub.judgeStatus}, tests=${sub.testVerdict}`;
    li.append(header);
    if (Array.isArray(sub.verdicts) && sub.verdicts.length > 0) {
      const subList = document.createElement('ul');
      for (const v of sub.verdicts) {
        const vLi = document.createElement('li');
        const decisionText = v.taDecision ? ` | TA: ${v.taDecision}` : '';
        vLi.textContent = `${v.constraintCode} (-${v.deduction} pts): ${v.verdict} [${v.source}${v.unsureReason ? `: ${v.unsureReason}` : ''}]${decisionText}`;
        const ev = renderEvidenceList(v.evidence);
        if (ev) vLi.append(ev);
        subList.append(vLi);
      }
      li.append(subList);
    }
    overview.append(li);
  }
}

async function loadQueue() {
  const labId = document.querySelector('#labId').value;
  const queue = await api('GET', `/api/labs/${labId}/queue`);
  const list = document.querySelector('#queue');
  list.replaceChildren();
  for (const item of queue.items) {
    const li = document.createElement('li');
    if (!item.verdictId) {
      li.textContent = `${item.student}: ${item.verdict ?? 'pending'}`;
      if (!item.decision) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `Confirm ${item.student}`;
        button.addEventListener('click', async () => {
          await api('POST', `/api/submissions/${item.id}/review`, { decision: 'confirm' });
          status.textContent = `Reviewed submission ${item.id}`;
          await loadQueue();
        });
        li.append(' ', button);
      }
    } else {
      const summary = document.createElement('div');
      const reason = item.unsureReason ? ` (${item.unsureReason})` : '';
      const decisionLabel = item.taDecision ? ` | TA: ${item.taDecision}` : '';
      summary.textContent = `#${item.id} ${item.student} — ${item.constraintCode} (-${item.deduction} pts): ${item.verdict} [${item.source}${reason}]${decisionLabel}`;
      li.append(summary);

      if (item.ruleText) {
        const ruleEl = document.createElement('div');
        ruleEl.className = 'muted';
        ruleEl.textContent = item.ruleText;
        li.append(ruleEl);
      }
      if (item.rationale) {
        const ratEl = document.createElement('div');
        ratEl.className = 'muted';
        ratEl.textContent = `Rationale: ${item.rationale}`;
        li.append(ratEl);
      }
      const ev = renderEvidenceList(item.evidence);
      if (ev) li.append(ev);

      if (!item.taDecision) {
        const actions = document.createElement('div');
        actions.className = 'actions';

        const passBtn = document.createElement('button');
        passBtn.type = 'button';
        passBtn.textContent = 'Mark Pass';
        passBtn.addEventListener('click', async () => {
          try {
            await api('POST', `/api/verdicts/${item.verdictId}/review`, { taDecision: 'pass' });
            status.textContent = `Reviewed verdict ${item.verdictId}: pass`;
            await loadQueue();
          } catch (error) {
            status.textContent = error.data?.detail || error.message;
          }
        });
        actions.append(passBtn);

        if (Array.isArray(item.evidence) && item.evidence.length > 0) {
          const violBtn = document.createElement('button');
          violBtn.type = 'button';
          violBtn.textContent = 'Confirm Violation';
          violBtn.addEventListener('click', async () => {
            try {
              await api('POST', `/api/verdicts/${item.verdictId}/review`, {
                taDecision: 'violation',
                evidence: item.evidence,
              });
              status.textContent = `Reviewed verdict ${item.verdictId}: violation`;
              await loadQueue();
            } catch (error) {
              status.textContent = error.data?.detail || error.message;
            }
          });
          actions.append(violBtn);
        } else {
          const lineInput = document.createElement('input');
          lineInput.type = 'number';
          lineInput.min = '1';
          lineInput.placeholder = 'Line #';
          lineInput.className = 'line-input';

          const textInput = document.createElement('input');
          textInput.type = 'text';
          textInput.placeholder = 'Evidence code line';

          const violBtn = document.createElement('button');
          violBtn.type = 'button';
          violBtn.textContent = 'Confirm Violation';
          violBtn.addEventListener('click', async () => {
            const line = Number(lineInput.value);
            const text = textInput.value.trim();
            if (!Number.isInteger(line) || line < 1 || !text) {
              status.textContent = 'Enter a valid source line number and code text';
              return;
            }
            try {
              await api('POST', `/api/verdicts/${item.verdictId}/review`, {
                taDecision: 'violation',
                evidence: [{ line, text }],
              });
              status.textContent = `Reviewed verdict ${item.verdictId}: violation`;
              await loadQueue();
            } catch (error) {
              status.textContent = error.data?.detail || error.message;
            }
          });
          actions.append(lineInput, textInput, violBtn);
        }

        li.append(actions);
      }
    }
    list.append(li);
  }
  renderSubmissionsOverview(queue.submissions);
}

async function loadLab() {
  stopPolling();
  labPanel.hidden = true;
  if (!me) return;
  const labId = document.querySelector('#labId').value;
  try {
    const lab = await api('GET', `/api/labs/${labId}`);
    document.querySelector('#labTitle').textContent = lab.title;
    document.querySelector('#labDeadline').textContent = `Deadline: ${lab.deadlineAt}`;
    document.querySelector('#statement').textContent = lab.statement;
    document.querySelector('#reviewNotice').textContent = lab.reviewNotice || '';
    const constraints = document.querySelector('#constraints');
    constraints.replaceChildren();
    for (const constraint of lab.constraints) {
      const li = document.createElement('li');
      li.textContent = `${constraint.code}: ${constraint.text} (${constraint.deduction} points)`;
      constraints.append(li);
    }
    labPanel.hidden = false;
    if (me.role !== 'student') await loadQueue();
  } catch (error) {
    status.textContent = error.data?.detail || error.message;
  }
}

document.querySelector('#who').addEventListener('change', async (event) => {
  const name = event.target.value;
  if (!demoTokens[name]) return;
  tokenInput.value = demoTokens[name];
  document.querySelector('#labId').value = name === 'ta_b' || name === 'stu3' ? '3' : '1';
  const ok = await connect();
  if (ok) await loadLab();
});

document.querySelector('#load').addEventListener('click', connect);
document.querySelector('#loadLab').addEventListener('click', loadLab);
refreshBtn.addEventListener('click', () => {
  void refreshActiveSubmission();
});

document.querySelector('#submit').addEventListener('click', async () => {
  stopPolling();
  const labId = document.querySelector('#labId').value;
  const code = document.querySelector('#code').value;
  submissionResult.textContent = 'Submitting...';
  try {
    const submitted = await api('POST', `/api/labs/${labId}/submissions`, { code });
    activeSubmissionId = submitted.id;
    refreshBtn.hidden = false;
    submissionResult.textContent = `Submission ${submitted.id}: ${submitted.status}`;
    await refreshActiveSubmission();
  } catch (error) {
    submissionResult.textContent = error.data?.detail || error.message;
  }
});

document.querySelector('#publish').addEventListener('click', async () => {
  const labId = document.querySelector('#labId').value;
  try {
    const published = await api('POST', `/api/labs/${labId}/publish`);
    status.textContent = `Published at ${published.publishedAt}`;
  } catch (error) {
    status.textContent = error.data?.detail || error.message;
  }
});

document.querySelector('#createLab').addEventListener('click', async () => {
  if (!me || me.role === 'student') return;
  const classId = Number(classSelect.value || me.classes?.[0]);
  if (!classId) {
    status.textContent = 'No accessible class';
    return;
  }
  try {
    const tests = JSON.parse(document.querySelector('#newTests').value);
    const constraints = JSON.parse(document.querySelector('#newConstraints').value);
    const created = await api('POST', `/api/classes/${classId}/labs`, {
      title: document.querySelector('#newTitle').value,
      statement: document.querySelector('#newStatement').value,
      deadlineAt: document.querySelector('#newDeadline').value,
      cpuLimitSec: Number(document.querySelector('#newCpuLimit').value),
      memoryLimitMb: Number(document.querySelector('#newMemoryLimit').value),
      tests,
      constraints,
    });
    document.querySelector('#labId').value = String(created.id);
    status.textContent = `Created lab ${created.id}`;
    await loadLab();
  } catch (error) {
    status.textContent = error.data?.detail || error.message;
  }
});
