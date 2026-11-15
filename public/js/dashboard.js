const POLL_INTERVAL_MS = 3000;

const state = {
  snapshot: null,
  query: '',
  statusFilter: 'all',
  autoRefresh: true,
  pollTimer: null,
  loading: true,
  expandedUaIds: new Set(),
  pendingAction: null,
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = '/admin/login?next=%2Fdashboard';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function formatDuration(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDeviceSummary(device) {
  if (!device) return 'Unknown Device';
  const parts = [device.label, device.os, device.browser].filter(v => v && v !== 'Unknown' && v !== 'Unknown OS');
  return parts.length ? parts.join(' · ') : 'Unknown Device';
}

function showError(msg) {
  const box = document.getElementById('dashboardError');
  const text = document.getElementById('dashboardErrorText');
  if (!msg) {
    box.classList.add('hidden');
    return;
  }
  text.textContent = msg;
  box.classList.remove('hidden');
}

function showBanner(msg) {
  const box = document.getElementById('actionBanner');
  const text = document.getElementById('actionBannerText');
  if (!msg) {
    box.classList.add('hidden');
    return;
  }
  text.textContent = msg;
  box.classList.remove('hidden');
}

function matchesSearch(table, q) {
  if (!q) return true;
  const hay = [
    table.code,
    table.game?.label,
    table.game?.type,
    table.game?.phase,
    ...table.players.flatMap(p => [
      p.username,
      p.device?.label,
      p.device?.os,
      p.device?.browser,
      p.device?.raw,
    ]),
    ...table.hosts.flatMap(h => [h.device?.label, h.device?.os, h.device?.browser, h.device?.raw]),
    ...table.bots.map(b => b.username),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function filterTables(tables) {
  const q = state.query.trim().toLowerCase();
  return tables.filter(table => {
    if (state.statusFilter === 'in_game' && table.status !== 'in_game') return false;
    if (state.statusFilter === 'lobby' && table.status === 'in_game') return false;
    return matchesSearch(table, q);
  });
}

function renderSummary(summary, generatedAt) {
  document.getElementById('kpiTableCount').textContent = String(summary.tableCount);
  document.getElementById('kpiTableSub').textContent = `${summary.activeGameCount} active · ${summary.lobbyCount} in lobby`;
  document.getElementById('kpiActiveGames').textContent = String(summary.activeGameCount);
  document.getElementById('kpiLobbyCount').textContent = `In lobby: ${summary.lobbyCount}`;
  document.getElementById('kpiConnectedPlayers').textContent = String(summary.connectedPlayerCount);
  document.getElementById('kpiPlayersSub').textContent = `${summary.humanPlayerCount} human · ${summary.botCount} AI bots`;
  document.getElementById('kpiHostDisplays').textContent = String(summary.hostDisplayCount);
  document.getElementById('kpiObserversSub').textContent = `Observers: ${summary.observerCount}`;
  document.getElementById('lastUpdatedLabel').textContent = `Updated ${formatTime(generatedAt)}`;
}

function renderUaToggle(uaKey, device) {
  const raw = device?.raw || '';
  if (!raw) return '<span class="text-xs text-slate-500">No User-Agent</span>';
  const expanded = state.expandedUaIds.has(uaKey);
  return `<button type="button" data-ua-toggle="${esc(uaKey)}" aria-expanded="${expanded ? 'true' : 'false'}" class="text-xs font-medium text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline whitespace-nowrap shrink-0">${expanded ? 'Hide UA' : 'Raw UA'}</button>`;
}

function renderTableStatus(table) {
  if (table.status === 'in_game' && table.game) {
    const parts = [table.game.label];
    if (table.game.round) parts.push(`Round ${table.game.round}`);
    if (table.game.phase) parts.push(table.game.phase);
    return `<span class="text-emerald-400 font-semibold">In Game</span> <span aria-hidden="true" class="text-slate-600">·</span> <span class="text-slate-200">${esc(parts.join(' · '))}</span>`;
  }
  const readyCount = table.players.filter(p => p.ready).length;
  const label = table.status === 'voting' ? 'Voting' : 'Lobby';
  return `<span class="text-amber-400 font-semibold">${label}</span> <span aria-hidden="true" class="text-slate-600">·</span> <span class="text-slate-300 tabular-nums">${readyCount}/${table.players.length} ready</span>`;
}

function renderTableCard(table) {
  const now = state.snapshot?.generatedAt || Date.now();
  const ageText = `Open ${formatDuration(now - table.createdAt)} · Idle ${formatDuration(table.idleMs)}`;

  const hostsHtml = table.hosts.length
    ? table.hosts.map((h, idx) => {
      const uaKey = `host:${table.code}:${idx}`;
      const expanded = state.expandedUaIds.has(uaKey);
      return `
        <div class="py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <span class="font-medium text-slate-200">TV Display #${idx + 1}</span>
            <span aria-hidden="true" class="text-slate-600">·</span>
            <span class="text-slate-300">${esc(formatDeviceSummary(h.device))}</span>
            ${h.connectedAt ? `<span aria-hidden="true" class="text-slate-600">·</span><span class="text-slate-400 font-mono tabular-nums">Connected ${esc(formatTime(h.connectedAt))}</span>` : ''}
          </div>
          ${renderUaToggle(uaKey, h.device)}
        </div>
        ${expanded && h.device?.raw ? `<div class="mb-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 break-all">${esc(h.device.raw)}</div>` : ''}
      `;
    }).join('')
    : '<div class="py-1.5 text-xs text-slate-500">No TV display currently connected</div>';

  const observersHtml = table.observers.length
    ? table.observers.map((o, idx) => {
      const uaKey = `obs:${table.code}:${o.observerId || idx}`;
      const expanded = state.expandedUaIds.has(uaKey);
      return `
        <div class="py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <span class="font-medium text-slate-300">Observer${o.username ? `: ${esc(o.username)}` : ` #${idx + 1}`}</span>
            <span aria-hidden="true" class="text-slate-600">·</span>
            <span class="text-slate-400">${esc(formatDeviceSummary(o.device))}</span>
          </div>
          ${renderUaToggle(uaKey, o.device)}
        </div>
        ${expanded && o.device?.raw ? `<div class="mb-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 break-all">${esc(o.device.raw)}</div>` : ''}
      `;
    }).join('')
    : '';

  const playersRowsHtml = table.players.length
    ? table.players.map(p => {
      const uaKey = `player:${table.code}:${p.playerId}`;
      const expanded = state.expandedUaIds.has(uaKey);
      const roleFlags = [];
      if (p.isAdmin) roleFlags.push('<span class="text-sky-400 font-medium">Table Host</span>');
      roleFlags.push(p.connected
        ? '<span class="text-emerald-400">Connected</span>'
        : '<span class="text-amber-400">Disconnected</span>');
      if (table.status !== 'in_game' && p.ready) {
        roleFlags.push('<span class="text-slate-300">Ready</span>');
      }

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-2.5 pr-4 align-middle">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-base leading-none shrink-0" aria-hidden="true">${esc(p.avatar || '🙂')}</span>
              <div class="min-w-0">
                <div class="text-sm font-medium text-white truncate">${esc(p.username)}</div>
                <div class="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">${roleFlags.join('<span aria-hidden="true" class="text-slate-600">·</span>')}</div>
              </div>
            </div>
          </td>
          <td class="py-2.5 px-3 align-middle text-right font-mono tabular-nums text-xs text-slate-200">${esc(p.sessionScore)}</td>
          <td class="py-2.5 px-3 align-middle">
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-slate-200">${esc(formatDeviceSummary(p.device))}</span>
              ${renderUaToggle(uaKey, p.device)}
            </div>
          </td>
          <td class="py-2.5 px-3 align-middle text-right font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap">${esc(formatTime(p.lastSeen))}</td>
          <td class="py-2.5 pl-3 align-middle text-right">
            <button type="button" data-kick-code="${esc(table.code)}" data-kick-id="${esc(p.playerId)}" data-kick-name="${esc(p.username)}"
              class="px-2.5 py-1 rounded-md bg-rose-950/70 hover:bg-rose-900 border border-rose-800/70 text-rose-200 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors">
              Kick
            </button>
          </td>
        </tr>
        ${expanded && p.device?.raw ? `
        <tr class="bg-slate-950/70">
          <td colspan="5" class="px-3 py-2 font-mono text-[11px] text-slate-300 break-all border-t border-slate-800/60">
            ${esc(p.device.raw)}
          </td>
        </tr>` : ''}
      `;
    }).join('')
    : '<tr><td colspan="5" class="py-4 text-center text-xs text-slate-500">No human players seated at this table.</td></tr>';

  const botsHtml = table.bots.length
    ? `<div class="pt-3 border-t border-slate-800/80 text-xs text-slate-400">
        <span class="font-medium text-slate-300">AI Seats (${table.bots.length}):</span>
        ${table.bots.map(b => `${esc(b.avatar || '🤖')} ${esc(b.username)}`).join(' · ')}
      </div>`
    : '';

  return `
    <article class="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2.5 text-sm">
            <span class="font-mono text-lg font-bold tracking-wider text-white tabular-nums">${esc(table.code)}</span>
            <span aria-hidden="true" class="text-slate-600">·</span>
            ${renderTableStatus(table)}
          </div>
          <div class="text-xs text-slate-400 font-mono tabular-nums">
            ${esc(ageText)} · Lang: ${esc((table.language || 'en').toUpperCase())} · Players: ${table.players.length}
          </div>
        </div>
        <button type="button" data-close-code="${esc(table.code)}"
          class="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-800/70 text-rose-200 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors">
          Close Table
        </button>
      </div>

      <div class="border-t border-slate-800/80 pt-3 divide-y divide-slate-800/50">
        ${hostsHtml}
        ${observersHtml}
      </div>

      <div class="border-t border-slate-800/80 pt-3 overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="text-xs font-medium text-slate-400 border-b border-slate-800">
              <th class="py-2 pr-4">Player</th>
              <th class="py-2 px-3 text-right">Score</th>
              <th class="py-2 px-3">Phone / Device</th>
              <th class="py-2 px-3 text-right">Last Seen</th>
              <th class="py-2 pl-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            ${playersRowsHtml}
          </tbody>
        </table>
      </div>

      ${botsHtml}
    </article>
  `;
}

function renderTables() {
  const container = document.getElementById('tablesContainer');
  if (!state.snapshot) return;

  const { summary, tables, generatedAt } = state.snapshot;
  renderSummary(summary, generatedAt);

  if (!tables.length) {
    container.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-3">
        <h2 class="text-base font-semibold text-white">No ongoing tables right now</h2>
        <p class="text-sm text-slate-400 max-w-md mx-auto">Active rooms appear here automatically as soon as a TV host creates a table or players join from their phones.</p>
        <div class="pt-1">
          <a href="/tv" class="inline-block px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors">Open TV Lobby</a>
        </div>
      </div>
    `;
    return;
  }

  const filtered = filterTables(tables);
  if (!filtered.length) {
    container.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
        <h2 class="text-base font-semibold text-white">No tables match your current filter</h2>
        <p class="text-sm text-slate-400">Adjust your search term or status filter to inspect all ${tables.length} active table(s).</p>
        <div>
          <button id="clearFiltersBtn" type="button" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 transition-colors">Clear filters</button>
        </div>
      </div>
    `;
    document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
      state.query = '';
      state.statusFilter = 'all';
      document.getElementById('tableSearchInput').value = '';
      updateFilterButtons();
      renderTables();
    });
    return;
  }

  container.innerHTML = filtered.map(renderTableCard).join('');
  bindTableActions(container);
}

function bindTableActions(container) {
  container.querySelectorAll('[data-ua-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.uaToggle;
      if (state.expandedUaIds.has(key)) state.expandedUaIds.delete(key);
      else state.expandedUaIds.add(key);
      renderTables();
    });
  });

  container.querySelectorAll('[data-kick-code]').forEach(btn => {
    btn.addEventListener('click', () => {
      openConfirmModal({
        type: 'kick',
        code: btn.dataset.kickCode,
        playerId: btn.dataset.kickId,
        playerName: btn.dataset.kickName,
        title: `Kick ${btn.dataset.kickName}?`,
        body: `This will immediately disconnect ${btn.dataset.kickName} from table ${btn.dataset.kickCode} and remove them from the active session.`,
        confirmLabel: 'Kick Player',
      });
    });
  });

  container.querySelectorAll('[data-close-code]').forEach(btn => {
    btn.addEventListener('click', () => {
      openConfirmModal({
        type: 'close',
        code: btn.dataset.closeCode,
        title: `Close table ${btn.dataset.closeCode}?`,
        body: `This will disconnect all phones and TV displays in room ${btn.dataset.closeCode}, end any running game, and remove the table immediately.`,
        confirmLabel: 'Close Table',
      });
    });
  });
}

