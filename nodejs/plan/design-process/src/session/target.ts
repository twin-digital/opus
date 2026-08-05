import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandRunner, PullRequest } from '../land.js'

/**
 * What the session runs against once the pull request is resolved: the tree it reads and writes,
 * the draft it opens on, and where that draft lives (d-7i1l1kfy, d-pm6a29v6).
 */
export interface SessionTarget {
  /** The tree the session works in — the current one, or a temporary worktree made from the head. */
  root: string
  /** The product the chosen draft belongs to, read from `products/<product>/` above its directory. */
  product: string
  /** The draft increment directory the session opens on. */
  increment: string
  branch: string
  pullRequest: PullRequest
  /** Removes the worktree the session materialised; a no-op where it worked in place. */
  release: () => void
}

/** A draft the pull request's diff carries, for the select-draft screen (d-pm6a29v6). */
export interface DraftChoice {
  product: string
  increment: string
}

/** The session refuses to open, saying which (d-7i1l1kfy). */
export type TargetRefusal =
  | { reason: 'default-branch'; branch: string }
  | { reason: 'no-draft' }
  | { reason: 'no-pull-request'; pr: string }
  | { reason: 'uncommitted-changes' }
  | { reason: 'unpushable-fork'; branch: string }
  | { reason: 'no-increment-on-pull-request'; pullRequest: PullRequest }

/** What a refusal says at the terminal. */
export const refusalMessage = (refusal: TargetRefusal): string => {
  switch (refusal.reason) {
    case 'default-branch':
      return `${refusal.branch} is the repository's default branch, which carries no draft`
    case 'no-draft':
      return 'this tree holds no draft increment; there is nothing to rule'
    case 'no-pull-request':
      return `${refusal.pr} names no pull request this clone can read`
    case 'uncommitted-changes':
      return 'this tree has uncommitted changes; commit them before ruling over them'
    case 'unpushable-fork':
      return `${refusal.branch} lives on a fork this clone cannot push to`
    case 'no-increment-on-pull-request':
      return `#${refusal.pullRequest.number} touches no increment directory`
  }
}

export interface TargetOptions {
  /** The directory the command ran in; the local clone is found from it. */
  root: string
  /** `--pr <url>`; absent means the branch the working directory is on. */
  pr?: string
  /** `[product]`; narrows the drafts the pull request's diff carries. */
  product?: string
  /** Asked only where the diff carries several drafts after the product narrows them. */
  choose?: (choices: DraftChoice[], on: { branch: string; pullRequest: number }) => Promise<DraftChoice>
  /** Injected by the tests; defaults to spawning the real command. */
  run?: CommandRunner
}

