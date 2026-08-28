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
  html, body { height: 100%; }
  body { margin: 0; background: var(--background); color: var(--foreground);
    font: 15px/1.4 var(--font-sans); -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column; overflow: hidden; }
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

  #status { flex-shrink: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center;
    background: var(--card); border-bottom: 1px solid var(--border); padding: 8px 14px; }
  #status .big { font-size: 17px; font-weight: 600; }
  #status .lbl { color: var(--muted-fg); margin-right: 5px; font-size: 14px; }
  .me { color: var(--primary); font-weight: 600; }
  .spacer { flex: 1; }

  .cap-bar { display: inline-block; width: 64px; height: 6px; border-radius: 999px; background: var(--muted);
    overflow: hidden; vertical-align: 2px; margin-left: 6px; }
  .cap-fill { display: block; height: 100%; width: 0; border-radius: 999px; background: var(--primary);
    transition: width 300ms; }

  .ind { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; }
  .ind .dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; background: var(--muted-fg); }
  .ind.ok .dot { background: var(--success); } .ind.ok { color: var(--success); }
  .ind.warn .dot { background: var(--warning); } .ind.warn { color: var(--warning); }
  .ind.err .dot { background: var(--danger); } .ind.err { color: var(--danger); }
  .ind.off { color: var(--muted-fg); }

  /* Viewport-locked layout: the chrome stays put, the board table scrolls inside #tscroll. */
  #layout { display: flex; gap: 12px; padding: 12px 14px; flex: 1; min-height: 0; }
  #main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
  #side { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px;
    overflow-y: auto; max-height: 100%; }
  #tscroll { flex: 1; min-height: 0; overflow-y: auto; background: var(--card);
    border: 1px solid var(--border); border-radius: var(--radius); }
  #tscroll table { border: none; border-radius: 0; overflow: visible; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
  .card h3 { margin: 0 0 6px; font-size: 13px; font-weight: 500; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--muted-fg); }

  .chip { display: inline-block; padding: 0 7px; border-radius: 999px; font-size: 13px; font-weight: 600;
    line-height: 17px; }

  #controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 8px; }
  .tab { padding: 2px 10px; border-radius: 999px; background: transparent; }
  .tab.active { background: var(--primary); color: var(--primary-fg); border-color: var(--primary); font-weight: 600; }

  table { border-collapse: separate; border-spacing: 0; width: 100%; background: var(--card);
    border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  /* Sticky inside #tscroll: top 0, opaque card surface, above row content at every scroll offset. */
  thead th { position: sticky; top: 0; z-index: 5; background: var(--card); color: var(--muted-fg);
    font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;
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
  /* Rm Δ bands: how the room's board prices him vs the wider market. */
  td.rm { cursor: help; text-align: center; letter-spacing: -1px; }
  .rm0 { color: var(--muted-fg); }
  .rm1up { color: var(--success); } .rm2up { color: var(--success); font-weight: 700; }
  .rm1dn { color: var(--warning); } .rm2dn { color: var(--danger); font-weight: 700; }
  .ups-hi { color: var(--primary); font-weight: 600; }
  .pbest { font-size: 11px; color: var(--muted-fg); cursor: help; }
  .mark-boost { color: var(--primary); font-weight: 700; cursor: help; }
  .mark-contested { color: var(--warning); font-weight: 700; cursor: help; padding: 0 2px; }
  .src-manual { color: var(--warning); }
  .warn-text { color: var(--warning); }
  .slot-row { display: flex; gap: 6px; padding: 1px 0; }
  .slot-name { width: 56px; color: var(--muted-fg); flex-shrink: 0; }
  #recent div { padding: 1px 0; }
  .wait-row { display: flex; gap: 8px; padding: 1px 0; align-items: baseline; font-variant-numeric: tabular-nums; }
  .wait-pos { width: 28px; color: var(--muted-fg); flex-shrink: 0; }
  .wait-cell { cursor: help; }

  #clockPanel { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary),
    0 0 24px color-mix(in oklab, var(--primary) 25%, transparent); margin-bottom: 12px; }
  .clock-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .clock-title { font-size: 16px; font-weight: 700; letter-spacing: 0.06em; color: var(--primary); }
  .dot-pulse { width: 10px; height: 10px; border-radius: 999px; background: var(--primary);
    animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  #clockPanel table { border: none; border-radius: 0; }
  #clockPanel thead th { position: static; }
  #clockPanel td.est { font-family: var(--font-mono); font-weight: 600; }
  #clockPanel td.delta { font-family: var(--font-mono); font-weight: 700; font-size: 15px; }
  tr.best td { background: color-mix(in oklab, var(--primary) 10%, transparent); }
  .best-tag { color: var(--success); font-weight: 700; }
  #fallsPanel { margin-bottom: 12px; padding: 6px 12px; font-size: 14px; color: var(--muted-fg); }
  #fallsPanel b { color: var(--foreground); font-weight: 600; }

  .btn-violet { background: transparent; border-color: var(--primary); color: var(--primary); }
  #mockBanner { display: none; position: sticky; top: 0; z-index: 30; align-items: center; gap: 12px;
    height: 36px; padding: 0 14px; font-weight: 600;
    background: color-mix(in oklab, var(--warning) 20%, var(--background));
    border-bottom: 2px solid var(--warning); }
  #mockBanner .mock-title { color: var(--warning); letter-spacing: 0.08em; font-weight: 800; }
  #mockCountdown { font-weight: 700; }
  #mockCountdown.cd-expired { color: var(--danger); }
  #mockBanner { flex-shrink: 0; }
  #recapPanel { border-color: var(--warning); margin-bottom: 12px; }
  #recapPanel .recap-cap { font-size: 16px; margin-bottom: 6px; }

  /* News dots: direction = color, impact = weight (low subtle, med ringed, high larger + saturated). */
  .ndot { display: inline-block; width: 8px; height: 8px; border-radius: 999px; margin-right: 5px;
    flex-shrink: 0; }
  .nd-harms { background: var(--danger); }
  .nd-improves { background: var(--success); }
  .nd-unclear { background: var(--muted-fg); }
  .nd-low { opacity: 0.4; }
  .nd-med { opacity: 0.85; }
  .nd-med.nd-harms { box-shadow: 0 0 0 2px color-mix(in oklab, var(--danger) 30%, transparent); }
  .nd-med.nd-improves { box-shadow: 0 0 0 2px color-mix(in oklab, var(--success) 30%, transparent); }
  .nd-med.nd-unclear { box-shadow: 0 0 0 2px color-mix(in oklab, var(--muted-fg) 30%, transparent); }
  .nd-high { width: 10px; height: 10px; }
  .pname { cursor: pointer; }
  .pname:hover { color: var(--primary); text-decoration: underline; }

  /* Threat markers: amber → red escalation on the P@ columns. */
  .thr { font-weight: 700; cursor: help; margin-left: 3px; }
  .thr1 { color: var(--warning); }
  .thr2 { color: color-mix(in oklab, var(--warning) 45%, var(--danger)); }
  .thr3 { color: var(--danger); }
  #clockThreats { margin-top: 6px; font-size: 14px; color: var(--muted-fg); }
  #clockThreats b { color: var(--foreground); }
  .kd-nudge { margin-top: 8px; padding: 6px 10px; border-radius: calc(var(--radius) - 2px); font-weight: 600; }
  .kd-amber { background: color-mix(in oklab, var(--warning) 15%, transparent); color: var(--warning); }
  .kd-red { background: color-mix(in oklab, var(--danger) 15%, transparent); color: var(--danger); }
  .kd-nudge .kd-row { font-weight: 400; color: var(--foreground); margin-top: 4px; }

  /* News drawer */
  #drawerBack { display: none; position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.35); }
  #drawer { display: none; position: fixed; top: 0; right: 0; bottom: 0; width: 440px; max-width: 92vw;
    z-index: 41; background: var(--card); border-left: 1px solid var(--border);
    box-shadow: -12px 0 32px rgba(0, 0, 0, 0.25); flex-direction: column; }
  body.drawer-open #drawer { display: flex; }
  body.drawer-open #drawerBack { display: block; }
  .drawer-head { padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .drawer-title { display: flex; align-items: center; gap: 8px; }
  .drawer-title b { font-size: 17px; }
  .drawer-body { flex: 1; overflow-y: auto; padding: 10px 14px; }
  .drawer-foot { padding: 10px 14px; border-top: 1px solid var(--border); flex-shrink: 0;
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .news-item { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 10px;
    margin-bottom: 8px; }
  .news-sum { font-size: 15px; font-weight: 600; margin: 6px 0 4px; }
  .news-hl { font-size: 14px; color: var(--muted-fg); }
  .news-item details { margin-top: 6px; }
  .news-item summary { cursor: pointer; color: var(--muted-fg); font-size: 14px; }
  .news-item details p { margin: 6px 0 0; font-size: 14px; line-height: 1.5; }
  .news-unassessed { padding: 3px 0; font-size: 14px; color: var(--muted-fg); }
  .btn-danger { background: transparent; border-color: var(--danger); color: var(--danger); }
</style>
</head>
<body>
<div id="mockBanner">
  <span class="mock-title">MOCK DRAFT</span>
  <span>nothing is saved — stopping (or a server restart) discards it</span>
  <span class="mono muted" id="mockInfo"></span>
  <span id="mockCountdown" class="mono"></span>
  <span class="spacer"></span>
  <button id="mockAdvance" style="display:none" title="Run opponent picks up to your turn">Advance</button>
  <button id="mockStop" title="End the mock and discard every mock pick">Stop</button>
</div>
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
  <button id="mockBtn" class="btn-violet" title="Practice against a simulated room — nothing is saved">Mock draft</button>
  <button id="resetManualBtn" title="Delete every manual mark">Reset manual</button>
  <button id="refreshBtn" title="Re-run full data ingest">Refresh data</button>
  <label><input type="checkbox" id="showDrafted"> show drafted</label>
  <span class="muted" id="asOf" title="">data: —</span>
</div>

<div id="layout">
  <div id="main">
    <div id="recapPanel" class="card" style="display:none"></div>
    <div id="clockPanel" class="card" style="display:none">
      <div class="clock-head">
        <span class="dot-pulse"></span>
        <span class="clock-title">YOU ARE ON THE CLOCK</span>
        <span class="muted" id="clockPick"></span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="l">Player</th><th class="l">Pos</th>
            <th title="Projected final starter total if you take him now (Monte Carlo mean over sampled drafts)">Est team</th>
            <th title="Est team minus the best candidate's: green = within 3 pts (rollout noise — effectively tied, break the tie on Back@), amber = real but modest cost (3–15 pts), muted = expensive (>15 pts). The small % is P(best): the share of sampled drafts where this pick's final team scores highest">Δ best</th>
            <th class="l" title="Lineup slot he lands on in the projected final roster">Lands</th>
            <th title="FantasyPros expert consensus rank — the independent audit signal; hover a value for room ADP">ECR</th>
            <th title="Upside score 0–100">UPS</th>
            <th id="backH" title="Odds he is still there at your next turn if you pass">Back@—</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="clockRows"></tbody>
      </table>
      <div id="clockThreats"></div>
      <div id="kdNudge" style="display:none"></div>
    </div>
    <div id="fallsPanel" class="card" style="display:none"></div>
    <div id="controls">
      <span id="tabs"></span>
      <input type="text" id="search" placeholder="search player / team">
      <span class="muted" id="rowCount"></span>
    </div>
    <div id="tscroll">
    <table>
      <thead>
        <tr>
          <th data-k="rank">#</th>
          <th data-k="newsSev" title="Assessed news — worst direction × impact (sorts harms/high first); click a dot for the stories">N</th>
          <th data-k="name" class="l">Player</th>
          <th data-k="position" class="l">Pos</th>
          <th data-k="team" class="l">Team</th>
          <th data-k="byeWeek">Bye</th>
          <th data-k="points">Pts</th>
          <th data-k="vor">VOR</th>
          <th data-k="ecrRank">ECR</th>
          <th data-k="adp">ADP</th>
          <th data-k="roomDelta" title="How the room's board (ESPN) prices him vs the wider market — ▲ = likely still there past his market price, ▼ = the room reaches for him early">Rm Δ</th>
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
  </div>
  <div id="side">
    <div class="card"><h3 id="rosterTitle">My roster</h3><div id="roster"></div><div id="byes"></div></div>
    <div class="card"><h3 title="Best available consensus points now vs the expected best still there at your next two picks (profiled room model)">Cost of waiting</h3><div id="waiting" class="muted"></div></div>
    <div class="card"><h3>Recent picks</h3><div id="recent" class="muted"></div></div>
  </div>
</div>

<div id="drawerBack"></div>
<div id="drawer">
  <div class="drawer-head">
    <div class="drawer-title">
      <b id="drawerName">—</b>
      <span class="muted" id="drawerMeta"></span>
      <span class="spacer"></span>
      <button id="drawerClose" title="close">✕</button>
    </div>
    <div id="drawerInjury" class="muted" style="margin-top:4px"></div>
  </div>
  <div class="drawer-body" id="drawerBody"></div>
  <div class="drawer-foot" id="drawerFoot"></div>
</div>

<script>
'use strict';
var S = null, B = null, E = null, lastVersion = -1, serverOk = true;
var rowById = {}, drawerPid = null;
var THREAT_MARKS = ['', '!', '!!', '!!!'];
// Δ-best bands: within the noise band of BEST the evaluation cannot tell candidates apart
// (break the tie on Back@); past DELTA_COSTLY the alternative is genuinely expensive.
// The evaluate payload's noiseBand (model-error dominated, 15 under MC) overrides the default.
var DELTA_NOISE = 3, DELTA_COSTLY = 15;
var evalNoiseBand = DELTA_NOISE;
var ui = { pos: 'ALL', search: '', sortKey: 'vor', sortDir: -1, showDrafted: false };
var POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];
var ASC_DEFAULT = { rank: 1, name: 1, position: 1, team: 1, byeWeek: 1, ecrRank: 1, adp: 1, injuryStatus: 1 };

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
function nameMarkers(r, boosted) {
  var m = '';
  if (boosted) m += ' <span class="mark-boost" title="boosted via overrides.json">▲</span>';
  if (r.contested) m += ' <span class="mark-contested" title="sources disagree: spread ' +
    num(r.residualSpread, 1) + ' pts across ' + (r.sourceCount || '?') + ' sources">!</span>';
  if (r.banned) m += ' ' + chip('BAN', '--c-rose', '', 'banned via overrides.json — excluded from recommendations');
  return m;
}
// Assessed-news dot: direction = color, impact = intensity. No dot without an assessment.
function newsDot(nw) {
  if (!nw || !nw.direction || !nw.assessedCount) return '';
  return '<span class="ndot nd-' + nw.direction + ' nd-' + (nw.impact || 'low') + '" title="' +
    nw.direction + '/' + (nw.impact || '?') + ' · ' + nw.itemCount +
    ' item' + (nw.itemCount === 1 ? '' : 's') + '"></span>';
}
// Clickable player name — opens the news drawer.
function nameCell(r) {
  return '<span class="pname" data-pid="' + r.playerId + '" title="news & overrides">' + esc(r.name) + '</span>';
}
// Sortable severity for the N column: worst direction × impact, harms/high (11) first, none 0.
function newsSeverity(nw) {
  if (!nw || !nw.direction || !nw.assessedCount) return 0;
  var dir = { improves: 1, unclear: 2, harms: 3 }[nw.direction] || 0;
  var imp = { low: 0, med: 1, high: 2 }[nw.impact] || 0;
  return dir * 3 + imp;
}
// The N cell: the dot alone, clickable into the drawer like the name.
function newsCell(r) {
  var dot = newsDot(r.news);
  if (!dot) return '<td></td>';
  return '<td><span class="pname" data-pid="' + r.playerId + '">' + dot + '</span></td>';
}
// Rm Δ as banded arrows; the tooltip carries the real numbers with units.
function roomDeltaCell(r) {
  var d = r.roomDelta;
  if (d === null || d === undefined) return '<td class="muted">—</td>';
  var glyph, cls;
  if (d >= 24) { glyph = '▲▲'; cls = 'rm2up'; }
  else if (d >= 12) { glyph = '▲'; cls = 'rm1up'; }
  else if (d > -12) { glyph = '—'; cls = 'rm0'; }
  else if (d > -24) { glyph = '▼'; cls = 'rm1dn'; }
  else { glyph = '▼▼'; cls = 'rm2dn'; }
  var title = 'ESPN ' + num(r.roomAdp, 0) + ' · market ' + num(r.adp, 0) + ' — room takes him ~' +
    Math.abs(Math.round(d)) + ' picks ' + (d >= 0 ? 'later' : 'earlier') + ' than market';
  return '<td class="rm ' + cls + '" title="' + esc(title) + '">' + glyph + '</td>';
}
function threatTitle(r) {
  var t = r.threat;
  if (!t) return '';
  var s = pct(t.pTakenBeforeMyPick) + ' gone before your pick ' + (B && B.threatPick ? B.threatPick : '?');
  var a = t.attribution;
  if (a) {
    s += ' — ' + (a.ownerName || 'team ' + a.teamId) + ' (T' + a.teamId + ', slot ' + (a.slot || '?') +
      ') @ pick ' + a.atPick + ': ' + pct(a.probability);
    if (a.evidence && a.evidence.length) s += ' — ' + a.evidence.join('; ');
  }
  return s;
}
function threatMark(r) {
  var t = r.threat;
  if (!t || !t.threatLevel) return '';
  return '<span class="thr thr' + t.threatLevel + '" title="' + esc(threatTitle(r)) + '">' +
    THREAT_MARKS[t.threatLevel] + '</span>';
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
    // Refetch on a version bump, and keep refetching while the MC evaluation is computing
    // off-path — its payload lags the board version until the compute lands.
    var evalStale = E && (E.computing || E.version !== s.version);
    var p = (s.version !== lastVersion || evalStale) ?
      Promise.all([api('/api/board'), api('/api/evaluate')]).then(function (res) {
        B = res[0]; E = res[1]; lastVersion = s.version;
        evalNoiseBand = (E && E.noiseBand) || DELTA_NOISE;
        rowById = {};
        (B.rows || []).forEach(function (r) { rowById[r.playerId] = r; });
        renderTable(); renderSide(); renderClock();
      }) :
      Promise.resolve();
    return p.then(function () { renderStatus(); renderMock(); });
  }).catch(function () { serverOk = false; renderStatus(); });
}