function openConfirmModal(action) {
  state.pendingAction = action;
  document.getElementById('confirmModalTitle').textContent = action.title;
  document.getElementById('confirmModalBody').textContent = action.body;
  const submitBtn = document.getElementById('confirmSubmitBtn');
  submitBtn.textContent = action.confirmLabel;
  submitBtn.disabled = false;
  document.getElementById('confirmModal').classList.remove('hidden');
  document.getElementById('confirmCancelBtn').focus();
}

function closeConfirmModal() {
  state.pendingAction = null;
  document.getElementById('confirmModal').classList.add('hidden');
}

async function executePendingAction() {
  const action = state.pendingAction;
  if (!action) return;
  const submitBtn = document.getElementById('confirmSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Working...';
  try {
    if (action.type === 'kick') {
      await api(`/admin/api/tables/${encodeURIComponent(action.code)}/players/${encodeURIComponent(action.playerId)}/kick`, {
        method: 'POST',
      });
      showBanner(`Removed ${action.playerName} from table ${action.code}.`);
    } else if (action.type === 'close') {
      await api(`/admin/api/tables/${encodeURIComponent(action.code)}/close`, {
        method: 'POST',
      });
      showBanner(`Closed table ${action.code}.`);
    }
    closeConfirmModal();
    await fetchTables();
  } catch (err) {
    closeConfirmModal();
    showError(err.message);
  }
}

function updateFilterButtons() {
  document.querySelectorAll('[data-status-filter]').forEach(btn => {
    const active = btn.dataset.statusFilter === state.statusFilter;
    btn.className = `px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
      active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
    }`;
  });
}

function updateAutoRefreshButton() {
  const btn = document.getElementById('toggleAutoRefreshBtn');
  btn.textContent = state.autoRefresh ? 'Pause live feed' : 'Resume live feed';
}

function scheduleNextPoll() {
  clearTimeout(state.pollTimer);
  if (!state.autoRefresh || document.visibilityState === 'hidden') return;
  state.pollTimer = setTimeout(() => {
    fetchTables();
  }, POLL_INTERVAL_MS);
}

async function fetchTables() {
  clearTimeout(state.pollTimer);
  try {
    const snapshot = await api('/admin/api/tables');
    state.snapshot = snapshot;
    state.loading = false;
    showError('');
    renderTables();
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showError(`Could not load live tables: ${err.message}`);
    }
  } finally {
    scheduleNextPoll();
  }
}