const spawn: CommandRunner = (command, args, options) => {
  try {
    return execFileSync(command, args, { cwd: options?.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const said = error as { stderr?: string; stdout?: string; message?: string }
    throw new Error((said.stderr ?? said.stdout ?? said.message ?? '').trim() || `${command} failed`, { cause: error })
  }
}

const PULL_URL = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/

/** The increment directory a changed path lives in, and the product above it (d-pm6a29v6). */
const INCREMENT_PATH = /^products\/([^/]+)\/increments\/([^/]+)\//

/** What `gh pr view` tells the session about the pull request it works. */
interface PullRequestView {
  url: string
  number: number
  headRefName: string
  isCrossRepository?: boolean
  files?: { path: string }[]
}

const VIEW_FIELDS = 'url,number,headRefName,isCrossRepository,files'

const viewPullRequest = (run: CommandRunner, root: string, target?: string): PullRequestView | undefined => {
  let raw: string
  try {
    raw = run('gh', ['pr', 'view', ...(target === undefined ? [] : [target]), '--json', VIEW_FIELDS], { cwd: root })
  } catch {
    return undefined
  }
  try {
    const view = JSON.parse(raw) as PullRequestView
    return typeof view.number === 'number' ? view : undefined
  } catch {
    return undefined
  }
}

const pullRequestAt = (url: string, number: number): PullRequest | undefined => {
  const match = PULL_URL.exec(url)
  return match === null ? undefined : { owner: match[1], repo: match[2], number }
}

const currentBranch = (run: CommandRunner, root: string): string =>
  run('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']).trim()

const defaultBranch = (run: CommandRunner, root: string): string | undefined => {
  try {
    return run('git', ['-C', root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim().split('/').at(-1)
  } catch {
    return undefined
  }
}

const isDirty = (run: CommandRunner, root: string): boolean =>
  run('git', ['-C', root, 'status', '--porcelain']).trim().length > 0

/** The drafts the pull request's diff carries, deduplicated, in the order the diff names them. */
const draftsOnPullRequest = (view: PullRequestView): DraftChoice[] => {
  const found = new Map<string, DraftChoice>()
  for (const file of view.files ?? []) {
    const match = INCREMENT_PATH.exec(file.path)
    if (match !== null) {
      found.set(`${match[1]}/${match[2]}`, { product: match[1], increment: match[2] })
    }
  }
  return [...found.values()]
}

/** Open the pull request a branch carrying a draft has not got yet; posting it is what the owner came to do. */
const openPullRequest = (run: CommandRunner, root: string, branch: string, draft: DraftChoice): void => {
  run('git', ['-C', root, 'push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`])
  run(
    'gh',
    [
      'pr',
      'create',
      '--head',
      branch,
      '--title',
      `plan(${draft.product}): ${draft.increment}`,
      '--body',
      `Ratifies ${draft.increment} of ${draft.product}.\n`,
    ],
    { cwd: root },
  )
}

/** The drafts the working tree holds, for a branch whose pull request does not exist yet. */
const draftsInTree = (run: CommandRunner, root: string): DraftChoice[] => {
  const found = new Map<string, DraftChoice>()
  for (const path of run('git', ['-C', root, 'ls-files', 'products']).split('\n')) {
    const match = INCREMENT_PATH.exec(path)
    if (match?.[2].startsWith('wip-') === true) {
      found.set(`${match[1]}/${match[2]}`, { product: match[1], increment: match[2] })
    }
  }
  return [...found.values()]
}

/** Fetch the head branch and give the session a tree on it — this one where it is already there. */
const treeOn = (
  run: CommandRunner,
  root: string,
  branch: string,
): { root: string; release: () => void } | { refused: TargetRefusal } => {
  if (currentBranch(run, root) === branch) {
    return isDirty(run, root) ? { refused: { reason: 'uncommitted-changes' } } : { root, release: () => undefined }
  }

  run('git', ['-C', root, 'fetch', 'origin', branch])
  const dir = mkdtempSync(join(tmpdir(), 'design-process-session-'))
  const worktree = join(dir, 'tree')
  run('git', ['-C', root, 'worktree', 'add', '--detach', worktree, 'FETCH_HEAD'])
  return {
    root: worktree,
    release: () => {
      try {
        run('git', ['-C', root, 'worktree', 'remove', '--force', worktree])
      } catch {
        // a worktree the owner moved or removed is already gone; nothing to clean
      }
    },
  }
}

/**
 * Resolve the pull request the session works, and the draft on it. Given a url, the head branch is
 * fetched and worked in place where the tree is already on it, and in a temporary worktree
 * otherwise. Given none, the working directory's branch supplies the pull request, and one is
 * opened where the branch has none.
 */
export const resolveSessionTarget = async (
  options: TargetOptions,
): Promise<SessionTarget | { refused: TargetRefusal }> => {
  const run = options.run ?? spawn
  const { root } = options

  let view = options.pr === undefined ? undefined : viewPullRequest(run, root, options.pr)
  if (options.pr === undefined) {
    const branch = currentBranch(run, root)
    if (branch === (defaultBranch(run, root) ?? 'main')) {
      return { refused: { reason: 'default-branch', branch } }
    }
    if (isDirty(run, root)) {
      return { refused: { reason: 'uncommitted-changes' } }
    }
    view = viewPullRequest(run, root, branch)
    if (view === undefined) {
      // a branch carrying a draft and no pull request is a draft nobody has posted yet
      const drafts = draftsInTree(run, root)
      if (drafts.length === 0) {
        return { refused: { reason: 'no-draft' } }
      }
      openPullRequest(run, root, branch, narrow(drafts, options.product)[0] ?? drafts[0])
      view = viewPullRequest(run, root, branch)
    }
  }
  if (view === undefined) {
    return {
      refused: options.pr === undefined ? { reason: 'no-draft' } : { reason: 'no-pull-request', pr: options.pr },
    }
  }
  const pullRequest = pullRequestAt(view.url, view.number)
  if (pullRequest === undefined) {
    return { refused: { reason: 'no-pull-request', pr: view.url } }
  }
  if (view.isCrossRepository === true) {
    return { refused: { reason: 'unpushable-fork', branch: view.headRefName } }
  }

  const choices = narrow(draftsOnPullRequest(view), options.product)
  if (choices.length === 0) {
    return { refused: { reason: 'no-increment-on-pull-request', pullRequest } }
  }
  const tree = treeOn(run, root, view.headRefName)
  if ('refused' in tree) {
    return tree
  }
  const chosen =
    choices.length === 1 ?
      choices[0]
    : await pick(choices, { branch: view.headRefName, pullRequest: view.number }, options.choose)
  return {
    root: tree.root,
    product: chosen.product,
    increment: chosen.increment,
    branch: view.headRefName,
    pullRequest,
    release: tree.release,
  }
}

/** A product named on the command line narrows the list; where that leaves nothing, it does not. */
const narrow = (choices: DraftChoice[], product?: string): DraftChoice[] => {
  const narrowed = product === undefined ? choices : choices.filter((choice) => choice.product === product)
  return narrowed.length === 0 ? choices : narrowed
}

const pick = async (
  choices: DraftChoice[],
  on: { branch: string; pullRequest: number },
  choose?: TargetOptions['choose'],
): Promise<DraftChoice> => (choose === undefined ? choices[0] : choose(choices, on))
