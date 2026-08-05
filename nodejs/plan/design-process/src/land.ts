import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findLandingConflicts } from './conflicts.js'
import { loadProducts } from './load.js'
import { collectOpenEntries } from './session/entries.js'
import { applyStaged, stagingProblems } from './session/staging.js'
import { DirTree, resolveGitRef } from './tree.js'
import { formatIncrement, resolveFold } from './version.js'

import type { OpenEntry } from './session/entries.js'
import type { Staged } from './session/staging.js'
import type { FileTree } from './tree.js'

/**
 * The landing sequence, in the order it runs (d-h418ljtp). The pull request opens after the push,
 * since the remote must carry the branch first, and the approval follows the open — a push after
 * an approval dismisses it, and an increment is published by merging (d-6x6l6ws7).
 */
export const LAND_STEPS = [
  'apply',
  'conflicts',
  'rename',
  'check',
  'commit',
  'push',
  'open',
  'approve',
  'auto-merge',
] as const

export type LandStep = (typeof LAND_STEPS)[number]

export interface StepResult {
  step: LandStep
  status: 'ok' | 'failed' | 'skipped'
  /** What ran, or what to fix when it failed. */
  detail?: string
}

/** Runs one command and returns its stdout; throws with the output when it exits non-zero. */
export type CommandRunner = (command: string, args: string[], options?: { cwd?: string }) => string

export interface PullRequest {
  owner: string
  repo: string
  number: number
}

export interface LandOptions {
  root: string
  product: string
  /** Rulings the session took and has not written; the non-interactive command carries none. */
  staged?: { entries: OpenEntry[]; staged: Staged }
  /**
   * Asked for the owner's approving token when the sequence reaches the approval, and never
   * before. Returning undefined publishes everything up to the approval and reports the pull
   * request as awaiting it (d-6fur4w53).
   */
  approvingToken?: () => Promise<string | undefined>
  /** Injected by the tests; defaults to spawning the real command. */
  run?: CommandRunner
  /** Injected by the tests; defaults to the GitHub API call carrying the token in a header. */
  approve?: (token: string, pullRequest: PullRequest) => Promise<void>
}

export interface LandResult {
  steps: StepResult[]
  landed: boolean
  /** The number the landing claimed, zero-padded. */
  number?: string
  /** Set when the sequence published but the approval was not given. */
  awaitingApproval?: boolean
  /** Set when the approval was given but auto-merge could not be enabled (d-8vsionnz). */
  awaitingMerge?: boolean
  /** What refused the landing before any step ran. */
  blockers?: string[]
}

/**
 * What refuses a landing before any step runs: a decision still proposed, or a question still
 * open, in any increment the landing would publish. `settling` excuses an entry a staged ruling
 * is about to close, since the landing applies that set as its first step.
 */
export const landingBlockers = (
  tree: FileTree,
  productId: string,
  settling: (id: string) => boolean = () => false,
): string[] =>
  collectOpenEntries(tree, productId)
    .filter((entry) => !settling(entry.id))
    .map((entry) =>
      entry.kind === 'decision' ?
        `${entry.id} is still proposed in ${entry.increment}`
      : `${entry.id} is still open in ${entry.increment}`,
    )

