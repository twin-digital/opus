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
  #meterFill { height: 100%; width: 0; background: linear-gradient(90deg, #37d67a, #ffd166 70%, #ff3b3b); transition: width 80ms linear; }
  main { flex: 1; display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; padding: 0 28px 28px; min-height: 0; }
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
  aside { background: #1d2029; border-radius: 28px; padding: 20px; display: flex; flex-direction: column; min-height: 0; }
  aside h2 { margin: 0 0 14px; font-size: 26px; }
  #takes { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .take { display: flex; align-items: center; gap: 14px; background: #2a2e3a; border-radius: 18px; padding: 14px 18px; font-size: 24px; font-weight: 600; cursor: pointer; }
  .take:active { filter: brightness(1.2); }
  .take.active { box-shadow: inset 0 0 0 4px #37d67a; }
  .take .play { width: 72px; height: 72px; border-radius: 50%; background: #37d67a; flex: none; padding: 0; }
  .take .play svg { width: 30px; height: 30px; display: block; fill: #fff; }
  .take.active .play { background: #ff3b3b; }
  .take .name { flex: 1; }
  .take .len { color: #9aa0ad; font-size: 20px; }
  .empty { color: #9aa0ad; font-size: 24px; padding: 20px; text-align: center; }
  #offline { position: fixed; inset: 0; background: rgba(0,0,0,.85); display: none; align-items: center; justify-content: center; font-size: 32px; text-align: center; padding: 40px; }
</style>
</head>
<body>
<header>
  <div>🎹 <span id="title">CS Studio</span></div>
  <div id="instrument"></div>
  <div id="status"><div id="meter"><div id="meterFill"></div></div><div id="dot"></div><span id="statusText">Ready</span></div>
</header>
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
    <h2>My recordings</h2>
    <div id="takes"></div>
  </aside>
</main>
<div id="offline">Can't reach the studio.<br>Ask a grown-up to check REAPER.</div>

<script>
const $ = (id) => document.getElementById(id)
const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const act = (name) => { fetch('/actions/' + name, { method: 'POST' }).catch(() => {}) }
// geometric icons, so they center exactly (text glyphs sit off-center in most fonts)
const PlayIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,4 21,12 7,20"/></svg>'
const StopIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>'

const DefaultTitle = 'CS Studio'
let state = { connected: false, transport: 'stopped', recordingElapsed: 0, level: 0, takes: [], playingTake: undefined, instruments: undefined, projectName: undefined }
let streamOk = false
let takesKey = ''
let busyUntil = 0 // ignore record taps briefly after one, until the state catches up

const tapRecord = () => {
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

function render() {
  const title = state.projectName || DefaultTitle
  $('title').textContent = title
  document.title = title
  renderInstrument()
  const isRec = state.transport === 'recording'
  const isPlay = state.transport === 'playing'
  const online = streamOk && state.connected
  $('dot').className = isRec ? 'rec' : isPlay ? 'play' : ''
  $('statusText').textContent = isRec ? 'Recording' : isPlay ? 'Playing' : 'Ready'
  const rec = $('recBtn')
  rec.classList.toggle('recording', isRec)
  rec.classList.toggle('busy', Date.now() < busyUntil)
  rec.classList.toggle('offline', !online)
  rec.querySelector('.label').textContent = !online ? 'Not connected' : isRec ? fmt(state.recordingElapsed) : 'Record'
  $('stopBtn').disabled = !(isRec || isPlay)
  $('meterFill').style.width = Math.round(state.level * 100) + '%'
  $('offline').style.display = online ? 'none' : 'flex'

  const key = state.takes.map((t) => t.id + ':' + t.end).join(',') + '|' + (state.playingTake ? state.playingTake.id : '')
  if (key === takesKey) return
  takesKey = key
  const box = $('takes')
  box.innerHTML = ''
  if (state.takes.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'Press Record to make your first one!'
    box.appendChild(empty)
    return
  }
  for (const take of state.takes.slice(0, 12)) {
    const active = !!state.playingTake && state.playingTake.id === take.id
    const el = document.createElement('div')
    el.className = 'take' + (active ? ' active' : '')
    const play = document.createElement('button')
    play.className = 'play'
    play.innerHTML = active ? StopIcon : PlayIcon
    play.setAttribute('aria-label', active ? 'Stop' : 'Play ' + take.name)
    play.tabIndex = -1 // the whole card is the control; the button is its icon
    el.onclick = () => act(active ? 'stop' : 'play-take/' + encodeURIComponent(take.id))
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = take.name
    const len = document.createElement('span')
    len.className = 'len'
    len.textContent = fmt(take.duration)
    el.append(play, name, len)
    box.appendChild(el)
  }
}

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
