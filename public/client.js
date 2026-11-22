const tokenInput = document.querySelector('#token');
const app = document.querySelector('#app');
const status = document.querySelector('#status');
const labPanel = document.querySelector('#labPanel');
const studentPanel = document.querySelector('#studentPanel');
const taPanel = document.querySelector('#taPanel');

let me = null;
const demoTokens = {
  ta_a: 'tok-ta-a',
  ta_b: 'tok-ta-b',
  stu1: 'tok-stu1',
  stu2: 'tok-stu2',
  stu3: 'tok-stu3',
  admin: 'tok-admin',
};

document.querySelector('#who').addEventListener('change', async (event) => {
  const name = event.target.value;
  if (!demoTokens[name]) return;
  tokenInput.value = demoTokens[name];
  document.querySelector('#labId').value = name === 'ta_b' || name === 'stu3' ? '3' : '1';
  document.querySelector('#load').click();
  window.setTimeout(loadLab, 50);
});

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

document.querySelector('#load').addEventListener('click', async () => {
  status.textContent = '';
  try {
    me = await api('GET', '/api/me');
    app.hidden = false;
    studentPanel.hidden = me.role !== 'student';
    taPanel.hidden = me.role === 'student';
    status.textContent = `Signed in as ${me.name} (${me.role})`;
  } catch (error) {
    app.hidden = true;
    status.textContent = error.data?.detail || error.message;
  }
});

async function loadLab() {
  labPanel.hidden = true;
  const labId = document.querySelector('#labId').value;
  try {
    const lab = await api('GET', `/api/labs/${labId}`);
    document.querySelector('#labTitle').textContent = lab.title;
    document.querySelector('#labDeadline').textContent = `Deadline: ${lab.deadlineAt}`;
    document.querySelector('#statement').textContent = lab.statement;
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

document.querySelector('#loadLab').addEventListener('click', loadLab);

document.querySelector('#submit').addEventListener('click', async () => {
  const labId = document.querySelector('#labId').value;
  const code = document.querySelector('#code').value;
  const result = document.querySelector('#submissionResult');
  result.textContent = 'Submitting...';
  try {
    const submitted = await api('POST', `/api/labs/${labId}/submissions`, { code });
    result.textContent = `Submission ${submitted.id}: ${submitted.status}`;
  } catch (error) {
    result.textContent = error.data?.detail || error.message;
  }
});

async function loadQueue() {
  const labId = document.querySelector('#labId').value;
  const queue = await api('GET', `/api/labs/${labId}/queue`);
  const list = document.querySelector('#queue');
  list.replaceChildren();
  for (const item of queue.items) {
    const li = document.createElement('li');
    li.textContent = `${item.student}: ${item.verdict ?? 'pending'}`;
    if (!item.verdictId) {
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
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Confirm violation';
      button.addEventListener('click', async () => {
        try {
          await api('POST', `/api/verdicts/${item.verdictId}/review`, {
            taDecision: 'violation',
            evidence: item.evidence?.length
              ? item.evidence
              : [{ line: 1, text: '(TA evidence required)' }],
          });
          await loadQueue();
        } catch (error) {
          status.textContent = error.data?.detail || error.message;
        }
      });
      li.append(' ', button);
    }
    list.append(li);
  }
}

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
  const classId = me.classes[0];
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
