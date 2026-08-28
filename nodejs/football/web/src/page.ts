/**
 * The board page, embedded as a string so it ships identically under tsx and the bundler.
 * Constraint of the embedding: the client code below uses no backtick and no dollar-brace
 * sequences (it is itself inside a template literal).
 *
 * Look and feel ports the grinbox web app's design tokens (nodejs/grinbox/web/src/index.css):
 * zinc neutrals + violet primary in oklch, light/dark via prefers-color-scheme, Inter/JetBrains
 * Mono stacks, 0.5rem card radius, hairline borders, tinted 15%-alpha chips, dot+label status
 * indicators on the emerald/amber/red semantic tokens.
 */
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Draft Board</title>
<style>
  :root {
    --radius: 0.5rem;
    --background: oklch(0.985 0 0);
    --foreground: oklch(0.21 0.006 285.885);
    --card: oklch(1 0 0);
    --muted: oklch(0.967 0.001 286.375);
    --muted-fg: oklch(0.552 0.016 285.938);
    --border: oklch(0.92 0.004 286.32);
    --input-bg: oklch(1 0 0);
    --primary: oklch(0.606 0.25 292.717);
    --primary-fg: oklch(0.985 0 0);
    --success: oklch(0.696 0.17 162.48);
    --warning: oklch(0.769 0.188 70.08);
    --danger: oklch(0.637 0.237 25.331);
    --row-hover: oklch(0.967 0.001 286.375 / 60%);
    --chip-text-mix: black;
    --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
    --c-emerald: #10b981; --c-teal: #14b8a6; --c-sky: #0ea5e9; --c-indigo: #6366f1;
    --c-violet: #8b5cf6; --c-amber: #f59e0b; --c-rose: #f43f5e; --c-zinc: #71717a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: oklch(0.141 0.005 285.823);
      --foreground: oklch(0.985 0 0);
      --card: oklch(0.21 0.006 285.885);
      --muted: oklch(0.274 0.006 286.033);
      --muted-fg: oklch(0.705 0.015 286.067);
      --border: oklch(1 0 0 / 10%);
      --input-bg: oklch(0.274 0.006 286.033);
      --primary: oklch(0.541 0.281 293.009);
      --danger: oklch(0.704 0.191 22.216);
      --row-hover: oklch(0.274 0.006 286.033 / 60%);
      --chip-text-mix: white;
    }
  }

  * { box-sizing: border-box; border-color: var(--border); }
  body { margin: 0; background: var(--background); color: var(--foreground);
    font: 13px/1.4 var(--font-sans); -webkit-font-smoothing: antialiased; }
  button { font: inherit; font-weight: 500; cursor: pointer; background: var(--muted); color: var(--foreground);
    border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); padding: 2px 10px; }
  button:hover { border-color: var(--primary); }
  button:disabled { opacity: 0.45; cursor: default; }
  input[type=text] { background: var(--input-bg); color: var(--foreground); border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px); padding: 3px 10px; width: 220px; font: inherit; }
  input[type=text]:focus { outline: 2px solid var(--primary); outline-offset: -1px; }
  label { color: var(--muted-fg); }
  .mono { font-family: var(--font-mono); }
  .muted { color: var(--muted-fg); }

  #status { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center;
    background: var(--card); border-bottom: 1px solid var(--border); padding: 8px 14px; }
  #status .big { font-size: 15px; font-weight: 600; }
  #status .lbl { color: var(--muted-fg); margin-right: 5px; font-size: 12px; }
  .me { color: var(--primary); font-weight: 600; }
  .spacer { flex: 1; }

  .cap-bar { display: inline-block; width: 64px; height: 6px; border-radius: 999px; background: var(--muted);
    overflow: hidden; vertical-align: 2px; margin-left: 6px; }
  .cap-fill { display: block; height: 100%; width: 0; border-radius: 999px; background: var(--primary);
    transition: width 300ms; }

  .ind { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; }
  .ind .dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; background: var(--muted-fg); }
  .ind.ok .dot { background: var(--success); } .ind.ok { color: var(--success); }
  .ind.warn .dot { background: var(--warning); } .ind.warn { color: var(--warning); }
  .ind.err .dot { background: var(--danger); } .ind.err { color: var(--danger); }
  .ind.off { color: var(--muted-fg); }

  #layout { display: flex; gap: 12px; padding: 12px 14px; align-items: flex-start; }
  #main { flex: 1; min-width: 0; }
  #side { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
  .card h3 { margin: 0 0 6px; font-size: 11px; font-weight: 500; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--muted-fg); }

  .chip { display: inline-block; padding: 0 7px; border-radius: 999px; font-size: 11px; font-weight: 600;
    line-height: 17px; }
  .tier-chip { min-width: 22px; text-align: center; }

  #controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 8px; }
  .tab { padding: 2px 10px; border-radius: 999px; background: transparent; }
  .tab.active { background: var(--primary); color: var(--primary-fg); border-color: var(--primary); font-weight: 600; }

  table { border-collapse: separate; border-spacing: 0; width: 100%; background: var(--card);
    border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  thead th { position: sticky; top: 48px; z-index: 5; background: var(--card); color: var(--muted-fg);
    font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;
    padding: 6px; text-align: right; cursor: pointer; user-select: none; white-space: nowrap;
    border-bottom: 1px solid var(--border); }
  thead th.l { text-align: left; }
  thead th.sorted { color: var(--primary); }
  tbody td { padding: 3px 6px; text-align: right; border-bottom: 1px solid var(--border); white-space: nowrap;
    font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: none; }
  tbody td.l { text-align: left; }
  tbody tr:hover { background: var(--row-hover); }
  tr.gone td { text-decoration: line-through; color: var(--muted-fg); }
  tr.ban td { opacity: 0.5; }
  tr.mine-row td { background: color-mix(in oklab, var(--primary) 8%, transparent); }
  .inj { color: var(--danger); font-weight: 600; }
  .odds-hi { color: var(--success); } .odds-mid { color: var(--warning); } .odds-lo { color: var(--danger); }
  .delta-pos { color: var(--success); } .delta-neg { color: var(--danger); }
  .ups-hi { color: var(--primary); font-weight: 600; }
  .mark-boost { color: var(--primary); font-weight: 700; cursor: help; }
  .mark-contested { color: var(--warning); font-weight: 700; cursor: help; padding: 0 2px; }
  .src-manual { color: var(--warning); }
  .warn-text { color: var(--warning); }
  .slot-row { display: flex; gap: 6px; padding: 1px 0; }
  .slot-name { width: 56px; color: var(--muted-fg); flex-shrink: 0; }
  #recent div { padding: 1px 0; }

  #clockPanel { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary),
    0 0 24px color-mix(in oklab, var(--primary) 25%, transparent); margin-bottom: 12px; }
  .clock-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .clock-title { font-size: 14px; font-weight: 700; letter-spacing: 0.06em; color: var(--primary); }
  .dot-pulse { width: 10px; height: 10px; border-radius: 999px; background: var(--primary);
    animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  #clockPanel table { border: none; border-radius: 0; }
  #clockPanel thead th { position: static; }
  #clockPanel td.est { font-family: var(--font-mono); font-weight: 600; }
  #clockPanel td.delta { font-family: var(--font-mono); font-weight: 700; font-size: 13px; }
  tr.best td { background: color-mix(in oklab, var(--primary) 10%, transparent); }
  .best-tag { color: var(--primary); font-weight: 700; }
  #fallsPanel { margin-bottom: 12px; padding: 6px 12px; font-size: 12px; color: var(--muted-fg); }
  #fallsPanel b { color: var(--foreground); font-weight: 600; }
</style>
</head>
<body>
<div id="status">
  <span class="big" id="leagueName">…</span>
  <span><span class="lbl">pick</span><span class="big" id="pickNow">—</span></span>
  <span><span class="lbl">on clock</span><span class="big" id="onClock">—</span></span>
  <span><span class="lbl">you in</span><span class="big" id="untilMe">—</span></span>
  <span><span class="lbl">your picks</span><span id="myPicks">—</span></span>
  <span id="captureWrap" title=""><span class="lbl">capture</span><span class="big mono" id="captureVal">—</span><span class="cap-bar"><span class="cap-fill" id="captureFill"></span></span></span>
  <span class="spacer"></span>
  <span class="ind off" id="pollPill" title=""><span class="dot"></span><span id="pollLabel">POLL</span></span>
  <label><input type="checkbox" id="pollToggle"> live poll</label>
  <button id="refreshBtn" title="Re-run full data ingest">Refresh data</button>
  <label><input type="checkbox" id="showDrafted"> show drafted</label>
  <span class="muted" id="asOf" title="">data: —</span>
</div>

<div id="layout">
  <div id="main">
    <div id="clockPanel" class="card" style="display:none">
      <div class="clock-head">
        <span class="dot-pulse"></span>
        <span class="clock-title">YOU ARE ON THE CLOCK</span>
        <span class="muted" id="clockPick"></span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="l">Player</th><th class="l">Pos</th><th>Tier</th>
            <th title="Projected final starter total if you take him now">Est team</th>
            <th title="Est team minus the best candidate's — the decision column">Δ best</th>
            <th class="l" title="Lineup slot he lands on in the projected final roster">Lands</th>
            <th title="Upside score 0–100">UPS</th>
            <th id="backH" title="Odds he is still there at your next turn if you pass">Back@—</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="clockRows"></tbody>
      </table>
    </div>
    <div id="fallsPanel" class="card" style="display:none"></div>
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
          <th data-k="roomDelta" title="Room delta: ESPN room ADP minus market ADP; positive = the room lets him fall">Rm Δ</th>
          <th data-k="upsideScore" title="Upside score 0–100">UPS</th>
          <th data-k="injuryStatus" class="l">Inj</th>
          <th data-k="pNextPick" id="p1h">P@?</th>
          <th data-k="pPickAfter" id="p2h">P@?</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="rows"><tr><td colspan="16" class="l muted">loading…</td></tr></tbody>
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
var S = null, B = null, E = null, lastVersion = -1, serverOk = true;
var ui = { pos: 'ALL', search: '', sortKey: 'vor', sortDir: -1, showDrafted: false };
var POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];
var ASC_DEFAULT = { rank: 1, name: 1, position: 1, team: 1, byeWeek: 1, tier: 1, ecrRank: 1, adp: 1, injuryStatus: 1 };
var TIER_COLORS = ['--c-emerald', '--c-teal', '--c-sky', '--c-indigo', '--c-violet', '--c-amber', '--c-rose'];

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
function signed(v, digits) {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + Number(v).toFixed(digits);
}
function pct(v) { return v === null || v === undefined ? '—' : Math.round(v * 100) + '%'; }
function timeShort(iso) { if (!iso) return '—'; return new Date(iso).toLocaleTimeString(); }
function ageSec(iso) { return iso ? Math.round((Date.now() - new Date(iso).getTime()) / 1000) : null; }

