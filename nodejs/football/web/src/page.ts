/**
 * The board page, embedded as a string so it ships identically under tsx and the bundler.
 * Constraint of the embedding: the client code below uses no backtick and no dollar-brace
 * sequences (it is itself inside a template literal).
 */
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Draft Board</title>
<style>
  :root {
    --bg: #14161a; --panel: #1c1f26; --line: #2a2e37; --fg: #d8dce4; --dim: #8a90a0;
    --accent: #4fa3ff; --ok: #3fbf6f; --warn: #e0a63c; --err: #e05c5c; --me: #b07cff;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.35 system-ui, sans-serif; }
  button { font: inherit; cursor: pointer; background: #262b35; color: var(--fg); border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; }
  button:hover { border-color: var(--accent); }
  button:disabled { opacity: 0.45; cursor: default; }
  input[type=text] { background: #10131a; color: var(--fg); border: 1px solid var(--line); border-radius: 4px; padding: 3px 8px; width: 220px; }

  #status { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center;
    background: var(--panel); border-bottom: 1px solid var(--line); padding: 8px 14px; }
  #status .big { font-size: 15px; font-weight: 600; }
  #status .lbl { color: var(--dim); margin-right: 4px; }
  .pill { padding: 1px 9px; border-radius: 10px; font-weight: 600; font-size: 12px; }
  .pill.ok { background: #123b24; color: var(--ok); }
  .pill.warn { background: #3d2f10; color: var(--warn); }
  .pill.err { background: #421c1c; color: var(--err); }
  .pill.off { background: #262b35; color: var(--dim); }
  .spacer { flex: 1; }

  #layout { display: flex; gap: 12px; padding: 10px 14px; align-items: flex-start; }
  #main { flex: 1; min-width: 0; }
  #side { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; }
  .card h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); }

  #controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
  .tab { padding: 2px 10px; }
  .tab.active { background: var(--accent); color: #0b1420; border-color: var(--accent); font-weight: 600; }

  table { border-collapse: collapse; width: 100%; background: var(--panel); border: 1px solid var(--line); }
  thead th { position: sticky; top: 46px; background: #232833; color: var(--dim); font-size: 11px; text-transform: uppercase;
    padding: 4px 6px; text-align: right; cursor: pointer; user-select: none; white-space: nowrap; border-bottom: 1px solid var(--line); }
  thead th.l { text-align: left; }
  thead th.sorted { color: var(--accent); }
  tbody td { padding: 2px 6px; text-align: right; border-bottom: 1px solid #20242d; white-space: nowrap; }
  tbody td.l { text-align: left; }
  tbody tr:hover { background: #232a38; }
  tr.gone td { text-decoration: line-through; color: var(--dim); }
  tr.mine-row td { background: rgba(176, 124, 255, 0.07); }
  .tier { display: inline-block; min-width: 20px; text-align: center; border-radius: 3px; font-weight: 600; color: #0b0d10; }
  .t1 { background: #6fd08c; } .t2 { background: #a3d977; } .t3 { background: #e3d05e; } .t4 { background: #e8b055; }
  .t5 { background: #e08a55; } .t6 { background: #d96a6a; } .t7 { background: #b070c0; } .t0 { background: #7d879c; }
  .inj { color: var(--err); font-weight: 600; }
  .odds-hi { color: var(--ok); } .odds-mid { color: var(--warn); } .odds-lo { color: var(--err); }
  .src-manual { color: var(--warn); }
  .me { color: var(--me); font-weight: 600; }
  .muted { color: var(--dim); }
  .slot-row { display: flex; gap: 6px; padding: 1px 0; }
  .slot-name { width: 52px; color: var(--dim); flex-shrink: 0; }
  .warn-text { color: var(--warn); }
  #recent div { padding: 1px 0; }
</style>
</head>
<body>
<div id="status">
  <span class="big" id="leagueName">…</span>
  <span><span class="lbl">pick</span><span class="big" id="pickNow">—</span></span>
  <span><span class="lbl">on clock</span><span class="big" id="onClock">—</span></span>
  <span><span class="lbl">you in</span><span class="big" id="untilMe">—</span></span>
  <span><span class="lbl">your picks</span><span id="myPicks">—</span></span>
  <span class="spacer"></span>
  <span class="pill off" id="pollPill" title="">POLL</span>
  <label><input type="checkbox" id="pollToggle"> live poll</label>
  <button id="refreshBtn" title="Re-run full data ingest">Refresh data</button>
  <label><input type="checkbox" id="showDrafted"> show drafted</label>
  <span class="muted" id="asOf" title="">data: —</span>
</div>

<div id="layout">
  <div id="main">
    <div id="controls">
      <span id="tabs"></span>
      <input type="text" id="search" placeholder="search player / team">
      <span class="muted" id="rowCount"></span>
    </div>
    <table>
      <thead>
        <tr>
          <th data-k="rank">#</th>
          <th data-k="name" class="l">Player</th>
          <th data-k="position" class="l">Pos</th>
          <th data-k="team" class="l">Team</th>
          <th data-k="byeWeek">Bye</th>
          <th data-k="points">Pts</th>
          <th data-k="vor">VOR</th>
          <th data-k="tier">Tier</th>
          <th data-k="ecrRank">ECR</th>
          <th data-k="adp">ADP</th>
          <th data-k="injuryStatus" class="l">Inj</th>
          <th data-k="pNextPick" id="p1h">P@?</th>
          <th data-k="pPickAfter" id="p2h">P@?</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="rows"><tr><td colspan="14" class="l muted">loading…</td></tr></tbody>
    </table>
  </div>
  <div id="side">
    <div class="card"><h3 id="rosterTitle">My roster</h3><div id="roster"></div><div id="byes"></div></div>
    <div class="card"><h3>Tier scarcity</h3><div id="scarcity" class="muted"></div></div>
    <div class="card"><h3>Recent picks</h3><div id="recent" class="muted"></div></div>
  </div>
</div>

<script>
'use strict';
var S = null, B = null, lastVersion = -1, serverOk = true;
var ui = { pos: 'ALL', search: '', sortKey: 'vor', sortDir: -1, showDrafted: false };
var POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];
var ASC_DEFAULT = { rank: 1, name: 1, position: 1, team: 1, byeWeek: 1, tier: 1, ecrRank: 1, adp: 1, injuryStatus: 1 };

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });
}
function el(id) { return document.getElementById(id); }
function teamLabel(id) {
  if (id === null || id === undefined) return '?';
  if (S && id === S.league.myTeamId) return 'ME';
  return 'T' + id;
}
function num(v, digits) { return v === null || v === undefined ? '—' : Number(v).toFixed(digits); }
function pct(v) { return v === null || v === undefined ? '—' : Math.round(v * 100) + '%'; }
function timeShort(iso) { if (!iso) return '—'; return new Date(iso).toLocaleTimeString(); }
function ageSec(iso) { return iso ? Math.round((Date.now() - new Date(iso).getTime()) / 1000) : null; }

function api(path, body) {
  var opts = body === undefined ? {} :
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  return fetch(path, opts).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok && data && data.error) console.warn(path, data.error);
      return data;
    });
  });
}

function loadState() {
  return api('/api/state').then(function (s) {
    serverOk = true;
    S = s;
    var p = (s.version !== lastVersion) ?
      api('/api/board').then(function (b) { B = b; lastVersion = s.version; renderTable(); renderSide(); }) :
      Promise.resolve();
    return p.then(renderStatus);
  }).catch(function () { serverOk = false; renderStatus(); });
}

function renderStatus() {
  var pill = el('pollPill');
  if (!serverOk) {
    pill.className = 'pill err'; pill.textContent = 'SERVER DOWN'; pill.title = 'no response from local server';
    return;
  }
  if (!S) return;
  el('leagueName').textContent = S.league.name;
  var d = S.draft;
  var round = Math.ceil(d.currentOverall / S.league.size);
  el('pickNow').textContent = d.complete ? 'done' : d.currentOverall + ' (R' + round + ')';
  var onClockEl = el('onClock');
  onClockEl.textContent = d.onClockTeamId === null ? '—' : teamLabel(d.onClockTeamId);
  onClockEl.className = d.onClockTeamId === S.league.myTeamId ? 'big me' : 'big';
  el('untilMe').textContent = d.picksUntilMyTurn === null ? '—' :
    (d.picksUntilMyTurn === 0 ? 'NOW' : d.picksUntilMyTurn + '');
  el('myPicks').textContent = d.myNextPicks.length ? d.myNextPicks.join(', ') : '—';

  var poll = S.poll;
  if (!poll.enabled) { pill.className = 'pill off'; pill.textContent = 'POLL OFF'; pill.title = 'enable live poll during the draft'; }
  else if (poll.consecutiveFailures > 0) {
    pill.className = 'pill err';
    pill.textContent = 'POLL ERR x' + poll.consecutiveFailures;
    pill.title = (poll.lastError || '') + ' — last success ' + timeShort(poll.lastSuccessAt) + '; retry in ' + Math.round(poll.nextDelayMs / 1000) + 's';
  } else if (poll.lastSuccessAt) {
    var age = ageSec(poll.lastSuccessAt);
    var stale = age !== null && age > 3 * (poll.intervalMs / 1000);
    pill.className = stale ? 'pill warn' : 'pill ok';
    pill.textContent = (stale ? 'POLL STALE ' : 'POLL OK ') + age + 's';
    pill.title = 'last success ' + timeShort(poll.lastSuccessAt);
  } else { pill.className = 'pill warn'; pill.textContent = 'POLL …'; pill.title = 'no successful poll yet'; }
  el('pollToggle').checked = poll.enabled;

  var btn = el('refreshBtn');
  btn.disabled = S.ingest.running;
  btn.textContent = S.ingest.running ? 'Refreshing…' : 'Refresh data';
  btn.title = S.ingest.lastError ? ('last refresh FAILED: ' + S.ingest.lastError) :
    (S.ingest.finishedAt ? 'last refresh ' + timeShort(S.ingest.finishedAt) : 'Re-run full data ingest');

  el('asOf').textContent = 'data: ' + timeShort(S.asOf.player);
  el('asOf').title = 'players ' + (S.asOf.player || '—') + ' | market ' + (S.asOf.marketData || '—') +
    ' | projections ' + (S.asOf.seasonProjection || '—') + ' | polled picks ' + (S.asOf.draftPick || '—');
}

function viewRows() {
  if (!B) return [];
  var rows = B.rows.map(function (r) { var o = Object.assign({ drafted: false }, r); return o; });
  if (ui.showDrafted) {
    rows = rows.concat(B.drafted.map(function (r) {
      return Object.assign({ drafted: true, rank: null, pNextPick: null, pPickAfter: null }, r);
    }));
  }
  if (ui.pos !== 'ALL') rows = rows.filter(function (r) { return r.position === ui.pos; });
  var q = ui.search.trim().toLowerCase();
  if (q) rows = rows.filter(function (r) {
    return r.name.toLowerCase().indexOf(q) >= 0 || (r.team || '').toLowerCase().indexOf(q) >= 0;
  });
  var k = ui.sortKey, dir = ui.sortDir;
  rows.sort(function (a, b) {
    var av = a[k], bv = b[k];
    if (av === null || av === undefined) return (bv === null || bv === undefined) ? 0 : 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === 'string') return String(av).localeCompare(String(bv)) * dir;
    return (av - bv) * dir;
  });
  return rows;
}

