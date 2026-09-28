/**
 * REAPER probe, Node half: checks REAPER's web remote and, with `reaper-probe.lua` running inside
 * REAPER, what scripts see, against what the simulator models. Each line prints PASS or FAIL where
 * the simulator models the behavior, and INFO where it only records it.
 *
 *   node probe/reaper-probe.ts http://<reaper host>:8080
 */

const base = (process.argv[2] ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const S = 'THRASHPLAY_PROBE'
let failures = 0

const send = async (commands: string[], timeoutMs = 5000) => {
  const response = await fetch(`${base}/_/${commands.join(';')}`, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: response.status, body: await response.text() }
}

const field = (reply: string) => (reply.split('\n')[0] ?? '').split('\t').slice(3).join('\t')
const readGlobal = async (key: string) => field((await send([`GET/EXTSTATE/${S}/${key}`])).body)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const check = (name: string, observed: unknown, expected?: unknown) => {
  const shown = JSON.stringify(observed)
  if (expected === undefined) {
    console.log(`INFO  ${name}: ${shown}`)
  } else if (JSON.stringify(expected) === shown) {
    console.log(`PASS  ${name}: ${shown}`)
  } else {
    failures += 1
    console.log(`FAIL  ${name}: ${shown}, simulator models ${JSON.stringify(expected)}`)
  }
}

const step = async (name: string) => {
  await send([`SET/PROJEXTSTATE/${S}/STEP/${name}`])
  for (let i = 0; i < 100; i++) {
    if ((await readGlobal('R_ACK')) === name) {
      return
    }
    await sleep(50)
  }
  throw new Error(`The Lua probe did not acknowledge ${name}`)
}

// the web remote alone

await send([`SET/PROJEXTSTATE/${S.toLowerCase()}/mixed_Key/p1`, `SET/EXTSTATE/${S.toLowerCase()}/mixed_Key/g1`])
check(
  'project GET echoes the section and key as asked, matching any case',
  (await send([`GET/PROJEXTSTATE/${S.toLowerCase()}/mixed_key`])).body,
  `PROJEXTSTATE\t${S.toLowerCase()}\tmixed_key\tp1\n`,
)
check('global GET matches any case', field((await send([`GET/EXTSTATE/${S}/MIXED_KEY`])).body), 'g1')

const tricky = 'a\tb\nc\\d'
await send([`SET/EXTSTATE/${S}/ESC/${encodeURIComponent(tricky)}`])
check(
  'replies escape tabs, newlines and backslashes',
  field((await send([`GET/EXTSTATE/${S}/ESC`])).body),
  'a\\tb\\nc\\\\d',
)

const json = JSON.stringify({ path: 'a/b;c', text: 'é 🎹 %41' })
await send([`SET/EXTSTATE/${S}/JSON/${encodeURIComponent(json)}`])
check('encoded JSON round-trips', field((await send([`GET/EXTSTATE/${S}/JSON`])).body), json)

const prefix = `SET/EXTSTATE/${S}/BIGIN/`
await send([`${prefix}${'x'.repeat(1100)}`])
check(
  'commands are cut off at 1023 characters',
  field((await send([`GET/EXTSTATE/${S}/BIGIN`])).body).length,
  1023 - prefix.length,
)

check(
  'GET of a missing key replies with an empty value',
  (await send([`GET/EXTSTATE/${S}/MISSING`])).body,
  `EXTSTATE\t${S}\tMISSING\t\n`,
)
// REAPER answers 200 with no reply; the simulator answers 501 on purpose
check('unknown commands', await send(['NOT/A/COMMAND']))

await send([`SET/EXTSTATE/${S}/ESC/`, `SET/EXTSTATE/${S}/JSON/`, `SET/EXTSTATE/${S}/BIGIN/`])

// with the Lua half

console.log('\nWaiting for reaper-probe.lua to start in REAPER...')
while ((await readGlobal('R_READY')) !== '1') {
  await sleep(1000)
}
check('project dirty state, before and after a Lua project ext-state write', await readGlobal('R_DIRTY_LUA'))

await step('CASE')
check(
  'Lua sees web-written project keys upper-cased only',
  await readGlobal('R_PROJKEYS'),
  'upper=[MIXED_KEY,STEP] lower=[]',
)
check('Lua reads web-written global keys case-sensitively', await readGlobal('R_GLOBAL'), 'upper=g1 asWritten= lower=')
check('project dirty after web remote project ext-state writes', await readGlobal('R_DIRTY_WEB'))

for (const key of ['ZETA', 'ALPHA', 'MIDDLE']) {
  await send([`SET/PROJEXTSTATE/${S}/${key}/1`])
}
await step('ORDER')
check('EnumProjExtState order (written ZETA, ALPHA, MIDDLE)', await readGlobal('R_ORDER'), 'ZETA,ALPHA,MIDDLE')

await send([`SET/EXTSTATE/${S}/WEB_EMPTY/x`, `SET/EXTSTATE/${S}/WEB_EMPTY/`])
await step('EMPTY')
check(
  'an empty SetExtState, from Lua or the web remote, deletes the key',
  await readGlobal('R_EMPTY'),
  'luaEmptyKeeps=false webEmptyKeeps=false',
)

await step('SCRIPT')
check('script environment', await readGlobal('R_SCRIPT'))
check('EnumerateFiles of the script directory, with and without a trailing separator', await readGlobal('R_FILES'))
check('EnumProjects(-1) handles compare equal', (await readGlobal('R_PROJECTS')).split(' ')[0], 'sameHandle=true')
check('current project', await readGlobal('R_PROJECTS'))

await send([`SET/PROJEXTSTATE/${S}/STEP/BUSY`])
await sleep(200)
const started = performance.now()
await send(['TRANSPORT'])
const waited = performance.now() - started
for (let i = 0; i < 100 && (await readGlobal('R_ACK')) !== 'BUSY'; i++) {
  await sleep(50)
}
check('a request waits out a busy Lua tick (same thread)', waited > 500, true)

await step('BIG')
for (const n of [2000, 5000, 20000, 100000]) {
  check(`reply length for a ${String(n)}-character value`, (await readGlobal(`BIG${String(n)}`)).length)
}

await send([`SET/PROJEXTSTATE/${S}/STEP/DONE`])
console.log('\nThe Lua probe now ends with a deliberate error. Dismiss any error dialog REAPER shows.')
let atexit = ''
for (let i = 0; i < 60 && atexit === ''; i++) {
  await sleep(1000)
  atexit = await readGlobal('R_ATEXIT').catch(() => '')
}
check('atexit runs when a script dies of an error', atexit === 'ran', false)
await send([`SET/EXTSTATE/${S}/R_ATEXIT/`]).catch(() => undefined)

console.log(
  `\n${failures === 0 ? 'The simulator matches REAPER on everything checked.' : `${String(failures)} difference(s) from the simulator.`}`,
)
