// Usage: node merge-when-green.mjs <pull request number>
// Waits for the checks, merges with a squash, and updates the branch and waits again when main moved.
import { execFileSync } from 'node:child_process'

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

for (let round = 1; round <= 4 && !merged(); round += 1) {
  await sleep(40000)
  for (let i = 0; i < 120; i += 1) {
    const now = checks()
    if (now.includes('lint-build-test') && !/\bpending\b/.test(now)) break
    await sleep(15000)
  }
  const result = checks()
  if (/\bfail\b/.test(result)) {
    console.log(
      result
        .split('\n')
        .filter((line) => !line.includes('skipping'))
        .map((line) => line.split('\t').slice(0, 2).join('\t'))
        .join('\n'),
    )
    break
  }
  gh('pr', 'merge', pr, '-R', 'twin-digital/opus', '--squash')
  await sleep(4000)
  if (merged()) break
  console.log(
    `round ${round}: not merged, update of the branch: ${gh('pr', 'update-branch', pr, '-R', 'twin-digital/opus')}`,
  )
}
console.log(`${pr} merged=${merged()}`)
