/**
 * REAPER probe, Node half: checks REAPER's web remote and, with `reaper-probe.lua` running inside
 * REAPER, what scripts see, against what the simulator models. Each line prints PASS or FAIL where
 * the simulator models the behavior, and INFO where it only records it.
 *
 *   node probe/reaper-probe.ts http://[user:password@]<reaper host>:8080
 */

const target = new URL(process.argv[2] ?? 'http://127.0.0.1:8080')
const credentials =
  target.username === '' ? undefined : `${decodeURIComponent(target.username)}:${decodeURIComponent(target.password)}`
target.username = ''
target.password = ''
const base = target.href.replace(/\/+$/, '')
const headers: Record<string, string> =
  credentials === undefined ? {} : { authorization: `Basic ${Buffer.from(credentials).toString('base64')}` }

const S = 'THRASHPLAY_PROBE'
const KEYS_SECTION = 'THRASHPLAY_PROBE_KEYS'
const LUA_SECTION = 'Probe_Lua_Section'
const LUA_KEY = 'Probe_Lua_Key'
let failures = 0

const request = async (commands: string[], { timeoutMs = 5000, auth = true } = {}) => {
  const response = await fetch(`${base}/_/${commands.join(';')}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: auth ? headers : {},
  })
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) }
}

const send = async (commands: string[], options?: { timeoutMs?: number; auth?: boolean }) => {
  const { status, bytes } = await request(commands, options)
  return { status, body: new TextDecoder().decode(bytes) }
}

const field = (reply: string) => (reply.split('\n')[0] ?? '').split('\t').slice(3).join('\t')
const readGlobal = async (key: string) => field((await send([`GET/EXTSTATE/${S}/${key}`])).body)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')

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
      return Date.now()
    }
    await sleep(50)
  }
  throw new Error(`The Lua probe did not acknowledge ${name}`)
}

/**
 * A key padded so a command cut off at 1023 characters leaves `remainder` characters of the last
 * `unit`-character piece of its value.
 */
const paddedKey = (name: string, unit: number, remainder: number) => {
  let key = name
  while ((1023 - `SET/EXTSTATE/${S}/${key}/`.length) % unit !== remainder) {
    key += 'X'
  }
  return key
}

// the web remote alone

if (credentials !== undefined) {
  check('a request without credentials is refused', (await send(['TRANSPORT'], { auth: false })).status)
}

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

// a cut through %C3%A9 (é) after %C3, and through %41 (A) after %4
const utf8Key = paddedKey('CUTUTF', 6, 3)
await send([`SET/EXTSTATE/${S}/${utf8Key}/${encodeURIComponent('é'.repeat(200))}`])
const utf8Reply = await request([`GET/EXTSTATE/${S}/${utf8Key}`])
const utf8Text = field(new TextDecoder().decode(utf8Reply.bytes))
check('a cut through a UTF-8 character reads back as a replacement character', utf8Text.slice(-2), 'é�')
check('raw bytes ending the reply to that cut', hex(utf8Reply.bytes.slice(-8)))
const escapeKey = paddedKey('CUTPCT', 3, 2)
await send([`SET/EXTSTATE/${S}/${escapeKey}/${'%41'.repeat(400)}`])
check(
  'a cut through a %-escape leaves it literal',
  field((await send([`GET/EXTSTATE/${S}/${escapeKey}`])).body).slice(-3),
  'A%4',
)

check(
  'GET of a missing key replies with an empty value',
  (await send([`GET/EXTSTATE/${S}/MISSING`])).body,
  `EXTSTATE\t${S}\tMISSING\t\n`,
)
// REAPER answers 200 with no reply; the simulator answers 501 on purpose
check('unknown commands', await send(['NOT/A/COMMAND']))

// SET decodes a key's percent-escapes and GET doesn't, so encoded keys can be written but not read back
for (const [key, readsBack] of [
  ['KEY.DOT', '1'],
  ['KEY-DASH', '1'],
  ['KEY%3DEQUALS', ''],
  ['KEY%20SPACE', ''],
  ['KEY%2FSLASH', ''],
]) {
  await send([`SET/PROJEXTSTATE/${KEYS_SECTION}/${key}/1`])
  check(
    `a key spelled ${key} reads back`,
    field((await send([`GET/PROJEXTSTATE/${KEYS_SECTION}/${key}`])).body),
    readsBack,
  )
}

await send([
  `SET/EXTSTATE/${S}/ESC/`,
  `SET/EXTSTATE/${S}/JSON/`,
  `SET/EXTSTATE/${S}/BIGIN/`,
  `SET/EXTSTATE/${S}/${utf8Key}/`,
  `SET/EXTSTATE/${S}/${escapeKey}/`,
])

// with the Lua half

console.log('\nWaiting for reaper-probe.lua to start in REAPER...')
while ((await readGlobal('R_READY')) !== '1') {
  await sleep(1000)
}
check('project dirty state, before and after a Lua project ext-state write', await readGlobal('R_DIRTY_LUA'))

await step('CASE')
check(
  'Lua enumerates web-written project keys upper-cased, finding the section in any case',
  await readGlobal('R_PROJKEYS'),
  'upper=[MIXED_KEY,STEP] lower=[MIXED_KEY,STEP]',
)
check('Lua reads web-written global keys in any case', await readGlobal('R_GLOBAL'), 'upper=g1 asWritten=g1 lower=g1')
check(
  'Lua reads its own mixed-case keys in another case',
  await readGlobal('R_LUA_CASE'),
  'projectOtherCase=p globalOtherCase=g',
)
check('project dirty after web remote project ext-state writes', await readGlobal('R_DIRTY_WEB'))
for (const [kind, value] of [
  ['PROJEXTSTATE', 'p'],
  ['EXTSTATE', 'g'],
] as const) {
  const spellings = [
    `${LUA_SECTION}/${LUA_KEY}`,
    `${LUA_SECTION}/${LUA_KEY}`.toUpperCase(),
    'probe_LUA_section/probe_lua_KEY',
  ]
  const found = []
  for (const spelling of spellings) {
    found.push(field((await send([`GET/${kind}/${spelling}`])).body))
  }
  check(`web ${kind} reads a Lua-written mixed-case key: exact, upper-case, other spelling`, found, [
    value,
    value,
    value,
  ])
}

await step('KEYS')
check(
  'odd keys as Lua enumerates them, decoded',
  await readGlobal('R_KEYS'),
  'KEY SPACE | KEY-DASH | KEY.DOT | KEY/SLASH | KEY=EQUALS',
)

for (const key of ['ZETA', 'ALPHA', 'MIDDLE']) {
  await send([`SET/PROJEXTSTATE/${S}/${key}/1`])
}
await step('ORDER')
check('EnumProjExtState sorts keys (written ZETA, ALPHA, MIDDLE)', await readGlobal('R_ORDER'), 'ALPHA,MIDDLE,ZETA')

await send([
  `SET/EXTSTATE/${S}/WEB_EMPTY/x`,
  `SET/EXTSTATE/${S}/WEB_EMPTY/`,
  `SET/PROJEXTSTATE/${S}/WEB_PEMPTY/x`,
  `SET/PROJEXTSTATE/${S}/WEB_PEMPTY/`,
])
await step('EMPTY')
check(
  'an empty value keeps a global key but deletes a project key, from Lua or the web remote',
  await readGlobal('R_EMPTY'),
  'luaEmptyKeeps=true webEmptyKeeps=true webProjectEmptyKeeps=false',
)

const wall1 = await step('SCRIPT')
check('script environment', await readGlobal('R_SCRIPT'))
check('EnumerateFiles of the script directory, with and without a trailing separator', await readGlobal('R_FILES'))
check('EnumProjects(-1) handles compare equal', (await readGlobal('R_PROJECTS')).split(' ')[0], 'sameHandle=true')
check('current project', await readGlobal('R_PROJECTS'))

await step('ESCAPE')
check(
  'replies escape values Lua wrote, and pass UTF-8 through',
  field((await send([`GET/EXTSTATE/${S}/LUA_ESC`])).body),
  '{"text":"a\\\\tb"}\\t"q" \\\\ \\n é 🎹',
)

// requests sent together 200 ms into a one-second tick: does each wait for the tick to end?
await send([`SET/PROJEXTSTATE/${S}/STEP/BUSY`])
await sleep(200)
const waitsForTick = async (commands: string[]) => {
  const started = performance.now()
  await send(commands)
  return performance.now() - started > 500
}
const waited = await Promise.all([
  waitsForTick(['TRANSPORT']),
  waitsForTick([`GET/EXTSTATE/${S}/MIXED_KEY`]),
  waitsForTick([`SET/PROJEXTSTATE/${S}/MIDTICK/1`]),
])
for (let i = 0; i < 100 && (await readGlobal('R_ACK')) !== 'BUSY'; i++) {
  await sleep(50)
}
check('during a busy Lua tick, requests wait: TRANSPORT, ext-state GET, ext-state SET', waited, [true, true, true])
check('Lua sees a web remote write land during its tick', await readGlobal('R_MIDTICK'), 'before= after=')

const wall2 = await step('BIG')
for (const n of [2000, 5000, 20000, 100000]) {
  check(`reply length for a ${String(n)}-character value`, (await readGlobal(`BIG${String(n)}`)).length)
}
const luaSeconds = Number(await readGlobal('R_T2')) - Number(await readGlobal('R_T1'))
const ratio = luaSeconds / ((wall2 - wall1) / 1000)
check('time_precise counts seconds (ratio to wall time within 25%)', Math.abs(ratio - 1) < 0.25, true)
check('time_precise seconds per wall second', Number(ratio.toFixed(3)))

await send([`SET/PROJEXTSTATE/rpp_web_section/rpp_web_key/w`])
await step('TABS')
check('how a saved project file stores ext state', await readGlobal('R_RPP'))
check(
  'opening another file, then the same file again, in the tab',
  await readGlobal('R_TABS'),
  'openSameHandle=true openPathChanged=true reopenSameHandle=true reopenSamePath=true',
)

await send([`SET/PROJEXTSTATE/${S}/STEP/DONE`])
console.log('\nThe Lua probe now ends with a deliberate error. Dismiss any error dialog REAPER shows.')
let atexit = ''
for (let i = 0; i < 60 && atexit === ''; i++) {
  await sleep(1000)
  atexit = await readGlobal('R_ATEXIT').catch(() => '')
}
check('atexit runs when a script dies of an error', atexit === 'ran', false)
await send([`SET/EXTSTATE/${S}/R_ATEXIT/`]).catch(() => undefined)

// the largest request REAPER answers; requests that big once went unanswered, so this runs last
const answers = async (length: number) => {
  const commands = Array.from({ length: Math.ceil(length / 30) }, () => `GET/EXTSTATE/${S}/NOTHING`)
  return request(commands, { timeoutMs: 3000 }).then(
    ({ status }) => status === 200,
    () => false,
  )
}
let answered = 1000
let unanswered = 64_000
if (await answers(unanswered)) {
  answered = unanswered
} else {
  while (unanswered - answered > 500) {
    const middle = Math.round((answered + unanswered) / 2)
    if (await answers(middle)) {
      answered = middle
    } else {
      unanswered = middle
    }
  }
}
check('largest request answered, in characters (to within 500)', answered)

console.log(
  `\n${failures === 0 ? 'The simulator matches REAPER on everything checked.' : `${String(failures)} difference(s) from the simulator.`}`,
)