function oddsClass(v) {
  if (v === null || v === undefined) return '';
  if (v >= 0.7) return 'odds-hi';
  if (v >= 0.35) return 'odds-mid';
  return 'odds-lo';
}

function renderTable() {
  if (!B || !S) return;
  el('p1h').textContent = 'P@' + (B.myNextPicks[0] !== undefined ? B.myNextPicks[0] : '?');
  el('p2h').textContent = 'P@' + (B.myNextPicks[1] !== undefined ? B.myNextPicks[1] : '?');
  var ths = document.querySelectorAll('thead th[data-k]');
  ths.forEach(function (th) { th.className = th.className.replace(' sorted', ''); if (th.dataset.k === ui.sortKey) th.className += ' sorted'; });

  var rows = viewRows();
  var shown = rows.slice(0, 300);
  el('rowCount').textContent = shown.length < rows.length ? ('showing 300 of ' + rows.length) : (rows.length + ' rows');
  var html = [];
  for (var i = 0; i < shown.length; i++) {
    var r = shown[i];
    var cls = r.drafted ? 'gone' : '';
    var tierHtml = r.tier === null ? '<span class="muted">—</span>' :
      '<span class="tier t' + (((r.tier - 1) % 7) + 1) + '">' + r.tier + '</span>';
    var injHtml = (r.injuryStatus && r.injuryStatus !== 'ACTIVE' && r.injuryStatus !== 'UNKNOWN') ?
      '<span class="inj">' + esc(r.injuryStatus.slice(0, 4)) + '</span>' : '';
    var action;
    if (r.drafted) {
      var by = '<span class="' + (r.teamId === S.league.myTeamId ? 'me' : 'muted') + '">' +
        (r.overall !== null ? r.overall + '. ' : '') + esc(teamLabel(r.teamId)) + '</span>';
      action = r.source === 'manual' ?
        by + ' <button class="act src-manual" data-act="undo" data-id="' + r.playerId + '" title="remove manual mark">undo</button>' :
        by;
      if (r.teamId === S.league.myTeamId) cls += ' mine-row';
    } else {
      action = '<button class="act" data-act="mine" data-id="' + r.playerId + '" title="drafted by me">ME</button> ' +
        '<button class="act" data-act="gone" data-id="' + r.playerId + '" title="drafted by someone else">✕</button>';
    }
    html.push('<tr class="' + cls + '">' +
      '<td>' + (r.rank === null ? '—' : r.rank) + '</td>' +
      '<td class="l">' + esc(r.name) + '</td>' +
      '<td class="l">' + r.position + '</td>' +
      '<td class="l">' + (r.team || 'FA') + '</td>' +
      '<td>' + (r.byeWeek === null ? '—' : r.byeWeek) + '</td>' +
      '<td>' + num(r.points, 1) + '</td>' +
      '<td><b>' + num(r.vor, 1) + '</b></td>' +
      '<td>' + tierHtml + '</td>' +
      '<td>' + (r.ecrRank === null ? '—' : r.ecrRank) + '</td>' +
      '<td>' + num(r.adp, 1) + '</td>' +
      '<td class="l">' + injHtml + '</td>' +
      '<td class="' + oddsClass(r.pNextPick) + '">' + pct(r.pNextPick) + '</td>' +
      '<td class="' + oddsClass(r.pPickAfter) + '">' + pct(r.pPickAfter) + '</td>' +
      '<td class="l">' + action + '</td>' +
      '</tr>');
  }
  el('rows').innerHTML = html.length ? html.join('') : '<tr><td colspan="14" class="l muted">no rows</td></tr>';
}

