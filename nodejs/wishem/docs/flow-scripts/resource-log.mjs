// Samples the resources of this container (cgroup v2) once a minute and appends one CSV line to resources.csv.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const dir = join(homedir(), '.local', 'state', 'wishem')
const out = join(dir, 'resources.csv')
const CG = '/sys/fs/cgroup'
const LOCKS = [
  '/tmp/wishem-heavy.lock',
  '/tmp/wishem-heavy-2.lock',
  '/tmp/wishem-heavy-3.lock',
  '/tmp/wishem-heavy-4.lock',
]
const HEAVY = /vitest|tsc|eslint|turbo|tsdown|playwright|godot|docker/
const intervalMs = Number(process.argv[2] ?? 60000)
const MB = 1024 * 1024

if (!existsSync(out)) {
  mkdirSync(dir, { recursive: true })
  appendFileSync(
    out,
    'time,mem_mb,mem_max_mb,mem_pct,anon_mb,file_mb,swap_mb,cpu_cores_used,cpu_quota_cores,cpu_pct,throttled_pct,mem_psi_some10,cpu_psi_some10,mem_max_events,oom_kills,heavy_lock_held,heavy_procs,node_procs\n',
  )
}

const read = (name) => readFileSync(join(CG, name), 'utf8').trim()
const keyed = (name) =>
  Object.fromEntries(
    read(name)
      .split('\n')
      .map((line) => line.split(' '))
      .map(([k, v]) => [k, Number(v)]),
  )
const psiSome10 = (name) => /avg10=([\d.]+)/.exec(read(name).split('\n')[0])?.[1] ?? ''
const limit = (value) => (value === 'max' ? Number.NaN : Number(value))

// Number of heavy slots in use.
const lockHeld = () => {
  const locks = readFileSync('/proc/locks', 'utf8').split('\n')
  return LOCKS.filter((lock) => {
    if (!existsSync(lock)) return false
    const inode = statSync(lock).ino
    return locks.some((line) => !line.includes('->') && line.split(/\s+/).some((field) => field.endsWith(`:${inode}`)))
  }).length
}

const processes = () => {
  let heavy = 0
  let node = 0
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue
    let cmd = ''
    try {
      cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ')
    } catch {
      continue
    }
    if (/(^|\/)node /.test(cmd)) node++
    if (HEAVY.test(cmd)) heavy++
  }
  return { heavy, node }
}

const cpuSnapshot = () => ({ at: Date.now(), ...keyed('cpu.stat') })
const maxEvents = () => keyed('memory.events').max

let last = cpuSnapshot()
let lastMaxEvents = maxEvents()
const sample = () => {
  const now = cpuSnapshot()
  const elapsedUsec = (now.at - last.at) * 1000
  const coresUsed = elapsedUsec > 0 ? (now.usage_usec - last.usage_usec) / elapsedUsec : 0
  const periods = now.nr_periods - last.nr_periods
  const throttled = periods > 0 ? (100 * (now.nr_throttled - last.nr_throttled)) / periods : 0
  last = now

  const [quota, period] = read('cpu.max').split(' ')
  const quotaCores = limit(quota) / Number(period)
  const mem = Number(read('memory.current'))
  const memMax = limit(read('memory.max'))
  const stat = keyed('memory.stat')
  const events = maxEvents()
  const { heavy, node } = processes()

  appendFileSync(
    out,
    [
      new Date().toISOString(),
      (mem / MB).toFixed(0),
      (memMax / MB).toFixed(0),
      ((100 * mem) / memMax).toFixed(1),
      (stat.anon / MB).toFixed(0),
      (stat.file / MB).toFixed(0),
      (Number(read('memory.swap.current')) / MB).toFixed(0),
      coresUsed.toFixed(2),
      quotaCores.toFixed(1),
      ((100 * coresUsed) / quotaCores).toFixed(1),
      throttled.toFixed(1),
      psiSome10('memory.pressure'),
      psiSome10('cpu.pressure'),
      events - lastMaxEvents,
      keyed('memory.events').oom_kill,
      lockHeld(),
      heavy,
      node,
    ].join(',') + '\n',
  )
  lastMaxEvents = events
}

setInterval(sample, intervalMs)
setTimeout(sample, 5000)