// Tinted chip in the grinbox tag-chip style: 15%-alpha background, mode-adjusted text.
function chip(text, colorVar, extraClass, title) {
  var c = 'var(' + colorVar + ')';
  return '<span class="chip ' + (extraClass || '') + '" ' + (title ? 'title="' + esc(title) + '" ' : '') +
    'style="background: color-mix(in oklab, ' + c + ' 15%, transparent); ' +
    'color: color-mix(in oklab, ' + c + ' 65%, var(--chip-text-mix));">' + text + '</span>';
}
function tierChip(tier) {
  if (tier === null || tier === undefined) return '<span class="muted">—</span>';
  var colorVar = TIER_COLORS[(tier - 1) % 7] || '--c-zinc';
  return chip(String(tier), colorVar, 'tier-chip');
}
function nameMarkers(r, boosted) {
  var m = '';
  if (boosted) m += ' <span class="mark-boost" title="boosted via overrides.json">▲</span>';
  if (r.contested) m += ' <span class="mark-contested" title="sources disagree: spread ' +
    num(r.residualSpread, 1) + ' pts across ' + (r.sourceCount || '?') + ' sources">!</span>';
  if (r.banned) m += ' ' + chip('BAN', '--c-rose', '', 'banned via overrides.json — excluded from recommendations');
  return m;
}

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
      Promise.all([api('/api/board'), api('/api/evaluate')]).then(function (res) {
        B = res[0]; E = res[1]; lastVersion = s.version;
        renderTable(); renderSide(); renderClock();
      }) :
      Promise.resolve();
    return p.then(renderStatus);
  }).catch(function () { serverOk = false; renderStatus(); });
}

