// Usage: node heavy.mjs <command> [<argument>...]
// Runs a heavy command (lint, type check, test, build) in one of two slots, with `timeout 140`.
// Waits at most 15 seconds for a free slot. Exits 1 with no run when both slots stay busy; then try again.
import { spawnSync } from 'node:child_process'

export const SLOTS = ['/tmp/wishem-heavy.lock', '/tmp/wishem-heavy-2.lock']
const BUSY = 201
const WAIT_MS = 15_000
const POLL_MS = 500

const command = process.argv.slice(2)
if (command.length === 0) {
  console.error('usage: node heavy.mjs <command> [<argument>...]')
  process.exit(2)
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const deadline = Date.now() + WAIT_MS
for (;;) {
  for (const slot of SLOTS) {
    const run = spawnSync('flock', ['-n', '-E', String(BUSY), slot, 'timeout', '140', ...command], {
      stdio: 'inherit',
    })
    if (run.error) throw run.error
    if (run.status !== BUSY) process.exit(run.status ?? 1)
  }
  if (Date.now() >= deadline) break
  sleep(POLL_MS)
}
console.error('heavy: both slots are busy. Run the same command again.')
process.exit(1)