/** Spawn a command, returning its stdout and throwing with its output when it exits non-zero. */
const spawn: CommandRunner = (command, args, options) => {
  try {
    return execFileSync(command, args, { cwd: options?.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const output = error as { stderr?: string; stdout?: string; message?: string }
    const said = output.stderr ?? output.stdout ?? output.message ?? ''
    throw new Error(said.trim() || `${command} failed`, { cause: error })
  }
}

/** This package's own CLI, run as the merge gate runs it. */
const SELF = fileURLToPath(new URL('../bin/design-process.js', import.meta.url))

const failureOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Run the landing sequence in order, stopping at the first step that fails and reporting what to
 * fix. Nothing in it needs judgement, so the interactive session and `design-process land` run the
 * same function.
 */
export const landIncrement = async (options: LandOptions): Promise<LandResult> => {
  const { root, product } = options
  const run = options.run ?? spawn
  // what the staged set is about to settle is not open; the apply step writes it first
  const staged = options.staged?.staged.rulings
  const blockers = landingBlockers(new DirTree(root), product, (id) => staged?.has(id) === true)
  if (blockers.length > 0) {
    return { steps: [], landed: false, blockers }
  }

  const steps: StepResult[] = []
  const step = (name: LandStep, work: () => string | undefined): boolean => {
    try {
      steps.push({ step: name, status: 'ok', detail: work() })
      return true
    } catch (error) {
      steps.push({ step: name, status: 'failed', detail: failureOf(error) })
      return false
    }
  }

  if (!step('apply', () => writeStaged(root, options.staged, run))) {
    return { steps, landed: false }
  }

  // the head the landing measures itself against: what origin/main published, else this tree's own
  const head = resolveGitRef(root, ['origin/main', 'main'])
  const headFold = head === undefined ? undefined : resolveFold(root, product, { kind: 'ref', ref: head })
  if (
    !step('conflicts', () => {
      if (headFold === undefined) {
        return 'no head ref resolvable; nothing to conflict with'
      }
      const findings = findLandingConflicts(new DirTree(root), headFold, product)
      if (findings.length > 0) {
        throw new Error(findings.map((finding) => `${finding.path ?? ''} ${finding.message}`.trim()).join('; '))
      }
      return `no conflicts against ${head}`
    })
  ) {
    return { steps, landed: false }
  }

  const number = formatIncrement((headFold?.at ?? resolveFold(root, product).at) + 1)

  if (
    !step('rename', () => {
      const dirs = draftDirs(new DirTree(root), product)
      if (dirs.length === 0) {
        return 'no draft directory to rename'
      }
      if (dirs.length > 1) {
        throw new Error(`the tree holds ${dirs.length} drafts (${dirs.join(', ')}); land one at a time`)
      }
      const from = dirs[0]
      const to = `${from.slice(0, from.lastIndexOf('/'))}/${number}`
      run('git', ['-C', root, 'mv', from, to])
      return `${from} → ${to}`
    })
  ) {
    return { steps, landed: false }
  }

  if (
    !step('check', () => {
      run(process.execPath, [SELF, 'check', '--root', root])
      return 'design check passed'
    })
  ) {
    return { steps, landed: false }
  }

  if (
    !step('commit', () => {
      run('git', ['-C', root, 'add', '-A'])
      run('git', ['-C', root, 'commit', '-m', `plan(${product}): land at ${number}`])
      return `committed as ${number}`
    })
  ) {
    return { steps, landed: false }
  }

  if (
    !step('push', () => {
      run('git', ['-C', root, 'push', '--set-upstream', 'origin', 'HEAD'])
      return 'pushed'
    })
  ) {
    return { steps, landed: false }
  }

  let pullRequest: PullRequest | undefined
  if (
    !step('open', () => {
      const existing = discoverPullRequest(run, root)
      if (existing !== undefined) {
        pullRequest = existing
        return `#${existing.number} is already open`
      }
      pullRequest = openPullRequest(run, root, product, number)
      return `opened #${pullRequest.number}`
    })
  ) {
    return { steps, landed: false }
  }

  const approved = await approveStep(steps, options, pullRequest)
  const merging = autoMerge(steps, run, root, pullRequest, approved)
  return {
    steps,
    landed: true,
    number,
    awaitingApproval: approved ? undefined : true,
    awaitingMerge: approved && !merging ? true : undefined,
  }
}

/** The staged rulings the session took, written to the draft's own sources in one pass (d-ovlyaoht). */
const writeStaged = (root: string, staged: LandOptions['staged'], run: CommandRunner): string => {
  if (staged === undefined || staged.staged.rulings.size === 0) {
    return 'no staged rulings'
  }
  const problems = stagingProblems(staged.staged, staged.entries)
  if (problems.length > 0) {
    throw new Error(problems.join('; '))
  }
  const edits = applyStaged((path) => new DirTree(root).read(path), staged.entries, staged.staged)
  for (const edit of edits) {
    const target = join(root, edit.path)
    if (edit.content === '') {
      rmSync(target, { force: true })
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, edit.content)
  }
  // the index follows the working tree, so the rename that comes next sees no deleted source
  run('git', ['-C', root, 'add', '-A'])
  return `${edits.length} source(s) written`
}

/** The wip directories the product's working tree holds (d-x0q4xgd8). */
const draftDirs = (tree: FileTree, product: string): string[] =>
  (loadProducts(tree).products.get(product)?.drafts ?? []).map((draft) => draft.dir)

const PULL_URL = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/

const pullRequestAt = (url: unknown): PullRequest | undefined => {
  const match = PULL_URL.exec(String(url))
  return match === null ? undefined : { owner: match[1], repo: match[2], number: Number(match[3]) }
}

/** The pull request the current branch already has, if any; the open step makes one where not. */
const discoverPullRequest = (run: CommandRunner, root: string): PullRequest | undefined => {
  let raw: string
  try {
    raw = run('gh', ['pr', 'view', '--json', 'url'], { cwd: root })
  } catch {
    return undefined
  }
  try {
    return pullRequestAt((JSON.parse(raw) as { url?: unknown }).url)
  } catch {
    return undefined
  }
}

/**
 * Open the pull request the landing merges through: `main` admits a change only through one, and
 * an increment is published by merging (d-6x6l6ws7, d-h418ljtp). The title and body carry the
 * increment and the product and nothing else — the squash of this pull request is the record.
 */
const openPullRequest = (run: CommandRunner, root: string, product: string, number: string): PullRequest => {
  const output = run(
    'gh',
    [
      'pr',
      'create',
      '--title',
      `plan(${product}): land increment ${number} [${number}]`,
      '--body',
      `Publishes increment ${number} of ${product}.\n`,
    ],
    { cwd: root },
  )
  const opened = pullRequestAt(output.trim().split(/\s+/).at(-1))
  if (opened === undefined) {
    throw new Error(`gh pr create named no pull request: ${JSON.stringify(output.trim())}`)
  }
  return opened
}

/** Approve as the owner, with the token the owner types and nothing else (d-uap9qjz9). */
const githubApprove = async (token: string, pullRequest: PullRequest): Promise<void> => {
  const response = await fetch(
    `https://api.github.com/repos/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.number}/reviews`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ event: 'APPROVE' }),
    },
  )
  if (!response.ok) {
    throw new Error(`the approval was refused: ${response.status} ${await response.text()}`)
  }
}