function renderSide() {
  if (!S) return;
  el('rosterTitle').textContent = 'My roster — slot ' + S.league.mySlot + ' (team ' + S.league.myTeamId + ')';
  var html = [];
  S.myRoster.slots.forEach(function (slot) {
    var names = slot.players.map(function (p) {
      return esc(p.name) + ' <span class="muted">' + (p.team || 'FA') + (p.byeWeek ? ' b' + p.byeWeek : '') + '</span>';
    });
    html.push('<div class="slot-row"><span class="slot-name">' + slot.slot + ' ' + slot.players.length + '/' + slot.capacity +
      '</span><span>' + (names.length ? names.join(', ') : '<span class="muted">—</span>') + '</span></div>');
  });
  html.push('<div class="muted" style="margin-top:4px">open starters: ' + S.myRoster.openStarters +
    ' · open total: ' + S.myRoster.totalOpen + '</div>');
  el('roster').innerHTML = html.join('');

  var byes = S.myRoster.byeCollisions.map(function (c) {
    return '<div class="warn-text">bye W' + c.byeWeek + ': ' + esc(c.players.join(', ')) + '</div>';
  });
  el('byes').innerHTML = byes.join('');

  el('scarcity').innerHTML = (B ? B.scarcity : []).map(function (s) {
    var tone = s.remaining <= 2 ? ' class="warn-text"' : '';
    return '<div' + tone + '>' + s.position + ' T' + s.tier + ': ' + s.remaining + ' left</div>';
  }).join('') || '—';

  var recent = S.picks.slice(-8).reverse().map(function (p) {
    var who = '<span class="' + (p.teamId === S.league.myTeamId ? 'me' : '') + '">' + teamLabel(p.teamId) + '</span>';
    var n = p.overall !== null ? p.overall : 'M';
    return '<div>' + n + '. ' + who + ' — ' + esc(p.name) + ' <span class="muted">' + p.position + '</span>' +
      (p.source === 'manual' ? ' <span class="src-manual">manual</span>' : '') + '</div>';
  });
  el('recent').innerHTML = recent.length ? recent.join('') : 'none yet';
}

