// Usage: node merge-when-green.mjs <pull request number>
// Waits for the checks, merges with a squash, and updates the branch and waits again when main moved.
// The step "merge, or update the branch and wait for the checks" holds the lock `/tmp/wishem-merge.lock`,
// so that one pull request at a time is in that step. The wait for the first checks is outside the lock.
// Exit code: 0 when merged, 1 when not merged.
import { execFileSync } from 'node:child_process'
import { withMergeLock } from './merge-lock.mjs'

const pr = process.argv[2]
const env = { ...process.env, GH_ORG: 'twin-digital' }
const gh = (...args) => {
  try {
    return execFileSync('gh', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
  }
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const merged = () => gh('api', `repos/twin-digital/opus/pulls/${pr}`, '--jq', '.merged') === 'true'
const checks = () => gh('pr', 'checks', pr, '-R', 'twin-digital/opus')

// Waits until the checks end. Returns false, and prints the failed checks, when one check fails.
const waitForChecks = async () => {
  for (let i = 0; i < 120; i += 1) {
    const now = checks()
    if (now.includes('lint-build-test') && !/\bpending\b/.test(now)) break
    await sleep(15000)
  }
  const result = checks()
  if (!/\bfail\b/.test(result)) return true
  console.log(
    result
      .split('\n')
      .filter((line) => !line.includes('skipping'))
      .map((line) => line.split('\t').slice(0, 2).join('\t'))
      .join('\n'),
  )
  return false
}

const mergeOrUpdate = (round) =>
  withMergeLock(async () => {
    gh('pr', 'merge', pr, '-R', 'twin-digital/opus', '--squash')
    await sleep(4000)
    if (merged()) return 'merged'
    console.log(
      `round ${round}: not merged, update of the branch: ${gh('pr', 'update-branch', pr, '-R', 'twin-digital/opus')}`,
    )
    await sleep(40000)
    return (await waitForChecks()) ? 'updated' : 'failed'
  })

for (let round = 1; round <= 4 && !merged(); round += 1) {
  if (round === 1) await sleep(40000)
  if (!(await waitForChecks())) break
  if ((await mergeOrUpdate(round)) !== 'updated') break
}
const done = merged()
console.log(`${pr} merged=${done}`)
process.exit(done ? 0 : 1)
