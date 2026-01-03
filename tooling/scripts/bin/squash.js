#!/usr/bin/env node
import { $ } from 'execa'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const SQUASH_MARKER = 'This change incorporates the following commits:'

const parseArgs = (argv) => {
  const args = {
    message: undefined,
    baseBranch: 'main',
    dryRun: false,
    yes: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '-y' || a === '--yes') args.yes = true
    else if (a === '-m' || a === '--message') {
      args.message = argv[++i]
    } else if (a === '--base-branch') {
      args.baseBranch = argv[++i]
    } else if (a === '-h' || a === '--help') {
      printHelp()
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${a}`)
      printHelp()
      process.exit(1)
    }
  }
  return args
}

const printHelp = () => {
  console.log(
    `Usage: squash [options]\n\nOptions:\n  -m, --message <message>   Commit message header; defaults to current branch name\n  --base-branch <branch>    Base branch to squash against (must be ancestor). Default: main\n  --dry-run                 Show planned actions without changing history\n  -y, --yes                 Skip confirmation prompt (non-interactive approval)\n  -h, --help                Show this help message`,
  )
}

const getCurrentBranch = async () => {
  const { stdout } = await $`git rev-parse --abbrev-ref HEAD`
  return stdout.trim()
}

const ensureCleanWorkingTree = async () => {
  try {
    await $`git diff --quiet`
    await $`git diff --cached --quiet`
  } catch {
    throw new Error('Working tree must be clean (no staged or unstaged changes) before squashing.')
  }
}

const ensureDerivedFromBase = async (baseBranch) => {
  try {
    await $`git merge-base --is-ancestor ${baseBranch} HEAD`
  } catch {
    throw new Error(`Current branch is not derived from ${baseBranch}. Rebase/merge required.`)
  }
}

const getMergeBase = async (baseBranch) => {
  const { stdout } = await $`git merge-base ${baseBranch} HEAD`
  return stdout.trim()
}

const getCommitsShort = async (range, { reverse } = {}) => {
  const format = '%H%x00%h%x00%s%x00'
  const args = ['log']
  if (reverse) args.push('--reverse')
  args.push(`--pretty=${format}`, range)
  const { stdout } = await $({ reject: false })`git ${args}`
  const parts = stdout.split('\x00').filter((p) => p.length > 0)
  const result = []
  for (let i = 0; i + 2 < parts.length; i += 3) {
    result.push({
      sha: parts[i],
      shortSha: parts[i + 1],
      subject: parts[i + 2],
    })
  }
  return result
}

const getCommitsWithBodies = async (range, { reverse } = {}) => {
  const format = '%H%x00%B%x00'
  const args = ['log']
  if (reverse) args.push('--reverse')
  args.push(`--pretty=${format}`, range)
  const { stdout } = await $({ reject: false })`git ${args}`
  const parts = stdout.split('\x00').filter((p) => p.length > 0)
  const result = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    result.push({ sha: parts[i], body: parts[i + 1] })
  }
  return result
}

const extractHeaderAndBullets = (message) => {
  const lines = message.replaceAll('\r\n', '\n').split('\n')
  let headerEnd = lines.findIndex((l) => l.trim() === '')
  if (headerEnd === -1) headerEnd = lines.length
  const header = lines.slice(0, headerEnd).join('\n')

  const markerIdx = lines.findIndex((l) => l.includes(SQUASH_MARKER))
  const bullets = []
  if (markerIdx !== -1) {
    for (let i = markerIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim().length === 0) break
      if (line.trim().startsWith('- ')) bullets.push(line.trim().slice(2))
      else break
    }
  }
  return { header, bullets }
}

const buildMessage = ({ header, bullets }) => {
  return [header, '', SQUASH_MARKER, ...bullets.map((b) => `- ${b}`)].join('\n')
}

const main = async () => {
  const opts = parseArgs(process.argv)

  await ensureCleanWorkingTree()
  await ensureDerivedFromBase(opts.baseBranch)
  const mergeBase = await getMergeBase(opts.baseBranch)
  const currentBranch = await getCurrentBranch()

  const commits = await getCommitsWithBodies(`${mergeBase}..HEAD`, {
    reverse: true,
  })
  if (commits.length === 0) {
    console.log('No commits to squash.')
    return
  }

  const lastSquash = [...commits].reverse().find((c) => c.body.includes(SQUASH_MARKER))

  let priorBullets = []
  let newBullets = []
  let finalHeader

  if (lastSquash) {
    const parsed = extractHeaderAndBullets(lastSquash.body)
    priorBullets = parsed.bullets
    finalHeader = opts.message ?? parsed.header
    const newCommits = await getCommitsShort(`${lastSquash.sha}..HEAD`, {
      reverse: true,
    })
    newBullets = newCommits.map((c) => `${c.shortSha}: ${c.subject}`)
  } else {
    finalHeader = opts.message ?? currentBranch
    const range = `${mergeBase}..HEAD`
    const newCommits = await getCommitsShort(range, { reverse: true })
    newBullets = newCommits.map((c) => `${c.shortSha}: ${c.subject}`)
  }

  const allBullets = [...priorBullets, ...newBullets]
  if (allBullets.length === 0) {
    console.log('Nothing to include in squash commit.')
    return
  }

  const message = buildMessage({ header: finalHeader, bullets: allBullets })

  // Always show a preview of what will happen
  const previewRange = lastSquash ? `${lastSquash.sha}..HEAD` : `${mergeBase}..HEAD`
  console.log('Preview of squash commit:')
  console.log('Range  :', previewRange)
  console.log('Header :', finalHeader)
  console.log('Bullets:')
  for (const b of allBullets) console.log(`- ${b}`)
  console.log('\nFull message:\n---')
  console.log(message)
  console.log('---')

  if (opts.dryRun) {
    console.log('\nDry run complete. No changes made.')
    return
  }

  const confirmProceed = async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const answer = await new Promise((resolve) => rl.question('Proceed with squash? [y/N] ', resolve))
    rl.close()
    const input = String(answer).trim().toLowerCase()
    return input === 'y' || input === 'yes'
  }

  if (!opts.yes) {
    const approved = await confirmProceed()
    if (!approved) {
      console.log('Aborted. No changes made.')
      return
    }
  }

  // Perform squash atomically in a temporary worktree to avoid mutating the
  // current branch unless the final commit is created successfully.
  const tmpPrefix = path.join(os.tmpdir(), 'opus-squash-')
  const tmpDir = await fs.mkdtemp(tmpPrefix)
  const tmpBranch = `squash-tmp-${Date.now()}`

  console.log('Pushing current branch history, so commits are retrievable...')
  await $`git push --no-verify`

  console.log('Preparing temporary worktree for atomic squash...')
  await $`git worktree add -b ${tmpBranch} ${tmpDir} HEAD`

  try {
    await $({ cwd: tmpDir })`git reset --soft ${mergeBase}`
    await $({ cwd: tmpDir })`git commit -S -m ${message} --no-verify`
    const { stdout: newShaOut } = await $({ cwd: tmpDir })`git rev-parse HEAD`
    const newSha = newShaOut.trim()

    console.log('Applying squash commit to current branch...')
    await $`git reset --hard ${newSha}`
    console.log('Squash commit created.')

    console.log('Pushing squashed history...')
    await $`git push --force-with-lease --no-verify`
  } finally {
    // Cleanup worktree and temp branch regardless of success or failure
    await $({ reject: false })`git worktree remove --force ${tmpDir}`
    await $({ reject: false })`git branch -D ${tmpBranch}`
  }
}

main().catch((err) => {
  console.error(err?.message ?? String(err))
  process.exit(1)
})