function setInd(cls, text, title) {
  var pill = el('pollPill');
  pill.className = 'ind ' + cls;
  pill.title = title || '';
  el('pollLabel').textContent = text;
}

function renderStatus() {
  if (!serverOk) { setInd('err', 'SERVER DOWN', 'no response from local server'); return; }
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

  var cap = S.capture;
  if (cap) {
    el('captureVal').textContent = pct(cap.ratio);
    el('captureFill').style.width = Math.max(0, Math.min(100, Math.round(cap.ratio * 100))) + '%';
    el('captureWrap').title = 'draft grade: (team ' + num(cap.teamTotal, 1) +
      ' − repl ' + num(cap.benchmarks.replacement, 1) + ') / (ceiling ' + num(cap.benchmarks.ceiling, 1) +
      ' − repl ' + num(cap.benchmarks.replacement, 1) + ')';
  }

  var poll = S.poll;
  if (!poll.enabled) setInd('off', 'POLL OFF', 'enable live poll during the draft');
  else if (poll.consecutiveFailures > 0) {
    setInd('err', 'POLL ERR x' + poll.consecutiveFailures,
      (poll.lastError || '') + ' — last success ' + timeShort(poll.lastSuccessAt) +
      '; retry in ' + Math.round(poll.nextDelayMs / 1000) + 's');
  } else if (poll.lastSuccessAt) {
    var age = ageSec(poll.lastSuccessAt);
    var stale = age !== null && age > 3 * (poll.intervalMs / 1000);
    setInd(stale ? 'warn' : 'ok', (stale ? 'POLL STALE ' : 'POLL OK ') + age + 's',
      'last success ' + timeShort(poll.lastSuccessAt));
  } else setInd('warn', 'POLL …', 'no successful poll yet');
  el('pollToggle').checked = poll.enabled;

  var btn = el('refreshBtn');
  btn.disabled = S.ingest.running;
  btn.textContent = S.ingest.running ? 'Refreshing…' : 'Refresh data';
  btn.title = S.ingest.lastError ? ('last refresh FAILED: ' + S.ingest.lastError) :
    (S.ingest.finishedAt ? 'last refresh ' + timeShort(S.ingest.finishedAt) : 'Re-run full data ingest');

  var ovr = S.overrides;
  var ovrText = '';
  if (ovr && ovr.error) ovrText = ' | overrides FAILED: ' + ovr.error;
  else if (ovr && ovr.count) ovrText = ' | overrides: ' + ovr.boosted + ' boost, ' + ovr.banned + ' ban';
  el('asOf').textContent = 'data: ' + timeShort(S.asOf.player) + (ovr && ovr.error ? ' ⚠' : '');
  el('asOf').title = 'players ' + (S.asOf.player || '—') + ' | market ' + (S.asOf.marketData || '—') +
    ' | projections ' + (S.asOf.seasonProjection || '—') + ' | polled picks ' + (S.asOf.draftPick || '—') + ovrText;
}

