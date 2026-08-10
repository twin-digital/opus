import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { DirTree } from '../tree.js'

import { collectSessionEntries } from './entries.js'
import { applyStaged, commitBody, emptyStaging, stageRuling } from './staging.js'

import type { CommandRunner } from '../land.js'
import type { OpenEntry } from './entries.js'
import type { Staged } from './staging.js'

/** Where a submit writes: the tree, the draft in it, and the branch it pushes. */
export interface SubmitTarget {
  root: string
  product: string
  increment: string
  branch: string
}

export interface SubmitOutcome {
  /** What the sitting is told the submit did. */
  message: string
  /** Entry ids the commit carried; the sitting clears these from its stage. */
  written: string[]
  /** Entry ids the branch's tip already ruled otherwise; their rulings left the stage. */
  conflicted: string[]
}

const NOTHING: SubmitOutcome = {
  message: 'the sitting ruled nothing; no commit was written',
  written: [],
  conflicted: [],
}

/**
 * The staged rulings written to the draft's own sources, committed with a body tallying what the
 * sitting ruled, and pushed. A sitting that changed nothing writes no commit — though a commit an
 * earlier submit left unpushed is pushed now, so a refused push is retried by submitting again and
 * no work is lost (r-xrhll9x6). A push the remote refuses is not the end of it: the branch's tip is
 * fetched, the sitting's rulings are reapplied to it by entry id, and the push is tried again; an
 * entry whose status differs at the tip is left as the tip has it and reported. A second refusal is
 * reported and the sitting continues (d-x1jlr7jc).
 */
export const writeAndPush = (
  target: SubmitTarget,
  entries: OpenEntry[],
  staged: Staged,
  run: CommandRunner,
): SubmitOutcome => {
  const first = commit(target, entries, staged, run)
  if (first === undefined) {
    if (!pendingCommit(target, run)) {
      return NOTHING
    }
    const refused = push(target, run)
    return refused === undefined ?
        { message: 'the pending commit was pushed; this sitting ruled nothing new', written: [], conflicted: [] }
      : { message: `the pending commit is still unpushed: ${refused}`, written: [], conflicted: [] }
  }
  if (push(target, run) === undefined) {
    return { message: `${first.body}; committed and pushed`, written: first.written, conflicted: [] }
  }
  return reapply(target, entries, staged, run)
}

/** Whether the local branch carries a commit the remote does not — a refused push's leftover. */
const pendingCommit = (target: SubmitTarget, run: CommandRunner): boolean => {
  try {
    const ahead = run('git', ['-C', target.root, 'rev-list', '--count', `origin/${target.branch}..HEAD`])
    return Number(ahead.trim()) > 0
  } catch {
    return false
  }
}

interface Written {
  body: string
  written: string[]
}

const commit = (
  target: SubmitTarget,
  entries: OpenEntry[],
  staged: Staged,
  run: CommandRunner,
): Written | undefined => {
  const tree = new DirTree(target.root)
  const edits = applyStaged((path) => tree.read(path), entries, staged)
  const body = commitBody(staged)
  if (edits.length === 0 || body === undefined) {
    return undefined
  }
  for (const edit of edits) {
    const path = join(target.root, edit.path)
    if (edit.content === '') {
      rmSync(path, { force: true })
      continue
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, edit.content)
  }
  run('git', ['-C', target.root, 'add', '-A'])
  run('git', ['-C', target.root, 'commit', '-m', `plan(${target.product}): the owner's rulings`, '-m', body])
  return { body, written: [...staged.rulings.keys()] }
}

/** Push the branch, returning what the remote said where it refused. */
const push = (target: SubmitTarget, run: CommandRunner): string | undefined => {
  try {
    run('git', ['-C', target.root, 'push', 'origin', `HEAD:refs/heads/${target.branch}`])
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : 'the push was refused'
  }
}

const reapply = (target: SubmitTarget, entries: OpenEntry[], staged: Staged, run: CommandRunner): SubmitOutcome => {
  run('git', ['-C', target.root, 'fetch', 'origin', target.branch])
  // the session unwinds the commit it just wrote; one the remote has accepted is an ancestor of the tip
  run('git', ['-C', target.root, 'reset', '--hard', 'FETCH_HEAD'])

  const at = collectSessionEntries(new DirTree(target.root), target.product, target.increment).decisions
  const tip = new Map(at.map((entry) => [entry.id, entry]))
  const opened = new Map(entries.map((entry) => [entry.id, entry]))
  const conflicted: string[] = []
  let kept = emptyStaging()
  for (const ruling of staged.rulings.values()) {
    const there = tip.get(ruling.id)
    if (there === undefined || there.status !== opened.get(ruling.id)?.status) {
      conflicted.push(ruling.id)
      continue
    }
    kept = stageRuling(kept, ruling)
  }

  const said = conflicted.length === 0 ? '' : `; ${conflicted.join(', ')} left as the branch has them`
  const second = commit(target, at, kept, run)
  if (second === undefined) {
    return { message: `the branch moved under this sitting${said}`, written: [], conflicted }
  }
  const refused = push(target, run)
  return {
    message:
      refused === undefined ?
        `${second.body}; committed and pushed${said}`
      : `${second.body}; committed, and the push was refused again${said}`,
    written: second.written,
    conflicted,
  }
}
