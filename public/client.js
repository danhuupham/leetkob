const who = /** @type {HTMLSelectElement} */ (document.querySelector('#who'));
const list = /** @type {HTMLUListElement} */ (document.querySelector('#queue'));
const publish = /** @type {HTMLButtonElement} */ (document.querySelector('#publish'));
const status = /** @type {HTMLParagraphElement} */ (document.querySelector('#status'));

const headers = () => ({ authorization: `Bearer tok-${who.value.replace('_', '-')}` });

async function load() {
  list.replaceChildren();
  const res = await fetch('/api/labs/1/queue', { headers: headers() });
  publish.hidden = !res.ok;
  if (!res.ok) return;
  const { items } = await res.json();
  for (const s of items) {
    const li = document.createElement('li');
    li.textContent = `${s.student}: ${s.verdict} `;
    if (s.decision) {
      li.append(`(${s.decision}) `);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `Confirm ${s.student}`;
      b.addEventListener('click', async () => {
        await fetch(`/api/submissions/${s.id}/review`, {
          method: 'POST',
          headers: { ...headers(), 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'confirm' }),
        });
        status.textContent = `Reviewed submission ${s.id}`;
        await load();
      });
      li.append(b);
    }
    list.append(li);
  }
}

publish.addEventListener('click', async () => {
  const res = await fetch('/api/labs/1/publish', { method: 'POST', headers: headers() });
  const body = await res.json();
  status.textContent = res.ok ? `Published at ${body.publishedAt}` : body.title;
});

who.addEventListener('change', load);
