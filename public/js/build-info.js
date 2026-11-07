// Running build (version · commit · build time) from /api/version, shared by the
// front page and the TV/host screen. Plain globals, loaded by a <script> tag.

function shBuildLabel(info) {
  if (!info || !info.version) return '';
  return 'v' + info.version + (info.shortCommit ? ' · ' + info.shortCommit : '');
}

function shBuildTime(info) {
  if (!info || !info.builtAt) return '';
  return new Date(info.builtAt).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function shFillBuildBadge(el, info) {
  const label = shBuildLabel(info);
  if (!el || !label) return;
  el.textContent = label;
  el.title = 'Running build' + (info.builtAt ? ', built ' + shBuildTime(info) : '');
  el.classList.remove('hidden');
}

function shLoadBuildInfo(onInfo) {
  return fetch('/api/version', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(info => { if (info && info.version) onInfo(info); })
    .catch(() => {});
}
