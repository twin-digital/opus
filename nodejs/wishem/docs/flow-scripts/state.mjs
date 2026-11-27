// Usage: node nodejs/wishem/docs/flow-scripts/state.mjs
// Prints the state of the autonomous Wishem work from its sources. Nothing in this output is kept by hand.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const env = { ...process.env, GH_ORG: 'twin-digital' }
const run = (command, args) => {
  try {
    return execFileSync(command, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    return `error: ${String(error.stderr ?? error.message).split('\n')[0]}`
  }
}
const json = (command, args) => {
  const out = run(command, args)
  try {
    return JSON.parse(out)
  } catch {
    return undefined
  }
}
const section = (title) => console.log(`\n## ${title}\n`)
const REPO = 'twin-digital/opus'

section('Project items that are not Todo and not Done')
const items =
  json('gh', ['project', 'item-list', '6', '--owner', 'twin-digital', '--format', 'json', '--limit', '300'])?.items ??
  []
for (const status of ['In Progress', 'Blocked']) {
  for (const item of items.filter((entry) => entry.status === status)) {
    console.log(`- ${status}: #${item.content?.number} ${item.title}`)
  }
}

section('Open pull requests of Wishem')
const pulls =
  json('gh', [
    'pr',
    'list',
    '-R',
    REPO,
    '--state',
    'open',
    '--json',
    'number,title,headRefName,isDraft',
    '--limit',
    '50',
  ]) ?? []
for (const pull of pulls.filter(
  (entry) => /wishem/i.test(entry.title) || /^worktree-|^\d{3}-/.test(entry.headRefName),
)) {
  const checks = run('gh', ['pr', 'checks', String(pull.number), '-R', REPO])
  const failed = checks
    .split('\n')
    .filter((line) => /\tfail\t/.test(line))
    .map((line) => line.split('\t')[0])
  const pending = /\tpending\t/.test(checks)
  const state =
    failed.length > 0 ? `checks failed: ${failed.join(', ')}`
    : pending ? 'checks run'
    : 'checks passed'
  console.log(`- #${pull.number}${pull.isDraft ? ' (draft)' : ''} ${pull.title} [${pull.headRefName}] ${state}`)
}

section(
  'Worktrees of this work (a name that starts with an issue number, a milestone, or flow-), with the ledger of each one',
)
const worktrees = run('git', ['worktree', 'list', '--porcelain'])
  .split('\n\n')
  .map((block) =>
    Object.fromEntries(block.split('\n').map((line) => [line.split(' ')[0], line.split(' ').slice(1).join(' ')])),
  )
  .filter((tree) => /\/\.claude\/worktrees\/(\d{3}-|a\d+-|flow-)/.test(tree.worktree ?? ''))
for (const tree of worktrees) {
  const branch = (tree.branch ?? '').replace('refs/heads/', '')
  const ahead = run('git', ['rev-list', '--count', `origin/main..${branch}`])
  const pushed =
    run('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]).startsWith('error') ?
      'not pushed'
    : 'pushed'
  console.log(`- ${tree.worktree} [${branch}] ${ahead} commits ahead of main, ${pushed}`)
  const sdd = join(tree.worktree, '.superpowers', 'sdd')
  if (!existsSync(sdd)) continue
  for (const folder of readdirSync(sdd)) {
    const ledger = join(sdd, folder, 'progress.md')
    if (!existsSync(ledger)) continue
    const lines = readFileSync(ledger, 'utf8').trim().split('\n')
    console.log(`  ${lines[0]}`)
    console.log(`  ledger: ${ledger}`)
    for (const line of lines.filter((entry) => entry.trim() !== '').slice(-3)) {
      console.log(`    ${line.length > 300 ? `${line.slice(0, 300)}...` : line}`)
    }
  }
}

section('Issues that wait for the owner')
const waiting =
  json('gh', ['api', `repos/${REPO}/issues?state=open&assignee=skleinjung&labels=app:wishem&per_page=50`]) ?? []
for (const issue of waiting) {
  console.log(`- #${issue.number} [${issue.type?.name ?? 'no type'}] ${issue.title}`)
}

section('Break-test issues that are open, the oldest first')
const open =
  json('gh', ['api', `repos/${REPO}/issues?state=open&labels=app:wishem&sort=created&direction=asc&per_page=100`]) ?? []
for (const issue of open.filter((entry) => entry.title.startsWith('Break-test:'))) {
  console.log(`- #${issue.number} ${issue.title}`)
}

section('Processes that can hold the lock or that stayed alive')
const alive = run('pgrep', ['-af', 'vitest|playwright|wishem.js start'])
console.log(alive === '' || alive.startsWith('error:') ? 'none' : alive)