function mockActive() { return !!(S && S.mock && S.mock.active); }

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
  btn.disabled = S.ingest.running || mockActive();
  btn.textContent = S.ingest.running ? 'Refreshing…' : 'Refresh data';
  el('pollToggle').disabled = mockActive();
  var rm = el('resetManualBtn');
  rm.disabled = mockActive() || S.poll.enabled || S.draft.manualCount === 0;
  rm.title = S.poll.enabled ? 'turn live poll off first' :
    'Delete every manual mark (' + S.draft.manualCount + ' now)';
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

function renderMock() {
  var active = mockActive();
  document.body.classList.toggle('mock', active);
  el('mockBanner').style.display = active ? 'flex' : 'none';
  el('mockBtn').style.display = active ? 'none' : '';
  if (!active) { el('recapPanel').style.display = 'none'; updateCountdown(); return; }
  var m = S.mock;
  el('mockInfo').textContent = 'seed ' + m.seed + ' · ' +
    (m.pace === 0 ? 'manual advance' : 'pace ' + m.pace + 's') +
    ' · ' + m.pickCount + '/' + S.league.totalPicks;
  el('mockAdvance').style.display = (!S.draft.complete && !m.myTurn && m.pace === 0) ? '' : 'none';
  updateCountdown();
  renderRecap();
}

