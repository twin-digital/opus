#!/usr/bin/env node
// Probes REAPER's web remote the way the studio app uses it, and prints PASS/FAIL per check.
// No dependencies; Node 18+. Run next to a REAPER with the web interface enabled:
//
//   node reaper-probe.mjs [http://localhost:8080]
//
// Checks: connectivity, status parsing, project ext-state round trips (spaces, punctuation,
// unicode, separators, long values), and, with the studio watcher loaded, that a rename
// request written to ext state renames a "Clip N" region within a few seconds.

const base = (process.argv[2] ?? 'http://localhost:8080').replace(/\/+$/, '')
const SECTION = 'StudioProbe'
let failures = 0

const send = async (commands) => {
  const response = await fetch(`${base}/_/${commands.join(';')}`, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

// info checks map the edges (what the app avoids or never sends); they never fail the run
const report = (ok, name, detail = '', { info = false } = {}) => {
  if (!ok && !info) failures += 1
  const tag =
    ok ? 'PASS'
    : info ? 'INFO'
    : 'FAIL'
  console.log(`${tag}  ${name}${detail ? `  (${detail})` : ''}`)
}

const readExt = async (section, key) => {
  const line = (await send([`GET/PROJEXTSTATE/${section}/${key}`]))
    .split('\n')
    .find((l) => l.startsWith('PROJEXTSTATE'))
  return line === undefined ? undefined : line.split('\t').slice(3).join('\t')
}

const writeExt = (section, key, value) => send([`SET/PROJEXTSTATE/${section}/${key}/${encodeURIComponent(value)}`])

const roundTrip = async (name, value, options = {}) => {
  const key = `rt_${name.replace(/\W+/g, '_')}`
  try {
    await writeExt(SECTION, key, value)
    const back = await readExt(SECTION, key)
    const shown = back === undefined ? 'undefined' : JSON.stringify(back.length > 60 ? back.slice(0, 57) + '...' : back)
    report(
      back === value,
      `ext state round trip: ${name}`,
      back === value ? `${value.length} chars` : `got ${shown}`,
      options,
    )
  } catch (error) {
    report(false, `ext state round trip: ${name}`, String(error), options)
  } finally {
    await writeExt(SECTION, key, '').catch(() => {})
  }
}

const regions = async () =>
  (await send(['REGION']))
    .split('\n')
    .filter((l) => l.startsWith('REGION'))
    .map((l) => {
      const f = l.split('\t')
      return { name: f[1], id: f[2], start: Number(f[3]), end: Number(f[4]) }
    })

// --- 1. connectivity and status -------------------------------------------------------
try {
  const text = await send(['TRANSPORT', 'REGION', 'TRACK'])
  const transport = text.split('\n').find((l) => l.startsWith('TRANSPORT'))
  report(transport !== undefined, 'web remote reachable', base)
  const fields = transport?.split('\t') ?? []
  report(
    fields.length >= 3 && Number.isFinite(Number(fields[2])),
    'TRANSPORT parses',
    `playstate=${fields[1]} pos=${fields[2]}`,
  )
  const tracks = text.split('\n').filter((l) => l.startsWith('TRACK'))
  report(tracks.length > 0, 'TRACK lines present', `${tracks.length} tracks incl. master`)
  const peak = tracks[1]?.split('\t')[6]
  report(peak !== undefined, 'track peak field present', `raw=${peak} (tenths of dB expected)`)
} catch (error) {
  report(false, 'web remote reachable', String(error))
  console.log('\nEnable it in REAPER: Preferences > Control/OSC/web > Add > Web browser interface (port 8080).')
  process.exit(1)
}

// --- 2. ext state round trips --------------------------------------------------------
await roundTrip('plain', 'Twinkle')
await roundTrip('spaces', 'Twinkle Little Star')
await roundTrip('punctuation', "Ode to Joy! (rough) - v2, it's #1?")
await roundTrip('unicode', 'Für Elise ✨ 🎹')
await roundTrip('percent', '100% done')
await roundTrip('plus', 'A+B')
await roundTrip('ampersand', 'Tom & Jerry')
await roundTrip('semicolon (app strips these)', 'a;b', { info: true })
await roundTrip('slash (app strips these)', 'a/b', { info: true })
await roundTrip('json', JSON.stringify({ v: 1, clips: { 12: { label: 'Twinkle', starred: true } } }))
await roundTrip('long 1000', 'x'.repeat(1000))
for (const size of [4000, 16000, 64000]) {
  await roundTrip(`long ${size} (size ceiling)`, 'x'.repeat(size), { info: true })
}

// --- 3. rename round trip through the watcher ----------------------------------------
const clips = (await regions()).filter((r) => /^(Clip|Take) \d+/.test(r.name))
if (clips.length === 0) {
  console.log(
    '\nSKIP  rename via watcher: no "Clip N" region in the project. Record a clip with the watcher running, or add a region named "Clip 1 - test".',
  )
} else {
  const target = clips[0]
  const label = `Probe ${Date.now() % 100000}`
  await writeExt('Studio', `rename_${target.id}`, label)
  const deadline = Date.now() + 5000
  let renamed
  while (Date.now() < deadline) {
    renamed = (await regions()).find((r) => r.id === target.id)
    if (renamed?.name.endsWith(label)) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const ok = renamed?.name.endsWith(label) ?? false
  report(
    ok,
    'rename via watcher',
    ok ?
      `"${target.name}" -> "${renamed.name}"`
    : `still "${renamed?.name}"; request key ${(await readExt('Studio', `rename_${target.id}`)) === undefined ? 'consumed' : 'still pending'}`,
  )
  if (!ok)
    console.log(
      '      Is cs-studio-watcher.lua running in this REAPER? (Actions > Load ReaScript reports "already running" if so.)',
    )
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
