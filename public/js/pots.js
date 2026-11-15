// Small Hours — running a pot room. Two modes:
// - admin (/admin/pots): every pot room, behind the admin login, via /admin/api/pots
// - host (/pot/CODE): one room, for whoever holds its host key, via /api/pots
// Full Swish numbers only appear on these pages.

const HOST_MODE = document.body.dataset.potMode === 'host';
const HOST_CODE = HOST_MODE ? (location.pathname.split('/')[2] || '').toUpperCase() : null;
const HOST_KEY = HOST_MODE ? (() => {
  // The key arrives in the link's #fragment (never sent to the server in a URL) and is kept on this device.
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('key');
  try {
    if (fromHash) localStorage.setItem('sh_pot_host_' + HOST_CODE, fromHash);
    return fromHash || localStorage.getItem('sh_pot_host_' + HOST_CODE);
  } catch { return fromHash; }
})() : null;
if (HOST_MODE && location.hash) history.replaceState(null, '', location.pathname);
const API = HOST_MODE ? '/api/pots' : '/admin/api/pots';

const MEDALS = ['🥇', '🥈', '🥉'];
const GAME_LABEL = { quiz: '🎯 Quiz', 'music-quiz': '🎵 Music Quiz' };
const STATUS_LABEL = { collecting: 'Collecting stakes', running: 'Game running', settled: 'Pay out winners' };

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(HOST_KEY ? { 'x-pot-key': HOST_KEY } : {}), ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  if (res.status === 401 && !HOST_MODE) { location.href = '/admin/login?next=%2Fadmin%2Fpots'; throw new Error('Signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Open Swish to pay a winner: number and amount filled in.
function swishPayLink(number, amount, message) {
  const data = {
    version: 1,
    payee: { value: String(number).replace(/\D/g, ''), editable: false },
    amount: { value: amount, editable: false },
    message: { value: message, editable: true },
  };
  return 'swish://payment?data=' + encodeURIComponent(JSON.stringify(data));
}

function formatNumber(n) {
  const s = String(n || '').replace(/\D/g, '');
  if (/^07\d{8}$/.test(s)) return `${s.slice(0, 3)}-${s.slice(3, 6)} ${s.slice(6, 8)} ${s.slice(8)}`;
  if (/^123\d{7}$/.test(s)) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 8)} ${s.slice(8)}`;
  return s;
}

function renderRoom(pot) {
  const pct = [50, 30, 15].map(p => Math.round(p / 95 * (100 - pot.bankPct) * 10) / 10);
  const paidCount = pot.players.filter(p => p.paid).length;
  const head = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-3">
          <span class="font-mono text-2xl font-bold text-amber-400">${esc(pot.code)}</span>
          <span class="text-xs px-2 py-0.5 rounded-full ${pot.status === 'settled' ? 'bg-amber-500/20 text-amber-300' : pot.status === 'running' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-700 text-slate-200'}">${STATUS_LABEL[pot.status] || esc(pot.status)}</span>
        </div>
        <p class="text-xs text-slate-400 mt-1">${GAME_LABEL[pot.gameType] || esc(pot.gameType)} · ${pot.stake} kr to play · 1st ${pct[0]} % · 2nd ${pct[1]} % · 3rd ${pct[2]} % · bank ${pot.bankPct} % · pay in to ${esc(formatNumber(pot.payee))}${pot.hosted && !HOST_MODE ? ' · <span class="text-sky-300">made by a host</span>' : ''}</p>
      </div>
      <div class="text-right">
        <div class="text-2xl font-bold text-amber-300">${pot.potSize} kr</div>
        <a href="/host/${esc(pot.code)}" target="_blank" rel="noopener" class="text-xs text-sky-400 hover:underline">Open TV screen ↗</a>
      </div>
    </div>`;

  const players = pot.players.length
    ? pot.players.map(p => `
      <tr class="${p.connected ? '' : 'opacity-50'} ${p.saysPaid ? 'bg-amber-500/10' : ''}">
        <td class="py-2 pr-3 whitespace-nowrap">${esc(p.avatar)} ${esc(p.username)}</td>
        <td class="py-2 pr-3 font-mono text-xs whitespace-nowrap">${p.swish ? esc(p.swish) : '<span class="text-slate-500">no number yet</span>'}</td>
        <td class="py-2 text-right">
          <label class="inline-flex items-center gap-2 text-xs ${pot.status !== 'collecting' || !p.swish ? 'opacity-50' : 'cursor-pointer'}">
            <input type="checkbox" class="w-5 h-5 accent-emerald-500" data-paid="${esc(p.playerId)}" data-code="${esc(pot.code)}" ${p.paid ? 'checked' : ''} ${pot.status !== 'collecting' || !p.swish ? 'disabled' : ''}>
            ${p.paid ? (p.paidBySwish ? 'Paid (Swish)' : 'Paid') : (p.saysPaid ? '<b class="text-amber-300">Says paid — check Swish</b>' : 'Not paid')}
          </label>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="py-3 text-slate-500 text-sm">No players yet. Open the TV screen and let them join.</td></tr>';

  let results = '';
  if (pot.result) {
    const wins = pot.result.results.filter(r => r.amount > 0).sort((a, b) => a.place - b.place);
    results = `
      <div class="rounded-xl bg-amber-500/10 border border-amber-500/40 p-4 space-y-3">
        <div class="text-sm font-semibold text-amber-200">Pot ${pot.result.pot} kr · bank keeps ${pot.result.bank} kr</div>
        ${pot.bankPayee && pot.result.bank > 0 ? `
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 pb-3">
            <div class="text-sm">🏦 <b>Bank share</b> — <b class="text-amber-300">${pot.result.bank} kr</b>
              <span class="font-mono text-xs text-slate-300 ml-1">${esc(formatNumber(pot.bankPayee))}</span></div>
            <div class="flex items-center gap-2">
              ${!pot.result.bankPaid ? `<a href="${swishPayLink(pot.bankPayee, pot.result.bank, `Smallhours ${pot.code} bank`)}" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold">Open Swish</a>` : ''}
              <button data-bankpaid="${esc(pot.code)}" data-value="${pot.result.bankPaid ? '0' : '1'}"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold ${pot.result.bankPaid ? 'bg-emerald-800 text-emerald-100' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'}">${pot.result.bankPaid ? '✓ Bank paid' : 'Mark bank paid'}</button>
            </div>
          </div>` : ''}
        ${wins.map(r => `
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm">${MEDALS[r.place - 1] || '🏅'} ${esc(r.avatar)} <b>${esc(r.username)}</b> — <b class="text-amber-300">${r.amount} kr</b>
              <span class="font-mono text-xs text-slate-300 ml-1">${esc(r.swish || 'no number')}</span></div>
            <div class="flex items-center gap-2">
              ${r.swish && !r.paidOut ? `<a href="${swishPayLink(r.swish, r.amount, `Smallhours ${pot.code} plats ${r.place}`)}" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold">Open Swish</a>` : ''}
              <button data-paidout="${esc(r.playerId)}" data-code="${esc(pot.code)}" data-value="${r.paidOut ? '0' : '1'}"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold ${r.paidOut ? 'bg-emerald-800 text-emerald-100' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'}">${r.paidOut ? '✓ Paid out' : 'Mark paid out'}</button>
            </div>
          </div>`).join('')}
      </div>`;
  }

  const actions = pot.status === 'settled'
    ? `<button data-newround="${esc(pot.code)}" class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-semibold">New round (everyone pays again)</button>`
    : `<span class="text-xs text-slate-400">${paidCount} of ${pot.players.filter(p => p.connected).length} paid · at least ${pot.minPlayers} needed</span>`;

  return `
    <section class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      ${head}
      ${results}
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-slate-400 border-b border-slate-800"><tr><th class="py-2 pr-3">Player</th><th class="py-2 pr-3">Swish</th><th class="py-2 text-right">Stake</th></tr></thead>
          <tbody class="divide-y divide-slate-800/70">${players}</tbody>
        </table>
      </div>
      <div class="flex justify-end">${actions}</div>
    </section>`;
}

function renderHistory(rows) {
  document.getElementById('potHistory').innerHTML = rows.map(p => `
    <tr>
      <td class="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">${new Date(p.created_at).toLocaleString('sv-SE')}</td>
      <td class="py-2 pr-3 font-mono">${esc(p.room_code)}</td>
      <td class="py-2 pr-3">${GAME_LABEL[p.game_type] || esc(p.game_type)}</td>
      <td class="py-2 pr-3">${p.stake} kr</td>
      <td class="py-2 pr-3">${p.pot != null ? p.pot + ' kr' : '—'}</td>
      <td class="py-2 pr-3">${p.bank != null ? p.bank + ' kr' : '—'}</td>
      <td class="py-2 text-xs">${esc(p.status)}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="py-3 text-slate-500">No pots yet.</td></tr>';
}

let lastHtml = '';
let payeeFilled = false;

async function refresh() {
  if (HOST_MODE) return refreshHost();
  try {
    const data = await api('/admin/api/pots');
    if (!payeeFilled && data.defaults?.payee) {
      document.getElementById('potPayee').value = data.defaults.payee;
      payeeFilled = true;
    }
    const html = data.rooms.map(renderRoom).join('') ||
      '<p class="text-sm text-slate-500">No pot rooms open. Create one above, then open its TV screen.</p>';
    // Don't redraw under a finger that is about to tick a box.
    if (html !== lastHtml) {
      lastHtml = html;
      document.getElementById('potRooms').innerHTML = html;
    }
    renderHistory(data.history || []);
  } catch (err) {
    document.getElementById('potFormStatus').textContent = err.message;
  }
}

async function refreshHost() {
  const box = document.getElementById('potRooms');
  if (!HOST_KEY) {
    box.innerHTML = '<p class="text-sm text-rose-300">This device does not have the host link for room ' + esc(HOST_CODE) + '. Open the link you got when you made the room.</p>';
    return;
  }
  try {
    const { pot } = await api(`/api/pots/${HOST_CODE}`);
    const html = renderRoom(pot);
    if (html !== lastHtml) { lastHtml = html; box.innerHTML = html; }
  } catch (err) {
    box.innerHTML = '<p class="text-sm text-rose-300">' + esc(err.message) + '</p>';
  }
}

document.getElementById('potForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const status = document.getElementById('potFormStatus');
  status.textContent = 'Creating…';
  try {
    const data = await api('/admin/api/pots', {
      method: 'POST',
      body: JSON.stringify({
        gameType: document.getElementById('potGame').value,
        stake: document.getElementById('potStake').value,
        bankPct: document.getElementById('potBank').value,
        payee: document.getElementById('potPayee').value,
      }),
    });
    status.innerHTML = `Room <b class="font-mono text-amber-300">${esc(data.code)}</b> is ready. <a class="text-sky-400 underline" target="_blank" rel="noopener" href="${esc(data.hostUrl)}">Open it on the TV ↗</a>`;
    await refresh();
  } catch (err) {
    status.textContent = err.message;
  }
});

document.getElementById('potRooms').addEventListener('click', async e => {
  const target = e.target.closest('[data-paidout],[data-newround],[data-bankpaid]');
  if (!target) return;
  try {
    if (target.dataset.bankpaid) {
      await api(`${API}/${target.dataset.bankpaid}/bank-paid`, { method: 'POST', body: JSON.stringify({ paid: target.dataset.value === '1' }) });
    } else if (target.dataset.paidout) {
      await api(`${API}/${target.dataset.code}/players/${encodeURIComponent(target.dataset.paidout)}/paid-out`, {
        method: 'POST', body: JSON.stringify({ paidOut: target.dataset.value === '1' }),
      });
    } else if (target.dataset.newround) {
      if (!confirm('Start a new round? Everyone pays the stake again.')) return;
      await api(`${API}/${target.dataset.newround}/new-round`, { method: 'POST' });
    }
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('potRooms').addEventListener('change', async e => {
  const box = e.target.closest('[data-paid]');
  if (!box) return;
  try {
    await api(`${API}/${box.dataset.code}/players/${encodeURIComponent(box.dataset.paid)}/paid`, {
      method: 'POST', body: JSON.stringify({ paid: box.checked }),
    });
  } catch (err) {
    box.checked = !box.checked;
    alert(err.message);
  }
  await refresh();
});

refresh();
setInterval(refresh, 3000);