// Display-only: when it hits zero it just goes red — nothing auto-picks.
function updateCountdown() {
  var cd = el('mockCountdown');
  if (!mockActive() || !S.mock.myTurn || !S.mock.countdownStartedAt) {
    cd.textContent = ''; cd.className = 'mono'; return;
  }
  var left = 90 - Math.floor((Date.now() - new Date(S.mock.countdownStartedAt).getTime()) / 1000);
  var over = left < 0;
  var v = Math.abs(left);
  cd.textContent = 'YOUR PICK — ' + (over ? '-' : '') + Math.floor(v / 60) + ':' + ('0' + (v % 60)).slice(-2);
  cd.className = 'mono' + (over ? ' cd-expired' : '');
}

function renderRecap() {
  var panel = el('recapPanel');
  if (!mockActive() || !S.draft.complete || !S.mock.recap) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  var html = ['<h3>Mock draft complete</h3>'];
  html.push('<div class="recap-cap">final capture <b class="mono">' + pct(S.capture.ratio) + '</b></div>');
  S.myRoster.slots.forEach(function (slot) {
    var names = slot.players.map(function (p) {
      return esc(p.name) + ' <span class="muted">' + (p.team || 'FA') + '</span>';
    }).join(', ');
    html.push('<div class="slot-row"><span class="slot-name">' + slot.slot + '</span><span>' +
      (names || '<span class="muted">—</span>') + '</span></div>');
  });
  var best = S.mock.recap.bestValues;
  if (best.length) {
    html.push('<div style="margin-top:8px" class="muted">best value picks (room ADP − pick taken):</div>');
    best.forEach(function (v) {
      html.push('<div>' + esc(v.name) + ' <span class="muted">' + v.position + '</span> — pick ' + v.overall +
        ', room ADP ' + num(v.roomAdp, 1) + ' <span class="' + deltaClass(v.delta) + '">' + signed(v.delta, 1) + '</span>' +
        (v.points !== null ? ' <span class="muted">· ' + num(v.points, 1) + ' pts</span>' : '') + '</div>');
    });
  }
  panel.innerHTML = html.join('');
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
      (nextTurn ? ' — your next turn is ' + nextTurn : '') +
      (E.computing ? ' · simulating…' : '');
    el('backH').textContent = 'Back@' + (nextTurn || '—');
    var html = [];
    var top = E.candidates.slice(0, 10);
    for (var i = 0; i < top.length; i++) {
      var c = top[i];
      var best = c.deltaVsBest === 0;
      var bench = c.landsOn === 'BENCH';
      var tied = c.exactTies > 1;
      var pbest = (c.pBest === null || c.pBest === undefined) ? '' :
        ' <span class="pbest" title="wins ' + Math.round(c.pBest * 100) + '% of sampled drafts' +
        (tied ? '; exactly tied with ' + (c.exactTies - 1) + ' other candidate' + (c.exactTies > 2 ? 's' : '') : '') +
        '">' + Math.round(c.pBest * 100) + '%' + (tied ? '≡' : '') + '</span>';
      html.push('<tr class="' + (best ? 'best' : '') + '">' +
        '<td class="l"><b><span class="pname" data-pid="' + c.playerId + '">' + newsDot(c.news) + esc(c.name) + '</span></b>' + (c.boosted ? ' <span class="mark-boost" title="boosted via overrides.json">▲</span>' : '') + '</td>' +
        '<td class="l">' + c.position + '</td>' +
        '<td class="est">' + num(c.estTeamScore, 1) + '</td>' +
        '<td class="delta ' + deltaBestClass(c.deltaVsBest) + '">' + (best ? '<span class="best-tag">BEST</span>' : num(c.deltaVsBest, 1)) + pbest + '</td>' +
        '<td class="l' + (bench ? ' muted' : '') + '">' + c.landsOn + '</td>' +
        '<td title="' + esc('ECR ' + (c.ecrRank === null ? '—' : c.ecrRank) + ' · ADP ' + num(c.roomAdp, 1)) + '">' +
          (c.ecrRank === null ? '—' : c.ecrRank) + '</td>' +
        '<td class="' + (bench ? 'ups-hi' : '') + '">' + (c.upsideScore === null ? '—' : Math.round(c.upsideScore)) + '</td>' +
        '<td class="' + oddsClass(c.pPickAfter) + '">' + pct(c.pPickAfter) + threatMark(c) + '</td>' +
        '<td class="l"><button class="act" data-act="mine" data-id="' + c.playerId + '" title="draft him">ME</button></td>' +
        '</tr>');
    }
    el('clockRows').innerHTML = html.join('');
    var threatened = E.candidates.filter(function (c) { return c.threat && c.threat.threatLevel >= 1; })
      .sort(function (a, b) { return b.threat.pTakenBeforeMyPick - a.threat.pTakenBeforeMyPick; })
      .slice(0, 3);
    el('clockThreats').innerHTML = !threatened.length ? '' :
      '<b>THREATS</b> (if you pass): ' + threatened.map(function (c) {
        var t = c.threat, a = t.attribution;
        return '<b>' + esc(c.name) + '</b> ' + threatMark(c) + ' ' + pct(t.pTakenBeforeMyPick) +
          ' gone by ' + (B ? B.threatPick : '?') +
          (a ? ' (' + esc(a.ownerName || 'T' + a.teamId) + ' @' + a.atPick + ')' : '');
      }).join(' &nbsp;·&nbsp; ');
    renderKdNudge();
  } else {
    clock.style.display = 'none';
    falls.style.display = '';
    var entries = E.candidates.slice(0, 3).map(function (c) {
      return '<b>' + esc(c.name) + '</b> <span class="muted" title="' +
        esc('ECR ' + (c.ecrRank === null ? '—' : c.ecrRank) + ' · ADP ' + num(c.roomAdp, 1)) + '">' + c.position +
        ' ecr ' + (c.ecrRank === null ? '—' : c.ecrRank) + '</span> ' +
        'est <span class="mono">' + num(c.estTeamScore, 1) + '</span> ' +
        '<span class="' + oddsClass(c.pNextPick) + '">' + pct(c.pNextPick) + ' back</span>';
    });
    falls.innerHTML = 'IF HE FALLS TO YOU @' + (E.myNextPicks[0] || '?') + ' — ' + entries.join(' &nbsp;·&nbsp; ') +
      (E.computing ? ' <span class="muted">· simulating…</span>' : '');
  }
}