const approveStep = async (
  steps: StepResult[],
  options: LandOptions,
  pullRequest: PullRequest | undefined,
): Promise<boolean> => {
  if (pullRequest === undefined) {
    steps.push({ step: 'approve', status: 'skipped', detail: 'the open step named no pull request' })
    return false
  }
  const token = await options.approvingToken?.()
  if (token === undefined || token === '') {
    steps.push({ step: 'approve', status: 'skipped', detail: 'no approving token was given' })
    return false
  }
  try {
    await (options.approve ?? githubApprove)(token, pullRequest)
  } catch (error) {
    steps.push({ step: 'approve', status: 'skipped', detail: failureOf(error) })
    return false
  }
  steps.push({ step: 'approve', status: 'ok', detail: `approved #${pullRequest.number}` })
  return true
}

/**
 * The merge methods `gh pr merge` can set, in the order the landing prefers them. A repository
 * enables its own, and enabling more than one is rare; where it has, the first here wins.
 */
const MERGE_METHODS = [
  { flag: '--merge', enabled: 'allow_merge_commit' },
  { flag: '--squash', enabled: 'allow_squash_merge' },
  { flag: '--rebase', enabled: 'allow_rebase_merge' },
] as const

/** The method the repository permits, asked of the repository rather than assumed. */
const mergeMethod = (run: CommandRunner, root: string, pullRequest: PullRequest): string | undefined => {
  let raw: string
  try {
    raw = run('gh', ['api', `repos/${pullRequest.owner}/${pullRequest.repo}`], { cwd: root })
  } catch {
    return undefined
  }
  let repository: Record<string, unknown>
  try {
    repository = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return undefined
  }
  return MERGE_METHODS.find((method) => repository[method.enabled] === true)?.flag
}

/** Set the merge to complete on its own once the gate is green, with the environment's own credentials. */
const autoMerge = (
  steps: StepResult[],
  run: CommandRunner,
  root: string,
  pullRequest: PullRequest | undefined,
  approved: boolean,
): boolean => {
  if (pullRequest === undefined || !approved) {
    steps.push({
      step: 'auto-merge',
      status: 'skipped',
      detail: pullRequest === undefined ? 'the open step named no pull request' : 'the approval was not given',
    })
    return false
  }
  const method = mergeMethod(run, root, pullRequest)
  if (method === undefined) {
    steps.push({
      step: 'auto-merge',
      status: 'skipped',
      detail: 'the repository names no merge method this landing can set; merge it once the gate is green',
    })
    return false
  }
  try {
    run('gh', ['pr', 'merge', String(pullRequest.number), method, '--auto'], { cwd: root })
  } catch (error) {
    // a repository that refuses auto-merge leaves an approved pull request to merge by hand
    steps.push({
      step: 'auto-merge',
      status: 'skipped',
      detail: `${failureOf(error)}; merge it once the gate is green`,
    })
    return false
  }
  steps.push({
    step: 'auto-merge',
    status: 'ok',
    detail: `#${pullRequest.number} merges ${method.slice(2)} when the gate is green`,
  })
  return true
}