async function loadMe() {
  const { user } = await api('/admin/api/me');
  document.getElementById('adminUserLabel').textContent = user.email || user.name || user.sub;
}

document.getElementById('tableSearchInput').addEventListener('input', e => {
  state.query = e.target.value;
  renderTables();
});

document.querySelectorAll('[data-status-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.statusFilter = btn.dataset.statusFilter;
    updateFilterButtons();
    renderTables();
  });
});

document.getElementById('toggleAutoRefreshBtn').addEventListener('click', () => {
  state.autoRefresh = !state.autoRefresh;
  updateAutoRefreshButton();
  if (state.autoRefresh) fetchTables();
  else clearTimeout(state.pollTimer);
});

document.getElementById('refreshNowBtn').addEventListener('click', () => {
  fetchTables();
});

document.getElementById('retryLoadBtn').addEventListener('click', () => {
  fetchTables();
});

document.getElementById('dismissBannerBtn').addEventListener('click', () => {
  showBanner('');
});

document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmModal);
document.getElementById('confirmSubmitBtn').addEventListener('click', executePendingAction);
document.getElementById('confirmModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeConfirmModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('confirmModal').classList.contains('hidden')) {
    closeConfirmModal();
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/admin/logout', { method: 'POST' });
  window.location.href = '/';
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.autoRefresh) {
    fetchTables();
  } else {
    clearTimeout(state.pollTimer);
  }
});

Promise.all([loadMe(), fetchTables()]).catch(() => {});