// Endgame K/DST nudge: the engine never recommends them (no stat lines), so the panel must.
// Shows when my remaining picks leave at most one pick of slack over the open K/DST seats;
// red (with one-click rows) when every remaining pick is needed for them.
function renderKdNudge() {
  var box = el('kdNudge');
  if (!S || !B) { box.style.display = 'none'; return; }
  var open = { K: 0, DST: 0 };
  S.myRoster.slots.forEach(function (s) {
    if (s.slot === 'K' || s.slot === 'DST') open[s.slot] += Math.max(0, s.capacity - s.players.length);
  });
  var openTotal = open.K + open.DST;
  var myPicks = S.picks.filter(function (p) { return p.teamId === S.league.myTeamId; }).length;
  var remaining = S.league.totalRounds - myPicks;
  if (openTotal === 0 || remaining - openTotal > 1) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  var red = remaining <= openTotal;
  box.style.display = '';
  box.className = 'kd-nudge ' + (red ? 'kd-red' : 'kd-amber');
  var html = ['⚠ ' + remaining + ' pick' + (remaining === 1 ? '' : 's') +
    ' left, K/DST still open — draft them with your last two picks'];
  if (red) {
    ['K', 'DST'].forEach(function (pos) {
      if (!open[pos]) return;
      var cand = B.rows.filter(function (r) { return r.position === pos && !r.banned; })
        .sort(function (a, b) { return (a.adp === null ? 1e9 : a.adp) - (b.adp === null ? 1e9 : b.adp); })
        .slice(0, 3);
      if (!cand.length) return;
      html.push('<div class="kd-row">' + pos + ': ' + cand.map(function (r) {
        return esc(r.name) + ' <span class="muted">' + (r.team || 'FA') + ' adp ' + num(r.adp, 0) + '</span> ' +
          '<button class="act" data-act="mine" data-id="' + r.playerId + '" title="draft him">ME</button>';
      }).join(' &nbsp;·&nbsp; ') + '</div>');
    });
  }
  box.innerHTML = html.join('');
}