function renderClock() {
  var clock = el('clockPanel'), falls = el('fallsPanel');
  if (!S || !E || S.draft.complete || !E.candidates.length) {
    clock.style.display = 'none'; falls.style.display = 'none';
    return;
  }
  if (E.myTurn) {
    falls.style.display = 'none';
    clock.style.display = '';
    var nextTurn = E.myNextPicks[1];
    el('clockPick').textContent = 'pick ' + E.currentOverall +
      ' (R' + Math.ceil(E.currentOverall / S.league.size) + ')' +
      (nextTurn ? ' — your next turn is ' + nextTurn : '');
    el('backH').textContent = 'Back@' + (nextTurn || '—');
    var html = [];
    var top = E.candidates.slice(0, 10);
    for (var i = 0; i < top.length; i++) {
      var c = top[i];
      var best = c.deltaVsBest === 0;
      var bench = c.landsOn === 'BENCH';
      html.push('<tr class="' + (best ? 'best' : '') + '">' +
        '<td class="l"><b>' + esc(c.name) + '</b>' + (c.boosted ? ' <span class="mark-boost" title="boosted via overrides.json">▲</span>' : '') + '</td>' +
        '<td class="l">' + c.position + '</td>' +
        '<td>' + tierChip(c.tier) + '</td>' +
        '<td class="est">' + num(c.estTeamScore, 1) + '</td>' +
        '<td class="delta">' + (best ? '<span class="best-tag">BEST</span>' : num(c.deltaVsBest, 1)) + '</td>' +
        '<td class="l' + (bench ? ' muted' : '') + '">' + c.landsOn + '</td>' +
        '<td class="' + (bench ? 'ups-hi' : '') + '">' + (c.upsideScore === null ? '—' : Math.round(c.upsideScore)) + '</td>' +
        '<td class="' + oddsClass(c.pPickAfter) + '">' + pct(c.pPickAfter) + '</td>' +
        '<td class="l"><button class="act" data-act="mine" data-id="' + c.playerId + '" title="draft him">ME</button></td>' +
        '</tr>');
    }
    el('clockRows').innerHTML = html.join('');
  } else {
    clock.style.display = 'none';
    falls.style.display = '';
    var entries = E.candidates.slice(0, 3).map(function (c) {
      return '<b>' + esc(c.name) + '</b> <span class="muted">' + c.position + '</span> ' +
        'est <span class="mono">' + num(c.estTeamScore, 1) + '</span> ' +
        '<span class="' + oddsClass(c.pNextPick) + '">' + pct(c.pNextPick) + ' back</span>';
    });
    falls.innerHTML = 'IF HE FALLS TO YOU @' + (E.myNextPicks[0] || '?') + ' — ' + entries.join(' &nbsp;·&nbsp; ');
  }
}