// -- wiring -----------------------------------------------------------------
el('tabs').innerHTML = POSITIONS.map(function (p) {
  return '<button class="tab' + (p === ui.pos ? ' active' : '') + '" data-pos="' + p + '">' + p + '</button>';
}).join('');
el('tabs').addEventListener('click', function (e) {
  var pos = e.target.dataset && e.target.dataset.pos;
  if (!pos) return;
  ui.pos = pos;
  el('tabs').querySelectorAll('.tab').forEach(function (b) { b.className = 'tab' + (b.dataset.pos === pos ? ' active' : ''); });
  renderTable();
});
el('search').addEventListener('input', function (e) { ui.search = e.target.value; renderTable(); });
el('showDrafted').addEventListener('change', function (e) { ui.showDrafted = e.target.checked; renderTable(); });
document.querySelector('thead').addEventListener('click', function (e) {
  var k = e.target.dataset && e.target.dataset.k;
  if (!k) return;
  if (ui.sortKey === k) ui.sortDir = -ui.sortDir;
  else { ui.sortKey = k; ui.sortDir = ASC_DEFAULT[k] ? 1 : -1; }
  renderTable();
});
el('rows').addEventListener('click', function (e) {
  var t = e.target;
  if (!t.dataset || !t.dataset.act) return;
  var id = t.dataset.id;
  var req;
  if (t.dataset.act === 'mine') req = api('/api/mark', { playerId: id, teamId: S.league.myTeamId });
  else if (t.dataset.act === 'gone') req = api('/api/mark', { playerId: id, teamId: 'unknown' });
  else req = api('/api/unmark', { playerId: id });
  req.then(loadState);
});
el('pollToggle').addEventListener('change', function (e) {
  api('/api/poll', { enabled: e.target.checked }).then(loadState);
});
el('refreshBtn').addEventListener('click', function () {
  el('refreshBtn').disabled = true;
  api('/api/refresh', {}).then(loadState);
});

setInterval(loadState, 2000);
loadState();
</script>
</body>
</html>
`