function viewRows() {
  if (!B) return [];
  var rows = B.rows.map(function (r) {
    var o = Object.assign({ drafted: false, newsSev: newsSeverity(r.news) }, r);
    return o;
  });
  if (ui.showDrafted) {
    rows = rows.concat(B.drafted.map(function (r) {
      return Object.assign({
        drafted: true, rank: null, pNextPick: null, pPickAfter: null,
        roomDelta: null, upsideScore: null, residualSpread: null, contested: false, banned: false,
        news: null, threat: null, newsSev: 0,
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
// Same semantic tokens as the Back@ odds so the two columns read as one system.
function deltaBestClass(v) {
  if (v >= -evalNoiseBand) return 'odds-hi';
  if (v >= -Math.max(DELTA_COSTLY, evalNoiseBand)) return 'odds-mid';
  return 'muted';
}
// Cost-of-waiting bands: same thresholds; the far band shouts (a cliff) instead of fading.
function waitClass(v) {
  if (v === null || v === undefined) return 'muted';
  if (v >= -DELTA_NOISE) return 'odds-hi';
  if (v >= -DELTA_COSTLY) return 'odds-mid';
  return 'odds-lo';
}

function renderTable() {
  if (!B || !S) return;
  el('p1h').textContent = 'P@' + (B.myNextPicks[0] !== undefined ? B.myNextPicks[0] : '?');
  el('p2h').textContent = 'P@' + (B.myNextPicks[1] !== undefined ? B.myNextPicks[1] : '?');
  var ths = document.querySelectorAll('thead th[data-k]');
  ths.forEach(function (th) { th.className = th.className.replace(' sorted', ''); if (th.dataset.k === ui.sortKey) th.className += ' sorted'; });

  var boosted = {};
  (B.boostedIds || []).forEach(function (id) { boosted[id] = true; });
  // The threat runs to B.threatPick — mark whichever P@ column shows that pick.
  var thrCol = B.threatPick !== null && B.myNextPicks[1] === B.threatPick ? 1 : 0;
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
    var action;
    if (r.drafted) {
      var by = '<span class="' + (r.teamId === S.league.myTeamId ? 'me' : 'muted') + '">' +
        (r.overall !== null ? r.overall + '. ' : '') + esc(teamLabel(r.teamId)) + '</span>';
      action = r.source === 'manual' ?
        by + ' <button class="act src-manual" data-act="undo" data-id="' + r.playerId + '" title="remove manual mark">undo</button>' :
        by;
      if (r.teamId === S.league.myTeamId) cls += ' mine-row';
    } else {
      // In a mock the room drafts for itself, so the "someone else took him" button goes away.
      action = '<button class="act" data-act="mine" data-id="' + r.playerId + '" title="drafted by me">ME</button>' +
        (mockActive() ? '' :
          ' <button class="act" data-act="gone" data-id="' + r.playerId + '" title="drafted by someone else">✕</button>');
    }
    html.push('<tr class="' + cls + '">' +
      '<td>' + (r.rank === null ? '—' : r.rank) + '</td>' +
      newsCell(r) +
      '<td class="l">' + nameCell(r) + nameMarkers(r, boosted[r.playerId]) + '</td>' +
      '<td class="l">' + r.position + '</td>' +
      '<td class="l">' + (r.team || 'FA') + '</td>' +
      '<td>' + (r.byeWeek === null ? '—' : r.byeWeek) + '</td>' +
      '<td>' + num(r.points, 1) + '</td>' +
      '<td><b>' + num(r.vor, 1) + '</b></td>' +
      '<td>' + (r.ecrRank === null ? '—' : r.ecrRank) + '</td>' +
      '<td>' + num(r.adp, 1) + '</td>' +
      roomDeltaCell(r) +
      '<td class="' + (r.upsideScore !== null && r.upsideScore >= 80 ? 'ups-hi' : '') + '">' +
        (r.upsideScore === null ? '—' : Math.round(r.upsideScore)) + '</td>' +
      '<td class="l">' + injHtml + '</td>' +
      '<td class="' + oddsClass(r.pNextPick) + '">' + pct(r.pNextPick) + (thrCol === 0 ? threatMark(r) : '') + '</td>' +
      '<td class="' + oddsClass(r.pPickAfter) + '">' + pct(r.pPickAfter) + (thrCol === 1 ? threatMark(r) : '') + '</td>' +
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

  el('waiting').innerHTML = (B && B.costOfWaiting ? B.costOfWaiting : []).map(function (w) {
    var nowPts = w.now ? w.now.points : null;
    var cells = ['<span class="wait-pos">' + w.position + '</span>',
      '<span class="mono wait-cell" title="' + (w.now ? 'best now: ' + esc(w.now.name) : 'nobody projected') + '">' +
        num(nowPts, 0) + '</span>'];
    (w.atPicks || []).forEach(function (a) {
      var d = nowPts === null ? null : a.expectedBest - nowPts;
      var title = '@' + a.pick + ' expected best ' + num(a.expectedBest, 1) +
        (a.likely ? ' — likely ' + a.likely.name + ' (' + num(a.likely.points, 1) + ' pts, ' +
          pct(a.likely.probFirst) + ' first)' : '');
      cells.push('<span class="wait-cell" title="' + esc(title) + '">@' + a.pick +
        ' <span class="' + waitClass(d) + '">' + signed(d, 0) + '</span></span>');
    });
    return '<div class="wait-row">' + cells.join('') + '</div>';
  }).join('') || '—';

  var recent = S.picks.slice(-8).reverse().map(function (p) {
    var who = '<span class="' + (p.teamId === S.league.myTeamId ? 'me' : '') + '">' + teamLabel(p.teamId) + '</span>';
    var n = p.overall !== null ? p.overall : 'M';
    return '<div>' + n + '. ' + who + ' — ' + esc(p.name) + ' <span class="muted">' + p.position + '</span>' +
      (p.source === 'manual' ? ' <span class="src-manual">manual</span>' : '') + '</div>';
  });
  el('recent').innerHTML = recent.length ? recent.join('') : 'none yet';
}

// -- news drawer ------------------------------------------------------------
var DIR_COLORS = { harms: '--c-rose', improves: '--c-emerald', unclear: '--c-zinc' };

function openDrawer(pid) {
  drawerPid = pid;
  document.body.classList.add('drawer-open');
  el('drawerName').textContent = '…';
  el('drawerMeta').textContent = '';
  el('drawerInjury').textContent = '';
  el('drawerBody').innerHTML = '<div class="muted">loading…</div>';
  el('drawerFoot').innerHTML = '';
  api('/api/news/' + pid).then(function (d) {
    if (drawerPid !== pid) return;
    if (d && d.error) { el('drawerBody').innerHTML = '<div class="muted">' + esc(d.error) + '</div>'; return; }
    renderDrawer(d);
  });
}
function closeDrawer() {
  drawerPid = null;
  document.body.classList.remove('drawer-open');
}
function dateShort(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function newsItemHtml(it) {
  var a = it.assessment;
  var html = ['<div class="news-item">'];
  html.push(chip(a.direction + '/' + a.impact, DIR_COLORS[a.direction] || '--c-zinc'));
  html.push('<div class="news-sum">' + esc(a.summary) + '</div>');
  html.push('<div class="news-hl">' + esc(it.headline) +
    (it.published ? ' <span>· ' + dateShort(it.published) + '</span>' : '') + '</div>');
  if (it.paragraphs && it.paragraphs.length) {
    html.push('<details><summary>full story</summary>' + it.paragraphs.map(function (p) {
      return '<p>' + esc(p) + '</p>';
    }).join('') + '</details>');
  }
  html.push('</div>');
  return html.join('');
}
function renderDrawer(d) {
  var p = d.player;
  el('drawerName').textContent = p.name;
  el('drawerMeta').textContent = p.position + ' · ' + (p.team || 'FA') + (p.byeWeek ? ' · bye ' + p.byeWeek : '');
  var inj = (p.injuryStatus && p.injuryStatus !== 'ACTIVE' && p.injuryStatus !== 'UNKNOWN') ?
    '<span class="inj">' + esc(p.injuryStatus) + '</span>' : '';
  if (d.injuryNote) inj += (inj ? ' — ' : '') + esc(d.injuryNote);
  el('drawerInjury').innerHTML = inj;

  var assessed = d.items.filter(function (it) { return it.assessment; });
  var rest = d.items.filter(function (it) { return !it.assessment; });
  var html = [];
  if (!d.items.length) html.push('<div class="muted">no stored news for this player</div>');
  html = html.concat(assessed.map(newsItemHtml));
  if (rest.length) {
    html.push('<h3 style="margin:10px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em" class="muted">Unassessed (' + rest.length + ')</h3>');
    rest.forEach(function (it) {
      html.push('<div class="news-unassessed">' + esc(it.headline) +
        (it.published ? ' <span>· ' + dateShort(it.published) + '</span>' : '') + '</div>');
    });
  }
  el('drawerBody').innerHTML = html.join('');

  var row = rowById[p.playerId];
  var status = '';
  if (row && row.banned) status = chip('BAN', '--c-rose', '', 'banned via overrides.json');
  else if (B && (B.boostedIds || []).indexOf(p.playerId) >= 0) status = '<span class="mark-boost">▲ boosted</span>';
  el('drawerFoot').innerHTML =
    '<button id="ovrBan" class="btn-danger">Ban</button>' +
    '<button id="ovrBoost">Boost ±points</button>' +
    '<button id="ovrClear">Un-ban / clear</button>' +
    '<span class="spacer"></span><span>' + status + '</span>';
  el('ovrBan').addEventListener('click', function () { sendOverride({ playerId: p.playerId, action: 'ban' }); });
  el('ovrClear').addEventListener('click', function () { sendOverride({ playerId: p.playerId, action: 'clear' }); });
  el('ovrBoost').addEventListener('click', function () {
    var raw = window.prompt('Boost points (±, e.g. 25 or -15)', '25');
    if (raw === null) return;
    var n = Number(raw);
    if (!isFinite(n) || n === 0) { window.alert('need a non-zero number'); return; }
    sendOverride({ playerId: p.playerId, action: 'boost', points: n });
  });
}
function sendOverride(body) {
  api('/api/override', body).then(function (res) {
    if (res && res.error) window.alert('override failed: ' + res.error);
    return loadState();
  }).then(function () {
    if (drawerPid) openDrawer(drawerPid);
  });
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
document.querySelector('#tscroll table thead').addEventListener('click', function (e) {
  var k = e.target.dataset && e.target.dataset.k;
  if (!k) return;
  if (ui.sortKey === k) ui.sortDir = -ui.sortDir;
  else { ui.sortKey = k; ui.sortDir = ASC_DEFAULT[k] ? 1 : -1; }
  renderTable();
});
function actClick(e) {
  var name = e.target.closest ? e.target.closest('.pname') : null;
  if (name && name.dataset.pid) { openDrawer(name.dataset.pid); return; }
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
el('clockPanel').addEventListener('click', actClick); // covers the candidate rows and the K/DST nudge
el('pollToggle').addEventListener('change', function (e) {
  api('/api/poll', { enabled: e.target.checked }).then(loadState);
});
el('refreshBtn').addEventListener('click', function () {
  el('refreshBtn').disabled = true;
  api('/api/refresh', {}).then(loadState);
});
el('mockBtn').addEventListener('click', function () {
  var pace = window.prompt('Mock draft — opponent pace in seconds (0 = advance manually)', '4');
  if (pace === null) return;
  var n = Number(pace);
  if (!isFinite(n) || n < 0) n = 4;
  api('/api/mock', { action: 'start', pace: n }).then(loadState);
});
el('mockStop').addEventListener('click', function () {
  if (!window.confirm('End the mock draft? Every mock pick is discarded.')) return;
  api('/api/mock', { action: 'stop' }).then(loadState);
});
el('mockAdvance').addEventListener('click', function () {
  api('/api/mock', { action: 'advance' }).then(loadState);
});
el('resetManualBtn').addEventListener('click', function () {
  var n = S && S.draft ? S.draft.manualCount : 0;
  if (!window.confirm('Delete ' + n + ' manual mark' + (n === 1 ? '' : 's') + '? Polled picks are untouched.')) return;
  api('/api/manual/reset', {}).then(loadState);
});
el('drawerClose').addEventListener('click', closeDrawer);
el('drawerBack').addEventListener('click', closeDrawer);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
setInterval(updateCountdown, 500);

setInterval(loadState, 2000);
loadState();
</script>
</body>
</html>
`
