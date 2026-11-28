// Usage: node heavy-stats.mjs [<since, ISO time>]
// Summarizes ~/.local/state/wishem/heavy-log.csv: calls, busy share, waits, and the use of each slot.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOG = join(homedir(), '.local', 'state', 'wishem', 'heavy-log.csv')
const since = process.argv[2] ? Date.parse(process.argv[2]) : 0

if (!existsSync(LOG)) {
  console.log('no heavy log yet')
  process.exit(0)
}

const rows = readFileSync(LOG, 'utf8')
  .split('\n')
  .slice(1)
  .filter(Boolean)
  .map((line) => {
    const [time, slot, wait, run, exit, slots] = line.split(',')
    return {
      at: Date.parse(time),
      slot,
      wait: Number(wait),
      run: Number(run),
      exit: Number(exit),
      slots: Number(slots),
    }
  })
  .filter((row) => row.at >= since)

if (rows.length === 0) {
  console.log('no heavy calls in the period')
  process.exit(0)
}

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
}
const ran = rows.filter((row) => row.slot !== 'busy')
const busy = rows.length - ran.length
const first = Math.min(...rows.map((row) => row.at))
const last = Math.max(...rows.map((row) => row.at + row.run))
const span = Math.max(last - first, 1)

console.log(`period: ${new Date(first).toISOString()} to ${new Date(last).toISOString()}`)
console.log(
  `calls: ${rows.length}, ran: ${ran.length}, busy (exit 75): ${busy} (${((100 * busy) / rows.length).toFixed(1)} %)`,
)
console.log(`slots now: ${rows.at(-1).slots}`)
console.log(
  `wait before a run, seconds: median ${(
    quantile(
      ran.map((r) => r.wait),
      0.5,
    ) / 1000
  ).toFixed(1)}, p90 ${(
    quantile(
      ran.map((r) => r.wait),
      0.9,
    ) / 1000
  ).toFixed(1)}`,
)
console.log(
  `run time, seconds: median ${(
    quantile(
      ran.map((r) => r.run),
      0.5,
    ) / 1000
  ).toFixed(1)}, p90 ${(
    quantile(
      ran.map((r) => r.run),
      0.9,
    ) / 1000
  ).toFixed(1)}`,
)
for (const slot of [...new Set(ran.map((row) => row.slot))].sort()) {
  const used = ran.filter((row) => row.slot === slot).reduce((sum, row) => sum + row.run, 0)
  console.log(`slot ${slot}: in use ${((100 * used) / span).toFixed(1)} % of the period`)
}
