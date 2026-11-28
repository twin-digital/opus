// Usage: node heavy.mjs <command> [<argument>...]
// Runs a heavy command (lint, type check, test, build) in a free slot, with `timeout 140`.
// The number of slots is in ~/.local/state/wishem/heavy-slots (default 2, at most 4).
// Waits at most 15 seconds for a free slot. Exits 75 with no run when each slot stays busy; then try again.
// Each call appends one line to ~/.local/state/wishem/heavy-log.csv.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STATE = join(homedir(), '.local', 'state', 'wishem')
const LOG = join(STATE, 'heavy-log.csv')
const SLOT_FILE = join(STATE, 'heavy-slots')
export const ALL_SLOTS = [
  '/tmp/wishem-heavy.lock',
  '/tmp/wishem-heavy-2.lock',
  '/tmp/wishem-heavy-3.lock',
  '/tmp/wishem-heavy-4.lock',
]
const BUSY = 201
const WAIT_MS = 15_000
const POLL_MS = 500

const command = process.argv.slice(2)
if (command.length === 0) {
  console.error('usage: node heavy.mjs <command> [<argument>...]')
  process.exit(2)
}

const slotCount = () => {
  const value = existsSync(SLOT_FILE) ? Number.parseInt(readFileSync(SLOT_FILE, 'utf8'), 10) : 2
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), ALL_SLOTS.length) : 2
}

// Writes one line: time,slot,wait_ms,run_ms,exit,slots,command
const log = (slot, waitMs, runMs, exit, slots) => {
  try {
    mkdirSync(STATE, { recursive: true })
    if (!existsSync(LOG)) appendFileSync(LOG, 'time,slot,wait_ms,run_ms,exit,slots,command\n')
    const text = command.join(' ').replaceAll('"', "'").slice(0, 200)
    appendFileSync(LOG, `${new Date().toISOString()},${slot},${waitMs},${runMs},${exit},${slots},"${text}"\n`)
  } catch {
    // The log must never stop a command.
  }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const slots = ALL_SLOTS.slice(0, slotCount())
const start = Date.now()
const deadline = start + WAIT_MS
for (;;) {
  for (const [index, slot] of slots.entries()) {
    const began = Date.now()
    const run = spawnSync('flock', ['-n', '-E', String(BUSY), slot, 'timeout', '140', ...command], {
      stdio: 'inherit',
    })
    if (run.error) throw run.error
    if (run.status !== BUSY) {
      const exit = run.status ?? 1
      log(index + 1, began - start, Date.now() - began, exit, slots.length)
      process.exit(exit)
    }
  }
  if (Date.now() >= deadline) break
  sleep(POLL_MS)
}
log('busy', Date.now() - start, 0, 75, slots.length)
console.error('heavy: each slot is busy. Run the same command again.')
process.exit(75)
