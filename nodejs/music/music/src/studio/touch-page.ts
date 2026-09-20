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
<title>My Studio</title>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; user-select: none; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    background: #14161c; color: #f2f2f2;
    display: flex; flex-direction: column; overflow: hidden;
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 18px 28px; font-size: 28px; font-weight: 700; }
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
  #recBtn { flex: 2; background: #d62828; }
  #stopBtn { flex: 1; background: #3a3f4b; }
  #lastBtn { flex: 1; background: #2a9d8f; }
  #recBtn.armed { background: #ff3b3b; animation: pulse 1s infinite; }
  .icon { font-size: 52px; line-height: 1; }
  aside { background: #1d2029; border-radius: 28px; padding: 20px; display: flex; flex-direction: column; min-height: 0; }
  aside h2 { margin: 0 0 14px; font-size: 26px; }
  #takes { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .take { display: flex; align-items: center; gap: 14px; background: #2a2e3a; border-radius: 18px; padding: 14px 18px; font-size: 24px; font-weight: 600; }
  .take.active { outline: 4px solid #37d67a; }
  .take .play { width: 72px; height: 72px; border-radius: 50%; background: #37d67a; font-size: 34px; flex: none; }
  .take .name { flex: 1; }
  .take .len { color: #9aa0ad; font-size: 20px; }
  .empty { color: #9aa0ad; font-size: 24px; padding: 20px; text-align: center; }
  #offline { position: fixed; inset: 0; background: rgba(0,0,0,.85); display: none; align-items: center; justify-content: center; font-size: 32px; text-align: center; padding: 40px; }
</style>
</head>
<body>
<header>
  <div>🎹 My Studio</div>
  <div id="status"><div id="meter"><div id="meterFill"></div></div><div id="dot"></div><span id="statusText">Ready</span></div>
</header>
<main>
  <div class="buttons">
    <button id="recBtn"><span class="icon">⏺</span> Record</button>
    <button id="stopBtn"><span class="icon">⏹</span> Stop</button>
    <button id="lastBtn"><span class="icon">▶</span> Play my last one</button>
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

let state = { connected: false, transport: 'stopped', recordingElapsed: 0, level: 0, takes: [], playingTake: undefined }
let streamOk = false
let takesKey = ''

function render() {
  const isRec = state.transport === 'recording'
  const isPlay = state.transport === 'playing'
  $('dot').className = isRec ? 'rec' : isPlay ? 'play' : ''
  $('statusText').textContent = isRec ? 'Recording  ' + fmt(state.recordingElapsed) : isPlay ? 'Playing' : 'Ready'
  $('recBtn').classList.toggle('armed', isRec)
  $('recBtn').disabled = isRec
  $('lastBtn').disabled = isRec || state.takes.length === 0
  $('meterFill').style.width = Math.round(state.level * 100) + '%'
  $('offline').style.display = streamOk && state.connected ? 'none' : 'flex'

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
    const el = document.createElement('div')
    el.className = 'take' + (state.playingTake && state.playingTake.id === take.id ? ' active' : '')
    const play = document.createElement('button')
    play.className = 'play'
    play.textContent = '▶'
    play.onclick = () => act('play-take/' + encodeURIComponent(take.id))
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

$('recBtn').onclick = () => act('record')
$('stopBtn').onclick = () => act('stop')
$('lastBtn').onclick = () => act('play-latest')
render()
subscribe()
</script>
</body>
</html>
`