function viewRows() {
  if (!B) return [];
  var rows = B.rows.map(function (r) { var o = Object.assign({ drafted: false }, r); return o; });
  if (ui.showDrafted) {
    rows = rows.concat(B.drafted.map(function (r) {
      return Object.assign({
        drafted: true, rank: null, pNextPick: null, pPickAfter: null,
        roomDelta: null, upsideScore: null, residualSpread: null, contested: false, banned: false,
      }, r);
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
function deltaClass(v) {
  if (v === null || v === undefined || Math.abs(v) < 1) return 'muted';
  return v > 0 ? 'delta-pos' : 'delta-neg';
}

function renderTable() {
  if (!B || !S) return;
  el('p1h').textContent = 'P@' + (B.myNextPicks[0] !== undefined ? B.myNextPicks[0] : '?');
  el('p2h').textContent = 'P@' + (B.myNextPicks[1] !== undefined ? B.myNextPicks[1] : '?');
  var ths = document.querySelectorAll('thead th[data-k]');
  ths.forEach(function (th) { th.className = th.className.replace(' sorted', ''); if (th.dataset.k === ui.sortKey) th.className += ' sorted'; });

  var boosted = {};
  (B.boostedIds || []).forEach(function (id) { boosted[id] = true; });
  var rows = viewRows();
  var shown = rows.slice(0, 300);
  el('rowCount').textContent = shown.length < rows.length ? ('showing 300 of ' + rows.length) : (rows.length + ' rows');
  var html = [];
  for (var i = 0; i < shown.length; i++) {
    var r = shown[i];
    var cls = r.drafted ? 'gone' : '';
    if (r.banned) cls += ' ban';
    var injHtml = (r.injuryStatus && r.injuryStatus !== 'ACTIVE' && r.injuryStatus !== 'UNKNOWN') ?
      '<span class="inj">' + esc(r.injuryStatus.slice(0, 4)) + '</span>' : '';
    var roomTitle = r.roomAdp !== null && r.adp !== null ?
      'room ADP ' + num(r.roomAdp, 1) + ' vs market ' + num(r.adp, 1) : '';
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
      '<td class="l">' + esc(r.name) + nameMarkers(r, boosted[r.playerId]) + '</td>' +
      '<td class="l">' + r.position + '</td>' +
      '<td class="l">' + (r.team || 'FA') + '</td>' +
      '<td>' + (r.byeWeek === null ? '—' : r.byeWeek) + '</td>' +
      '<td>' + num(r.points, 1) + '</td>' +
      '<td><b>' + num(r.vor, 1) + '</b></td>' +
      '<td>' + tierChip(r.tier) + '</td>' +
      '<td>' + (r.ecrRank === null ? '—' : r.ecrRank) + '</td>' +
      '<td>' + num(r.adp, 1) + '</td>' +
      '<td class="' + deltaClass(r.roomDelta) + '" title="' + roomTitle + '">' + signed(r.roomDelta, 1) + '</td>' +
      '<td class="' + (r.upsideScore !== null && r.upsideScore >= 80 ? 'ups-hi' : '') + '">' +
        (r.upsideScore === null ? '—' : Math.round(r.upsideScore)) + '</td>' +
      '<td class="l">' + injHtml + '</td>' +
      '<td class="' + oddsClass(r.pNextPick) + '">' + pct(r.pNextPick) + '</td>' +
      '<td class="' + oddsClass(r.pPickAfter) + '">' + pct(r.pPickAfter) + '</td>' +
      '<td class="l">' + action + '</td>' +
      '</tr>');
  }
  el('rows').innerHTML = html.length ? html.join('') : '<tr><td colspan="16" class="l muted">no rows</td></tr>';
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
document.querySelector('#main > table thead').addEventListener('click', function (e) {
  var k = e.target.dataset && e.target.dataset.k;
  if (!k) return;
  if (ui.sortKey === k) ui.sortDir = -ui.sortDir;
  else { ui.sortKey = k; ui.sortDir = ASC_DEFAULT[k] ? 1 : -1; }
  renderTable();
});
function actClick(e) {
  var t = e.target;
  if (!t.dataset || !t.dataset.act) return;
  var id = t.dataset.id;
  var req;
  if (t.dataset.act === 'mine') req = api('/api/mark', { playerId: id, teamId: S.league.myTeamId });
  else if (t.dataset.act === 'gone') req = api('/api/mark', { playerId: id, teamId: 'unknown' });
  else req = api('/api/unmark', { playerId: id });
  req.then(loadState);
}
el('rows').addEventListener('click', actClick);
el('clockRows').addEventListener('click', actClick);
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
