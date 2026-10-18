#!/usr/bin/env node

/**
 * Probes REAPER's web remote the way the studio app uses it, and prints PASS/FAIL per check:
 * connectivity, status parsing, project ext-state round trips (spaces, punctuation, unicode,
 * separators, long values), and, with the studio watcher loaded, that a rename request written
 * to ext state renames a "Clip N" region within a few seconds.
 *
 *   music-reaper-probe [http://localhost:8080]
 *
 * The PowerShell copy in reaper/reaper-probe.ps1 runs the same checks where Node is not installed.
 */

const base = (process.argv[2] ?? 'http://localhost:8080').replace(/\/+$/, '')
const SECTION = 'StudioProbe'
let failures = 0

const send = async (commands: string[]): Promise<string> => {
  const response = await fetch(`${base}/_/${commands.join(';')}`, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)}`)
  }
  return response.text()
}

// info checks map the edges (what the app avoids or never sends); they never fail the run
const report = (ok: boolean, name: string, detail = '', { info = false } = {}) => {
  if (!ok && !info) {
    failures += 1
  }
  const tag =
    ok ? 'PASS'
    : info ? 'INFO'
    : 'FAIL'
  console.log(`${tag}  ${name}${detail === '' ? '' : `  (${detail})`}`)
}

const readExt = async (section: string, key: string): Promise<string | undefined> => {
  const line = (await send([`GET/PROJEXTSTATE/${section}/${key}`]))
    .split('\n')
    .find((candidate) => candidate.startsWith('PROJEXTSTATE'))
  return line === undefined ? undefined : line.split('\t').slice(3).join('\t')
}

const writeExt = (section: string, key: string, value: string) =>
  send([`SET/PROJEXTSTATE/${section}/${key}/${encodeURIComponent(value)}`])

const roundTrip = async (name: string, value: string, options: { info?: boolean } = {}) => {
  const key = `rt_${name.replace(/\W+/g, '_')}`
  try {
    await writeExt(SECTION, key, value)
    const back = await readExt(SECTION, key)
    const shown = back === undefined ? 'undefined' : JSON.stringify(back.length > 60 ? `${back.slice(0, 57)}...` : back)
    const lengths = back === undefined ? '' : `sent ${String(value.length)}, got ${String(back.length)} chars: `
    report(
      back === value,
      `ext state round trip: ${name}`,
      back === value ? `${String(value.length)} chars` : `${lengths}${shown}`,
      options,
    )
  } catch (error) {
    report(false, `ext state round trip: ${name}`, String(error), options)
  } finally {
    await writeExt(SECTION, key, '').catch(() => undefined)
  }
}

interface Region {
  name: string
  id: string
  start: number
  end: number
}

const regions = async (): Promise<Region[]> =>
  (await send(['REGION']))
    .split('\n')
    .filter((line) => line.startsWith('REGION\t'))
    .map((line) => {
      const fields = line.split('\t')
      return { name: fields[1] ?? '', id: fields[2] ?? '', start: Number(fields[3]), end: Number(fields[4]) }
    })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// --- 1. connectivity and status -------------------------------------------------------
try {
  const text = await send(['TRANSPORT', 'REGION', 'TRACK'])
  const transport = text.split('\n').find((line) => line.startsWith('TRANSPORT'))
  report(transport !== undefined, 'web remote reachable', base)
  const fields = transport?.split('\t') ?? []
  report(
    fields.length >= 3 && Number.isFinite(Number(fields[2])),
    'TRANSPORT parses',
    `playstate=${fields[1] ?? '?'} pos=${fields[2] ?? '?'}`,
  )
  const tracks = text.split('\n').filter((line) => line.startsWith('TRACK'))
  report(tracks.length > 0, 'TRACK lines present', `${String(tracks.length)} tracks incl. master`)
  const peak = tracks.at(1)?.split('\t').at(6)
  report(peak !== undefined, 'track peak field present', `raw=${peak ?? '?'} (tenths of dB expected)`)
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
await roundTrip('long 200', 'x'.repeat(200))
for (const size of [300, 400, 500, 600, 800, 1000, 2000, 4000]) {
  await roundTrip(`long ${String(size)} (size ceiling)`, 'x'.repeat(size), { info: true })
}

// --- 3. rename round trip through the watcher ----------------------------------------
const clips = (await regions()).filter((region) => /^(Clip|Take) \d+/.test(region.name))
const target = clips.at(0)
if (target === undefined) {
  console.log(
    '\nSKIP  rename via watcher: no "Clip N" region in the project. Record a clip with the watcher running, or add a region named "Clip 1 - test".',
  )
} else {
  const label = `Probe ${String(Date.now() % 100000)}`
  await writeExt('Studio', `rename_${target.id}`, label)
  const deadline = Date.now() + 5000
  let renamed: Region | undefined
  while (Date.now() < deadline) {
    renamed = (await regions()).find((region) => region.id === target.id)
    if (renamed?.name.endsWith(label) === true) {
      break
    }
    await sleep(250)
  }
  const ok = renamed?.name.endsWith(label) === true
  const pending =
    ok ? ''
    : (await readExt('Studio', `rename_${target.id}`)) === '' ? 'consumed'
    : 'still pending'
  report(
    ok,
    'rename via watcher',
    ok ? `"${target.name}" -> "${renamed?.name ?? ''}"` : `still "${renamed?.name ?? '?'}"; request key ${pending}`,
  )
  if (!ok) {
    console.log(
      '      Is cs-studio-watcher.lua running in this REAPER? (Actions > Load ReaScript reports "already running" if so.)',
    )
  }
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${String(failures)} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
