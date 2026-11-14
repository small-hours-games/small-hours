const CARD_PRESET = {
  id: 'crazy-eights-custom',
  kind: 'card-rules',
  label: 'Crazy Eights',
  icon: '🎱',
  blurb: 'Match suit or rank — 8s are wild!',
  min: 2,
  max: 6,
  aiMax: 3,
  deck: { decks: 1, aceHigh: false, opaqueIds: false },
  deal: { hand: 7, flipStarter: true },
  rules: {
    playMatch: 'suitOrRank',
    wildRanks: [8],
    allowMultiSameRank: false,
    drawOnPass: 1,
    specialEffects: { '2': 'nextDraw2', '12': 'reverse', '1': 'skip' },
    reshuffleDiscardWhenEmpty: true,
    allowPass: true,
  },
};

const QUIZ_PRESET = {
  id: 'custom-trivia-pack',
  kind: 'quiz',
  label: 'Custom Trivia',
  icon: '🧠',
  blurb: 'API-powered custom question pack',
  max: 20,
  questionCount: 5,
  tts: true,
  questions: [
    {
      question: 'Which card rank is wild in standard Crazy Eights?',
      correctAnswer: '8',
      incorrectAnswers: ['7', 'Ace', 'King'],
      difficulty: 'easy',
    },
    {
      question: 'How many cards are in a standard playing deck (without jokers)?',
      correctAnswer: '52',
      incorrectAnswers: ['48', '54', '60'],
      difficulty: 'easy',
    },
  ],
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function loadMe() {
  const { user } = await api('/admin/api/me');
  document.getElementById('adminUserLabel').textContent = user.email || user.name || user.sub;
}

async function loadKeys() {
  const { keys } = await api('/admin/api/keys');
  const tbody = document.getElementById('keysTableBody');
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-500">No API keys yet.</td></tr>';
    return;
  }
  tbody.innerHTML = keys.map(k => `
    <tr>
      <td class="py-2.5 pr-3 font-medium">${esc(k.name)}</td>
      <td class="py-2.5 pr-3 font-mono text-xs text-sky-300">${esc(k.prefix)}…</td>
      <td class="py-2.5 pr-3 text-xs text-slate-400">${esc(new Date(k.createdAt).toLocaleString())}</td>
      <td class="py-2.5 pr-3 text-xs text-slate-400">${k.lastUsedAt ? esc(new Date(k.lastUsedAt).toLocaleString()) : 'Never'}</td>
      <td class="py-2.5 text-right">
        ${k.revokedAt
          ? '<span class="text-xs text-rose-400">Revoked</span>'
          : `<button data-revoke="${esc(k.id)}" class="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-xs font-semibold">Revoke</button>`}
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-revoke]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api(`/admin/api/keys/${encodeURIComponent(btn.dataset.revoke)}`, { method: 'DELETE' });
      loadKeys();
    });
  });
}

async function loadGames() {
  const { custom } = await api('/admin/api/games');
  const list = document.getElementById('customGamesList');
  if (!custom.length) {
    list.innerHTML = '<div class="col-span-2 text-sm text-slate-500 py-3">No custom games yet. Use a preset or POST to <code>/api/v1/games</code>.</div>';
    return;
  }
  list.innerHTML = custom.map(g => `
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-3">
      <div>
        <div class="font-semibold">${esc(g.icon || '🎮')} ${esc(g.label)} <span class="text-xs font-mono text-slate-400">(${esc(g.id)})</span></div>
        <div class="text-xs text-slate-400 mt-0.5">${esc(g.kind)} • ${esc(g.blurb || '')}</div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button data-toggle="${esc(g.id)}" data-enabled="${g.enabled ? '1' : '0'}" class="px-2.5 py-1 rounded text-xs font-semibold ${g.enabled ? 'bg-emerald-900/60 text-emerald-200' : 'bg-slate-800 text-slate-300'}">${g.enabled ? 'Enabled' : 'Disabled'}</button>
        <button data-delete-game="${esc(g.id)}" class="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-xs font-semibold">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api(`/admin/api/games/${encodeURIComponent(btn.dataset.toggle)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: btn.dataset.enabled !== '1' }),
      });
      loadGames();
    });
  });
  list.querySelectorAll('[data-delete-game]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api(`/admin/api/games/${encodeURIComponent(btn.dataset.deleteGame)}`, { method: 'DELETE' });
      loadGames();
    });
  });
}

document.getElementById('newKeyForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('keyNameInput');
  const { secret } = await api('/admin/api/keys', { method: 'POST', body: JSON.stringify({ name: input.value }) });
  input.value = '';
  document.getElementById('newKeySecretValue').textContent = secret;
  document.getElementById('newKeySecretBox').classList.remove('hidden');
  loadKeys();
});

document.getElementById('copyKeyBtn').addEventListener('click', () => {
  navigator.clipboard?.writeText(document.getElementById('newKeySecretValue').textContent);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/admin/logout', { method: 'POST' });
  window.location.href = '/';
});

document.getElementById('presetCardBtn').addEventListener('click', () => {
  document.getElementById('gameJsonInput').value = JSON.stringify(CARD_PRESET, null, 2);
  document.querySelector('details').open = true;
});

document.getElementById('presetQuizBtn').addEventListener('click', () => {
  document.getElementById('gameJsonInput').value = JSON.stringify(QUIZ_PRESET, null, 2);
  document.querySelector('details').open = true;
});

document.getElementById('gameJsonForm').addEventListener('submit', async e => {
  e.preventDefault();
  const status = document.getElementById('gameJsonStatus');
  try {
    const spec = JSON.parse(document.getElementById('gameJsonInput').value);
    await api('/admin/api/games', { method: 'POST', body: JSON.stringify(spec) });
    status.textContent = 'Saved and registered!';
    status.className = 'text-xs text-emerald-400';
    loadGames();
  } catch (err) {
    status.textContent = err.message;
    status.className = 'text-xs text-rose-400';
  }
});

document.getElementById('gameJsonInput').value = JSON.stringify(CARD_PRESET, null, 2);
document.getElementById('curlExample').textContent =
`# 1. Create a card game via API
curl -X POST ${location.origin}/api/v1/games \\
  -H "Authorization: Bearer sh_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ id: 'uno-lite', kind: 'card-rules', label: 'UNO Lite', deal: { hand: 7 }, rules: { playMatch: 'suitOrRank', wildRanks: [8] } })}'

# 2. Deal cards using shared card logic
curl -X POST ${location.origin}/api/v1/cards/deck \\
  -H "Authorization: Bearer sh_live_YOUR_KEY" \\
  -H "Content-Type: application/json" -d '{"decks":1,"aceHigh":true}'`;

Promise.all([loadMe(), loadKeys(), loadGames()]).catch(() => {});
