// Usage: node finish-check.mjs
// Run from the root of a worktree before each push. Prints PASS, FAIL, WARN, or SKIP for each check.
// Exits 1 when a check fails. Runs no heavy command.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { ok: result.status === 0, out: `${result.stdout}${result.stderr}`.trim(), stdout: result.stdout ?? '' }
}
const lines = (text) => text.split('\n').filter((line) => line !== '')
const lastLine = (text) => lines(text).at(-1) ?? 'no output'

let failed = false
const pass = (name) => console.log(`PASS ${name}`)
const fail = (name, reason) => {
  failed = true
  console.log(`FAIL ${name}: ${reason}`)
}

// 1. Install
const install = run('pnpm', ['install', '--offline', '--frozen-lockfile'])
if (install.ok) pass('install')
else fail('install', lastLine(install.out))

// 2. Sync and README
const statusBefore = new Set(lines(run('git', ['status', '--porcelain']).stdout))
const sync = run('pnpm', ['sync'])
const readme = run('pnpm', ['update-readme'])
const changedBySync = lines(run('git', ['status', '--porcelain']).stdout).filter((line) => !statusBefore.has(line))
if (!sync.ok) fail('sync', lastLine(sync.out))
else if (!readme.ok) fail('update-readme', lastLine(readme.out))
else if (changedBySync.length > 0) fail('sync', `changed ${changedBySync.map((line) => line.slice(3)).join(', ')}`)
else pass('sync')

// 3. Prettier
const branchFiles = lines(run('git', ['diff', '--name-only', '--diff-filter=d', 'origin/main...HEAD']).stdout)
const statusFiles = lines(run('git', ['status', '--porcelain', '-uall']).stdout)
  .filter((line) => !line.startsWith(' D') && !line.startsWith('D '))
  .map((line) => line.slice(3).replace(/^.* -> /, ''))
const files = [...new Set([...branchFiles, ...statusFiles])]
if (files.length === 0) pass('prettier')
else {
  const prettier = run('pnpm', ['exec', 'prettier', '--check', '--ignore-unknown', ...files])
  if (prettier.ok) pass('prettier')
  else {
    const bad = lines(prettier.out)
      .filter((line) => line.startsWith('[warn]') && !line.includes('Code style issues'))
      .map((line) => line.slice(7))
    fail('prettier', bad.length > 0 ? bad.join(', ') : lastLine(prettier.out))
  }
}

// 4. OpenSpec
const openspec = run('pnpm', ['exec', 'openspec', 'validate', '--specs'])
if (openspec.ok) pass('openspec validate')
else fail('openspec validate', lastLine(openspec.out))

// 5. Architecture render
const render = 'nodejs/wishem/docs/architecture/render.mjs'
if (readFileSync(render, 'utf8').includes('--check')) {
  const check = run('node', [render, '--check'])
  if (check.ok) pass('render --check')
  else fail('render --check', lastLine(check.out))
} else console.log('SKIP render --check')

// 6. Changesets
const committed = lines(
  run('git', ['diff', '--name-only', '--diff-filter=A', 'origin/main...HEAD', '--', '.changeset']).stdout,
)
const uncommitted = lines(run('git', ['status', '--porcelain', '-uall', '--', '.changeset']).stdout)
  .filter((line) => line.startsWith('??') || line.startsWith('A '))
  .map((line) => line.slice(3))
const changesets = [...new Set([...committed, ...uncommitted])].filter(
  (file) => file.endsWith('.md') && !file.endsWith('README.md'),
)
if (changesets.length === 0) fail('changeset', 'the branch adds no file in .changeset/')
else {
  pass('changeset')
  for (const file of changesets) {
    const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, 'utf8'))?.[1] ?? ''
    const count = lines(front).length
    if (count > 1) {
      console.log(
        `WARN changeset ${file}: ${count} packages; one changeset for each change (~/.claude/rules/changesets.md)`,
      )
    }
  }
}

// 7. Clean tree
const dirty = lines(run('git', ['status', '--porcelain']).stdout)
if (dirty.length === 0) pass('git status')
else fail('git status', `${dirty.length} uncommitted: ${dirty.map((line) => line.slice(3)).join(', ')}`)

process.exit(failed ? 1 : 0)
