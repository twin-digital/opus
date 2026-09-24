/**
 * The touchscreen view of the studio, served by {@link createStudioServer}. Inlined so the
 * published package carries it without a static-assets step.
 *
 * The page keeps no state of its own: it subscribes to `/events` (server-sent events, one
 * `StudioState` JSON per change) and posts actions to `/actions/<name>`.
 */
export const TouchPageHtml = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>CS Studio</title>
<link rel="stylesheet" href="vendor/simple-keyboard.css">
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; user-select: none; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    background: #14161c; color: #f2f2f2;
    display: flex; flex-direction: column; overflow: hidden;
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 18px 28px; font-size: 28px; font-weight: 700; gap: 20px; }
  #instrument { flex: 1; min-width: 0; text-align: center; font-size: 26px; font-weight: 600; color: #ffd166; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #instrument .hand { color: #9aa0ad; font-size: 20px; margin: 0 6px; }
  #status { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 600; }
  #dot { width: 22px; height: 22px; border-radius: 50%; background: #444; }
  #dot.rec { background: #ff3b3b; animation: pulse 1s infinite; }
  #dot.play { background: #37d67a; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  #meter { width: 160px; height: 18px; background: #2a2d36; border-radius: 9px; overflow: hidden; }
  #meterFill { height: 100%; width: 0; background: linear-gradient(90deg, #37d67a 0%, #37d67a 70%, #ffd166 70%, #ffd166 90%, #ff3b3b 90%); background-size: 160px 100%; transition: width 80ms linear; }
  /* the stage: waveform or live graph, with the meters standing at its right edge */
  #strip { display: flex; gap: 16px; padding: 0 28px 18px; height: 190px; }
  #stage { flex: 1; position: relative; background: #0d0f14; border-radius: 18px; overflow: hidden; border: 1px solid #23262f; }
  #wave { position: absolute; inset: 0; }
  #wave.loading { visibility: hidden; } /* the previous clip's shape must not sit under a new title */
  #live { position: absolute; inset: 0; width: 100%; height: 100%; display: none; }
  #progress { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: #2a2e3a; display: none; }
  #progressFill { height: 100%; width: 0; background: #37d67a; }
  #stageTitle, #stageTime { position: absolute; top: 10px; z-index: 3; font-size: 18px; font-weight: 600; padding: 4px 10px; border-radius: 10px; background: rgba(13, 15, 20, 0.8); pointer-events: none; }
  #stageTitle { left: 12px; color: #d5d8e0; max-width: 55%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #stageTime { right: 12px; color: #ffd166; font-variant-numeric: tabular-nums; }
  #meters { display: flex; gap: 10px; align-items: stretch; }
  .meter { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 34px; }
  .meter .bar { flex: 1; width: 100%; position: relative; background: #0a0c10; border-radius: 4px; overflow: hidden; border: 1px solid #2a2e3a; }
  /* the whole scale, dim, so the unlit segments read as a meter and not an empty box */
  .meter .scale, .meter .fill { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(to top, #37d67a 0%, #37d67a 70%, #ffd166 70%, #ffd166 90%, #ff3b3b 90%); background-size: 100% var(--bar-h, 100px); background-position: bottom; }
  .meter .scale { top: 0; opacity: 0.16; }
  .meter .fill { height: 0; }
  /* segmentation: a thin dark line every few pixels, over both */
  .meter .segments { position: absolute; inset: 0; background: repeating-linear-gradient(to top, transparent 0 5px, #0a0c10 5px 7px); pointer-events: none; }
  .meter .hold { position: absolute; left: 0; right: 0; height: 2px; background: #fff; bottom: 0; opacity: 0; z-index: 2; }
  .meter .name { font-size: 13px; color: #9aa0ad; white-space: nowrap; max-width: 60px; overflow: hidden; text-overflow: ellipsis; }
  /* the list gets most of the width; tracks are capped so no clip name can widen them */
  main { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr); gap: 24px; padding: 0 28px 28px; min-height: 0; }
  .buttons { display: flex; flex-direction: column; gap: 24px; }
  button {
    border: none; border-radius: 28px; color: #fff; font-size: 44px; font-weight: 800;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 18px;
  }
  button:active { transform: scale(0.97); filter: brightness(1.15); }
  button:disabled { opacity: 0.35; }
  #recBtn { flex: 3; background: #b3261e; flex-direction: column; gap: 10px; transition: background 150ms; }
  #recBtn svg { width: 120px; height: 120px; display: block; }
  #recBtn .ring { fill: none; stroke: #fff; stroke-width: 6; }
  #recBtn .dot { fill: #fff; }
  #recBtn .square { fill: #fff; display: none; }
  #recBtn.recording { background: #e53935; animation: breathe 2.4s ease-in-out infinite; }
  @keyframes breathe { 50% { background: #c62828; } }
  #recBtn.recording .dot { display: none; }
  #recBtn.recording .square { display: block; }
  #recBtn.busy { opacity: 0.6; pointer-events: none; }
  #recBtn.offline { background: #3a3f4b; color: #9aa0ad; }
  #recBtn.offline .ring { stroke: #9aa0ad; }
  #recBtn.offline .dot { fill: #9aa0ad; }
  #recBtn .label { font-variant-numeric: tabular-nums; }
  #stopBtn { flex: 1; background: #3a3f4b; font-size: 36px; }
  #stopBtn svg { width: 40px; height: 40px; fill: #fff; }
  aside { background: #1d2029; border-radius: 28px; padding: 20px; display: flex; flex-direction: column; min-height: 0; min-width: 0; gap: 14px; }
  aside h2 { margin: 0; font-size: 26px; display: flex; align-items: baseline; justify-content: space-between; }
  aside h2 .count { font-size: 18px; color: #9aa0ad; font-weight: 600; font-variant-numeric: tabular-nums; }
  /* search reads as a place to type; one filter beside it, quiet grey or green when narrowing */
  #filters { display: flex; gap: 10px; align-items: stretch; }
  #search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; border-radius: 16px; background: #0f1116; border: 2px solid #2a2e3a; padding: 8px 14px; min-height: 56px; font-size: 20px; font-weight: 500; cursor: pointer; }
  #search.on { border-color: #ffd166; }
  #search svg { width: 22px; height: 22px; fill: #9aa0ad; flex: none; }
  #search .q { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #search .q.placeholder { color: #9aa0ad; }
  #search .clear { width: 36px; height: 36px; border-radius: 50%; background: #fff; padding: 0; flex: none; }
  #search .clear svg { width: 18px; height: 18px; fill: none; stroke: #14161c; stroke-width: 3; stroke-linecap: round; }
  #delFilter { flex: none; gap: 10px; border-radius: 16px; background: #343948; color: #f2f2f2; padding: 0 18px; min-height: 56px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
  #delFilter svg { width: 26px; height: 26px; fill: currentColor; }
  #delFilter.on { background: #37d67a; color: #0d0f14; }
  .day { font-size: 16px; color: #9aa0ad; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 6px 4px 0; }
  #takes { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .take { display: flex; align-items: center; gap: 14px; background: #2a2e3a; border-radius: 18px; padding: 14px 18px; font-size: 24px; font-weight: 600; cursor: pointer; }
  .take:active { filter: brightness(1.2); }
  .take.active { box-shadow: inset 0 0 0 4px #37d67a; }
  .take .play { width: 72px; height: 72px; border-radius: 50%; background: #37d67a; flex: none; padding: 0; }
  .take .play svg { width: 30px; height: 30px; display: block; fill: #fff; }
  .take.playing .play { background: #ff3b3b; }
  .take .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .take .len { color: #9aa0ad; font-size: 20px; }
  .take .round { width: 56px; height: 56px; border-radius: 50%; background: #3a3f4b; flex: none; padding: 0; }
  .take .round svg { width: 24px; height: 24px; display: block; fill: #fff; }
  .take .star.on { background: #ffd166; }
  .take .star.on svg { fill: #14161c; }
  .take .trash.on svg { fill: #37d67a; }
  /* an unnamed clip sits back a little; a deleted one further, and struck through */
  .take .name.unnamed { color: #9aa0ad; font-weight: 500; }
  .take.unnamed .round, .take.unnamed .play, .take.unnamed .len { opacity: 0.6; }
  .take.deleted { opacity: 0.45; }
  .take.deleted .name { text-decoration: line-through; text-decoration-color: #9aa0ad; }

  /* naming sheet */
  #sheet { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: none; align-items: flex-end; z-index: 10; }
  #sheet.open { display: flex; }
  #sheet { justify-content: center; }
  #sheet .panel { width: 50%; min-width: 640px; max-width: 100%; background: #1d2029; border-radius: 28px 28px 0 0; padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 16px; }
  #sheet .row { display: flex; align-items: center; gap: 14px; }
  #sheet .clip { font-size: 24px; font-weight: 700; white-space: nowrap; }
  #nameField { flex: 1; font-size: 30px; font-weight: 600; padding: 12px 16px; border-radius: 14px; border: 2px solid transparent; background: #2a2e3a; color: #fff; caret-color: #ffd166; min-width: 0; outline: none; }
  #nameField:focus { border-color: #ffd166; }
  #sheet .actions { display: flex; gap: 14px; justify-content: flex-end; }
  #sheet .actions button { font-size: 26px; padding: 12px 28px; border-radius: 16px; }
  #cancelBtn { background: #3a3f4b; }
  #saveBtn { background: #2a9d8f; }
  .simple-keyboard.hg-theme-default { background: #14161c; padding: 8px; }
  .simple-keyboard .hg-button { height: 64px; font-size: 28px; font-weight: 600; background: #2a2e3a; color: #fff; border-bottom: 1px solid #111; box-shadow: none; border-radius: 10px; }
  .simple-keyboard .hg-button.hg-activeButton, .simple-keyboard .hg-button:active { background: #4a5060; }
  .simple-keyboard .hg-button.hg-functionBtn { background: #3a3f4b; }
  .simple-keyboard .hg-button.hg-button-space { min-width: 40%; }
  .empty { color: #9aa0ad; font-size: 24px; padding: 20px; text-align: center; }
  #banner { display: none; position: relative; z-index: 4; background: #ffd166; color: #14161c; font-size: 20px; font-weight: 600; padding: 10px 28px; }
  #banner.show { display: block; }
  #offline { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.85); display: none; align-items: center; justify-content: center; font-size: 32px; text-align: center; padding: 40px; }
</style>
</head>
<body>
<div id="banner"></div>
<header>
  <div>🎹 <span id="title">CS Studio</span></div>
  <div id="instrument"></div>
  <div id="status"><div id="meter"><div id="meterFill"></div></div><div id="dot"></div><span id="statusText">Ready</span></div>
</header>
<div id="strip">
  <div id="stage">
    <div id="wave"></div>
    <canvas id="live"></canvas>
    <div id="progress"><div id="progressFill"></div></div>
    <div id="stageTitle"></div>
    <div id="stageTime"></div>
  </div>
  <div id="meters"></div>
</div>
<main>
  <div class="buttons">
    <button id="recBtn">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ring" cx="50" cy="50" r="44"/>
        <circle class="dot" cx="50" cy="50" r="30"/>
        <rect class="square" x="26" y="26" width="48" height="48" rx="8"/>
      </svg>
      <span class="label">Record</span>
    </button>
    <button id="stopBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg> Stop</button>
  </div>
  <aside>
    <h2>My recordings <span class="count" id="count"></span></h2>
    <div id="filters">
      <div id="search" role="button" tabindex="0">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>
        <span class="q placeholder" id="searchText">Search names</span>
        <button class="clear" id="searchClear" aria-label="Clear search" hidden><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <button id="delFilter" aria-label="Show deleted clips"></button>
    </div>
    <div id="takes"></div>
  </aside>
</main>
<div id="offline">Can't reach the studio.<br>Ask Dad to check REAPER.</div>
<div id="sheet">
  <div class="panel">
    <div class="row"><span class="clip" id="sheetClip">Clip 7</span><input id="nameField" inputmode="none" maxlength="40" placeholder="Name this clip" autocomplete="off"></div>
    <div class="simple-keyboard"></div>
    <div class="actions"><button id="cancelBtn">Cancel</button><button id="saveBtn">Save</button></div>
  </div>
</div>
<script src="vendor/simple-keyboard.js"></script>
<script src="vendor/wavesurfer.js"></script>

<script>
const $ = (id) => document.getElementById(id)
const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const act = (name) => { fetch('/actions/' + name, { method: 'POST' }).catch(() => {}) }
// geometric icons, so they center exactly (text glyphs sit off-center in most fonts)
const PlayIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,4 21,12 7,20"/></svg>'
const StopIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>'
const EditIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.3V21h3.7L17.8 9.9l-3.7-3.7L3 17.3zm17.7-10.2a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7 1.9-1.7z"/></svg>'
// a label that is just the recording timestamp, as the watcher writes it
const isTimestamp = (label) => /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/.test(label)
// the given name when there is one, otherwise "Clip N" (or the whole name for a region not made by the watcher)
const displayName = (take) =>
  take.number === undefined ? take.name
  : take.label && !isTimestamp(take.label) ? take.label
  : 'Clip ' + take.number

const DefaultTitle = 'CS Studio'
let state = { connected: false, transport: 'stopped', recordingElapsed: 0, level: 0, meters: [], position: 0, takes: [], playingTake: undefined, instruments: undefined, projectName: undefined, helper: undefined }
let streamOk = false
let takesKey = ''
let busyUntil = 0 // ignore record taps briefly after one, until the state catches up

const tapRecord = () => {
  if (!(state.helper && state.helper.matches)) return
  const isRec = state.transport === 'recording'
  busyUntil = Date.now() + 600
  act(isRec ? 'stop' : 'record')
  render()
  setTimeout(render, 650)
}

function renderInstrument() {
  const box = $('instrument')
  box.textContent = ''
  const sel = state.instruments
  if (!sel) return
  if (!sel.split) { box.textContent = sel.instrument; return }
  const part = (label, name) => {
    const hand = document.createElement('span')
    hand.className = 'hand'
    hand.textContent = label
    box.append(hand, document.createTextNode(name))
  }
  part('Left', sel.left)
  part('Right', sel.right)
}

function renderBanner() {
  const banner = $('banner')
  const text =
    !state.connected ? ''
    : state.helper === undefined ? 'The REAPER helper is not running. Ask Dad to restart REAPER.'
    : state.helper.matches ? ''
    : 'The REAPER helper is out of date. Ask Dad to restart REAPER.'
  banner.textContent = text
  banner.classList.toggle('show', text !== '')
}

function render() {
  renderBanner()
  renderStage()
  renderMeters()
  const title = state.projectName || DefaultTitle
  $('title').textContent = title
  document.title = title
  renderInstrument()
  const isRec = state.transport === 'recording'
  const isPlay = state.transport === 'playing'
  const online = streamOk && state.connected
  // without the REAPER helper a recording produces no clip, so Record reads as unavailable
  const helperOk = !!state.helper && state.helper.matches
  const canRecord = online && helperOk
  $('dot').className = isRec ? 'rec' : isPlay ? 'play' : ''
  $('statusText').textContent = isRec ? 'Recording' : isPlay ? 'Playing' : 'Ready'
  const rec = $('recBtn')
  rec.classList.toggle('recording', isRec)
  rec.classList.toggle('busy', Date.now() < busyUntil)
  rec.classList.toggle('offline', !canRecord)
  rec.querySelector('.label').textContent =
    !online ? 'Not connected' : !helperOk ? 'Helper missing' : isRec ? fmt(state.recordingElapsed) : 'Record'
  $('stopBtn').disabled = !(isRec || isPlay)
  $('meterFill').style.width = Math.round(state.level * 100) + '%'
  $('offline').style.display = online ? 'none' : 'flex'

  renderTakes()
}

// --- the list: his clips, newest first, under day headings ------------------------------
// The search and the deleted filter are the page's own; star and delete go to the watcher as
// flags and come back on the next state, shown at once meanwhile.
const filter = { q: '', deleted: false }
const pendingFlags = {} // take id -> { starred?, deleted? } asked for, until the state agrees

const TrashIcon = '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z"/></svg>'
const RestoreIcon = '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>'
const StarIcon = '<svg viewBox="0 0 24 24"><path d="M12 17.3 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9L12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5z"/></svg>'

const flagsOf = (take) => {
  const pending = pendingFlags[take.id] || {}
  const starred = 'starred' in pending ? pending.starred : !!take.starred
  const deleted = 'deleted' in pending ? pending.deleted : !!take.deleted
  return { starred, deleted }
}
const isNamed = (take) => take.number === undefined || (!!take.label && !isTimestamp(take.label))
const passes = (take) => {
  const { deleted } = flagsOf(take)
  if (deleted !== filter.deleted) return false
  return !filter.q || displayName(take).toLowerCase().includes(filter.q.toLowerCase())
}
// "Today", "Yesterday", else the weekday and date; nothing for a clip whose date is unknown
function dayLabel(createdAt) {
  if (!createdAt) return ''
  const at = new Date(createdAt)
  if (isNaN(at)) return ''
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((day(new Date()) - day(at)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
// the time of day of an unnamed clip, from its timestamp label ("Sep 21, 04:12 PM" -> "4:12 PM")
const timeOf = (take) => { const m = /(\d{1,2}):(\d{2}) ([AP]M)$/.exec(take.label || ''); return m ? String(Number(m[1])) + ':' + m[2] + ' ' + m[3] : '' }

function setFlag(take, name, on) {
  pendingFlags[take.id] = Object.assign(pendingFlags[take.id] || {}, { [name]: on })
  fetch('/actions/' + (name === 'starred' ? 'star' : 'delete') + '/' + encodeURIComponent(take.id), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }),
  }).catch(() => {})
}
function settleFlags() {
  for (const take of state.takes) {
    const pending = pendingFlags[take.id]
    if (!pending) continue
    if ('starred' in pending && !!take.starred === pending.starred) delete pending.starred
    if ('deleted' in pending && !!take.deleted === pending.deleted) delete pending.deleted
    if (Object.keys(pending).length === 0) delete pendingFlags[take.id]
  }
}

function renderFilters() {
  const text = $('searchText')
  text.textContent = filter.q || 'Search names'
  text.classList.toggle('placeholder', !filter.q)
  $('searchClear').hidden = !filter.q
  $('search').classList.toggle('on', !!filter.q)
  const del = $('delFilter')
  del.classList.toggle('on', filter.deleted)
  del.innerHTML = TrashIcon + '<span>' + (filter.deleted ? 'Deleted' : 'Not deleted') + '</span>'
}

function renderTakes() {
  settleFlags()
  renderFilters()
  const shown = state.takes.filter(passes)
  $('count').textContent = state.takes.length === 0 ? '' : shown.length === state.takes.length ? String(state.takes.length) : shown.length + ' of ' + state.takes.length
  const key = shown.map((t) => { const f = flagsOf(t); return t.id + ':' + t.end + ':' + t.name + ':' + f.starred + ':' + f.deleted + ':' + (t.createdAt || '') }).join(',')
    + '|' + (state.playingTake ? state.playingTake.id : '') + '|' + (selected ? selected.id : '') + '|' + filter.q + '|' + filter.deleted + '|' + state.takes.length
  if (key === takesKey) return
  takesKey = key
  const box = $('takes')
  box.innerHTML = ''
  if (shown.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = state.takes.length === 0 ? 'Press Record to make your first one!' : filter.q ? 'Nothing named "' + filter.q + '"' : filter.deleted ? 'Nothing deleted' : 'Nothing here'
    box.appendChild(empty)
    return
  }
  let lastDay = null
  for (const take of shown) {
    const day = dayLabel(take.createdAt)
    if (day && day !== lastDay) {
      const heading = document.createElement('div')
      heading.className = 'day'
      heading.textContent = day
      box.appendChild(heading)
      lastDay = day
    }
    const { starred, deleted } = flagsOf(take)
    const named = isNamed(take)
    const active = !!state.playingTake && state.playingTake.id === take.id
    const isSelected = !!selected && selected.id === take.id
    const el = document.createElement('div')
    el.className = 'take' + (isSelected ? ' active' : '') + (active ? ' playing' : '') + (named ? '' : ' unnamed') + (deleted ? ' deleted' : '')
    const play = document.createElement('button')
    play.className = 'play'
    play.innerHTML = active ? StopIcon : PlayIcon
    play.setAttribute('aria-label', active ? 'Stop' : 'Play ' + displayName(take))
    play.tabIndex = -1 // the whole card is the control; the button is its icon
    el.onclick = () => { if (!active) selectTake(take); act(active ? 'stop' : 'play-take/' + encodeURIComponent(take.id)) }
    const name = document.createElement('span')
    name.className = 'name' + (named ? '' : ' unnamed')
    name.textContent = named ? displayName(take) : displayName(take) + (timeOf(take) ? ' · ' + timeOf(take) : '')
    const len = document.createElement('span')
    len.className = 'len'
    len.textContent = fmt(take.duration)
    const star = document.createElement('button')
    star.className = 'round star' + (starred ? ' on' : '')
    star.innerHTML = StarIcon
    star.setAttribute('aria-label', starred ? 'Unstar' : 'Star')
    star.onclick = (event) => { event.stopPropagation(); setFlag(take, 'starred', !starred); render() }
    const trash = document.createElement('button')
    trash.className = 'round trash' + (deleted ? ' on' : '')
    trash.innerHTML = deleted ? RestoreIcon : TrashIcon
    trash.setAttribute('aria-label', deleted ? 'Bring back' : 'Delete')
    // one tap, no asking: the recording stays in REAPER and the same button brings it back
    trash.onclick = (event) => {
      event.stopPropagation()
      setFlag(take, 'deleted', !deleted)
      if (!deleted && active) act('stop')
      if (!deleted && isSelected) selected = null
      render()
    }
    const edit = document.createElement('button')
    edit.className = 'round edit'
    edit.innerHTML = EditIcon
    edit.setAttribute('aria-label', 'Name this clip')
    edit.onclick = (event) => { event.stopPropagation(); openSheet('rename', take) }
    el.append(play, name, len, star, trash, edit)
    box.appendChild(el)
  }
}

$('search').onclick = () => openSheet('search')
$('searchClear').onclick = (event) => { event.stopPropagation(); filter.q = ''; render() }
$('delFilter').onclick = () => { filter.deleted = !filter.deleted; render() }

// --- stage: waveform with cursor while playing, live graph while recording ----------
let renderQueued = false
function scheduleRender() {
  if (renderQueued) return
  renderQueued = true
  setTimeout(() => { renderQueued = false; render() }, 0)
}
const liveBars = []   // recent levels, newest last, for the recording graph
const LIVE_BARS = 240

// --- waveform: the shown clip's rendered mix, one clip at a time -------------------------
// A clip without a mix yet (a fresh one renders as it ends, a trimmed one at the next idle
// pass) or with an unreadable one is retried after a pause, never in a loop.
const WAVE_RETRY_MS = 5000
const waveform = {
  ws: null,       // WaveSurfer instance, created on first use
  clipId: null,   // clip the current load belongs to
  loads: 0,       // counts loads; an outcome is honoured only for the latest
  ready: false,
  failedAt: {},   // clip id -> when its load last failed
  ensure() {
    if (this.ws || !window.WaveSurfer) return this.ws
    this.ws = WaveSurfer.create({
      container: '#wave',
      height: 'auto',
      waveColor: '#3a5f4f',
      progressColor: '#37d67a',
      cursorColor: '#ffd166',
      cursorWidth: 3,
      barWidth: 3,
      barGap: 2,
      barRadius: 2,
      interact: true,
      dragToSeek: true,
      normalize: true,
    })
    // tapping or dragging moves playback there (the page never plays audio itself). Positions
    // are fractions of the clip, not seconds: the mix can be a little shorter or longer than
    // the region (it is re-rendered after a trim) and must never desync
    this.ws.on('click', (relative) => scrub.begin(relative))
    this.ws.on('drag', (relative) => scrub.begin(relative))
    return this.ws
  },
  loadFor(id, duration) {
    const ws = this.ensure()
    if (!ws || this.clipId === id) return
    const failed = this.failedAt[id]
    if (failed && Date.now() - failed < WAVE_RETRY_MS) return
    this.clipId = id
    this.ready = false
    const load = ++this.loads
    // with the duration given, the library never waits on the media element: a file it
    // cannot read fails at decode and rejects like any other failure. A superseded load
    // settles too (aborted or bailed out), and is ignored
    ws.load('/clips/' + encodeURIComponent(id) + '.wav', undefined, duration).then(
      () => { if (load === this.loads) { this.ready = true; scheduleRender() } },
      () => { if (load === this.loads) this.failed(id) },
    )
  },
  failed(id) {
    this.ready = false
    this.failedAt[id] = Date.now()
    this.clipId = null
    this.loads += 1
    this.ws.empty() // never another clip's waveform under this one's title
    scheduleRender()
  },
  showAt(fraction) {
    if (!this.ws || !this.ready) return
    const total = this.ws.getDuration()
    if (total > 0) this.ws.setTime(Math.min(total, Math.max(0, fraction * total)))
  },
}

// the selected clip: the one last played (or just recorded); it stays on the stage after stop
let selected = null
let newestNumber = null // highest clip number seen so far; null until the first connected state

function selectTake(take) {
  selected = take
  render()
}

function syncSelection() {
  if (state.playingTake) selected = state.playingTake
  if (selected) {
    const current = state.takes.find((t) => t.id === selected.id)
    selected = current || null // gone from the project: nothing selected
  }
  // a clip that just finished recording becomes the selection
  if (!state.connected) return
  const newest = state.takes.reduce((max, t) => (t.number !== undefined && t.number > max ? t.number : max), -1)
  if (newestNumber !== null && newest > newestNumber && state.transport !== 'playing') {
    selected = state.takes.find((t) => t.number === newest) || selected
  }
  newestNumber = newest
}

// --- scrubbing: taps and drags seek the shown clip ---------------------------------------
// Seeks go out at most every SCRUB_INTERVAL while dragging. REAPER's reported position is
// ignored until it nears the last target or a cap passes, so the cursor never snaps back.
const SCRUB_INTERVAL = 120
const SCRUB_HOLD_CAP = 1500
const scrub = {
  pending: null,  // latest fraction not yet sent
  timer: null,
  target: null,   // fraction last sent, awaiting REAPER's echo
  holdUntil: 0,
  begin(fraction) {
    if (!state.playingTake && !selected) return
    fraction = Math.min(1, Math.max(0, fraction))
    this.holdUntil = Date.now() + SCRUB_HOLD_CAP
    waveform.showAt(fraction)
    this.pending = fraction
    if (this.timer === null) this.timer = setTimeout(() => this.send(), SCRUB_INTERVAL)
  },
  send() {
    this.timer = null
    const take = state.playingTake || selected
    const fraction = this.pending
    this.pending = null
    if (fraction === null || !take) { this.holdUntil = 0; return }
    this.target = fraction
    this.holdUntil = Date.now() + SCRUB_HOLD_CAP
    // a seek starts the clip when it is not playing, so stopped and playing share one path
    fetch('/actions/seek/' + encodeURIComponent(take.id), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ at: fraction * take.duration }),
    }).catch(() => {})
  },
  // whether REAPER's reported fraction may drive the cursor now: once it echoes the target
  // (within a quarter second, or 2% of a long clip) or the cap passes
  accept(fraction, duration) {
    if (this.pending !== null || this.timer !== null) return false
    const near = Math.abs(fraction - this.target) * duration < Math.max(0.25, 0.02 * duration)
    if (this.target !== null && (near || Date.now() >= this.holdUntil)) {
      this.target = null
      this.holdUntil = 0
    }
    return this.target === null && Date.now() >= this.holdUntil
  },
}

function drawLive() {
  const canvas = $('live')
  const w = canvas.clientWidth, h = canvas.clientHeight
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  const barW = w / LIVE_BARS
  for (let i = 0; i < liveBars.length; i++) {
    const level = liveBars[i]
    const x = w - (liveBars.length - i) * barW
    const bh = Math.max(2, level * (h - 30))
    ctx.fillStyle = level > 0.9 ? '#ff3b3b' : level > 0.7 ? '#ffd166' : '#37d67a'
    ctx.fillRect(x, (h - bh) / 2 + 10, Math.max(1, barW - 1), bh)
  }
}

function renderStage() {
  syncSelection()
  const playing = state.transport === 'playing' && state.playingTake
  const recording = state.transport === 'recording'
  const shown = playing ? state.playingTake : (!recording && selected) || null
  const title = $('stageTitle'), time = $('stageTime')
  $('wave').style.display = shown ? 'block' : 'none'
  $('live').style.display = recording ? 'block' : 'none'
  $('progress').style.display = shown && !waveform.ready ? 'block' : 'none'

  if (recording) {
    liveBars.push(state.level)
    if (liveBars.length > LIVE_BARS) liveBars.shift()
    drawLive()
    title.textContent = 'Recording'
    time.textContent = fmt(state.recordingElapsed)
    return
  }
  if (shown) {
    const take = shown
    const position = playing ? state.position : 0
    waveform.loadFor(take.id, take.duration)
    $('wave').classList.toggle('loading', !waveform.ready)
    const fraction = take.duration > 0 ? position / take.duration : 0
    if (take.duration > 0 && scrub.accept(fraction, take.duration)) waveform.showAt(fraction)
    $('progressFill').style.width = (take.duration > 0 ? (position / take.duration) * 100 : 0) + '%'
    title.textContent = displayName(take)
    time.textContent = fmt(position) + ' / ' + fmt(take.duration)
    if (!playing) liveBars.length = 0
    return
  }
  liveBars.length = 0
  title.textContent = ''
  time.textContent = ''
}

// --- meters: one bar per track, master last, with a falling peak-hold line -------------
// Levels arrive with each state update; the hold lines fall on their own clock so they keep
// dropping after the last update, and vanish at the bottom.
let holds = []   // per meter column: { level, at, painted }
let metersKey = ''
const HOLD_MS = 700
const FALL_PER_SECOND = 0.5
let holdTimer = null

function paintHolds() {
  const box = $('meters')
  const meters = state.meters || []
  const now = Date.now()
  let any = false
  meters.forEach((m, i) => {
    const el = box.children[i]
    if (!el) return
    const h = holds[i] || (holds[i] = { level: 0, at: 0, painted: 0 })
    if (now - h.at > HOLD_MS && h.level > 0) {
      h.level = Math.max(0, h.level - FALL_PER_SECOND * (now - h.painted) / 1000)
    }
    h.painted = now
    const hold = el.querySelector('.hold')
    hold.style.opacity = h.level > 0.01 ? 1 : 0
    hold.style.bottom = 'min(calc(100% - 2px), ' + (h.level * 100) + '%)'
    if (h.level > 0) any = true
  })
  if (any && holdTimer === null) holdTimer = setTimeout(() => { holdTimer = null; paintHolds() }, 33)
}

function renderMeters() {
  const box = $('meters')
  const meters = state.meters || []
  const key = meters.map((m) => m.name).join('\t')
  if (key !== metersKey) {
    metersKey = key
    holds = [] // columns changed: no hold belongs to a new column
    box.innerHTML = ''
    for (const m of meters) {
      const el = document.createElement('div')
      el.className = 'meter'
      el.innerHTML = '<div class="bar"><div class="scale"></div><div class="fill"></div><div class="segments"></div><div class="hold"></div></div><span class="name"></span>'
      el.querySelector('.name').textContent = m.name
      box.appendChild(el)
    }
  }
  const now = Date.now()
  meters.forEach((m, i) => {
    const el = box.children[i]
    const bar = el.querySelector('.bar'), fill = el.querySelector('.fill')
    const hPx = bar.clientHeight
    fill.style.setProperty('--bar-h', hPx + 'px')
    el.querySelector('.scale').style.setProperty('--bar-h', hPx + 'px')
    fill.style.height = (m.level * 100) + '%'
    const h = holds[i] || (holds[i] = { level: 0, at: 0, painted: now })
    if (m.level >= h.level) { h.level = m.level; h.at = now; h.painted = now }
  })
  paintHolds()
}

// --- naming sheet ---------------------------------------------------------
let editing = null
let keyboard = null

function ensureKeyboard() {
  if (keyboard) return keyboard
  const Keyboard = window.SimpleKeyboard.default || window.SimpleKeyboard
  keyboard = new Keyboard({
    layout: {
      default: ['1 2 3 4 5 6 7 8 9 0 {bksp}', 'Q W E R T Y U I O P', 'A S D F G H J K L', '{shift} Z X C V B N M ! ?', '{space}'],
      lower: ['1 2 3 4 5 6 7 8 9 0 {bksp}', 'q w e r t y u i o p', 'a s d f g h j k l', '{shift} z x c v b n m , .', '{space}'],
    },
    display: { '{bksp}': '⌫', '{shift}': '⇧', '{space}': ' ' },
    maxLength: 40,
    preventMouseDownDefault: true, // key taps must not steal focus (and the caret) from the field
    onChange: (value) => { setFieldValue(value); if (sheetMode === 'search') { filter.q = value.trim(); render() } },
    onKeyPress: (button) => {
      if (button === '{shift}') keyboard.setOptions({ layoutName: keyboard.options.layoutName === 'lower' ? 'default' : 'lower' })
    },
  })
  return keyboard
}

function setFieldValue(value) {
  const field = $('nameField')
  field.value = value
  field.focus()
  field.setSelectionRange(value.length, value.length)
}

let sheetMode = 'rename'
let searchBefore = '' // the query when the sheet opened, for Cancel

function openSheet(mode, take) {
  sheetMode = mode
  editing = take || null
  const field = $('nameField')
  let current
  if (mode === 'search') {
    searchBefore = filter.q
    current = filter.q
    $('sheetClip').textContent = 'Search'
    field.placeholder = 'Type part of a name'
    $('saveBtn').textContent = 'Done'
  } else {
    current = isTimestamp(take.label) ? '' : take.label
    $('sheetClip').textContent = take.number === undefined ? take.name : 'Clip ' + take.number
    field.placeholder = 'Name this clip'
    $('saveBtn').textContent = 'Save'
  }
  ensureKeyboard().setInput(current)
  $('sheet').classList.add('open')
  setFieldValue(current)
}

function closeSheet() {
  editing = null
  $('sheet').classList.remove('open')
}

function cancelSheet() {
  if (sheetMode === 'search') { filter.q = searchBefore; render() }
  closeSheet()
}

function saveSheet() {
  if (sheetMode === 'search') { closeSheet(); return }
  if (!editing) return
  const name = $('nameField').value.trim()
  const id = editing.id
  closeSheet()
  if (!name) return
  fetch('/actions/rename/' + encodeURIComponent(id), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => {})
}

$('cancelBtn').onclick = cancelSheet
$('saveBtn').onclick = saveSheet
$('sheet').onclick = (event) => { if (event.target === $('sheet')) cancelSheet() }

function subscribe() {
  const source = new EventSource('/events')
  source.onopen = () => { streamOk = true; render() }
  source.onmessage = (event) => { state = JSON.parse(event.data); render() }
  source.onerror = () => { streamOk = false; render() } // EventSource reconnects on its own
}

$('recBtn').onclick = tapRecord
$('stopBtn').onclick = () => act('stop')
render()
subscribe()
</script>
</body>
</html>
`
