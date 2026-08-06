import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { emitKeypressEvents } from 'node:readline'

import { collectIds, generateIds } from '../ids.js'
import { landIncrement } from '../land.js'
import { DirTree } from '../tree.js'

import { resolveCitations } from './citations.js'
import { collectRatifyEntries } from './entries.js'
import { readHeader } from './header.js'
import { openSession, reduce } from './model.js'
import { renderSecret, renderSelectDraft, renderSession } from './render.js'
import { draftReview, postReview, readDiff, diffRanges } from './review.js'
import { readSecret } from './secret.js'
import { applyStaged, commitBody, stageRuling, stagingProblems } from './staging.js'
import { refusalMessage, resolveSessionTarget } from './target.js'

import type { CommandRunner } from '../land.js'
import type { OpenEntry } from './entries.js'
import type { Key, SessionState } from './model.js'
import type { Note, ReviewPoster } from './review.js'
import type { Staged } from './staging.js'
import type { DraftChoice, SessionTarget } from './target.js'
import type { Readable, Writable } from 'node:stream'

export interface SessionOptions {
  root: string
  /** Absent where the draft the pull request carries names its own product (d-pm6a29v6). */
  product?: string
  /** The pull request to work; absent means the branch the working directory is on (d-7i1l1kfy). */
  pr?: string
  input?: Readable
  output?: Writable
  /** Injected by the tests; defaults to spawning the real command. */
  run?: CommandRunner
  /** Injected by the tests; defaults to the GitHub API call carrying the owner's token. */
  review?: ReviewPoster
}

/** A stream that can leave line discipline, and report its size. */
interface Terminal {
  isTTY?: boolean
  setRawMode?: (raw: boolean) => void
  rows?: number
  columns?: number
}

const ALTERNATE_SCREEN_ON = '\u001b[?1049h\u001b[?25l'
const ALTERNATE_SCREEN_OFF = '\u001b[?25h\u001b[?1049l'
const CLEAR = '\u001b[H\u001b[2J'

const spawn: CommandRunner = (command, args, options) => {
  try {
    return execFileSync(command, args, { cwd: options?.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const said = error as { stderr?: string; stdout?: string; message?: string }
    throw new Error((said.stderr ?? said.stdout ?? said.message ?? '').trim() || `${command} failed`, { cause: error })
  }
}

/**
 * Drive the full-screen session over the draft the pull request carries: the alternate screen, raw
 * keypresses folded through `reduce`, frames from `renderSession`, the staged set written in one
 * commit and pushed, the notes posted as one review, and the landing sequence run from the same
 * session. Returns the process exit code.
 */
export const runIncrementSession = async (options: SessionOptions): Promise<number> => {
  const input = (options.input ?? process.stdin) as Readable & Terminal
  const output = (options.output ?? process.stdout) as Writable & Terminal
  const run = options.run ?? spawn
  const viewport = () => ({ rows: output.rows ?? 24, columns: output.columns ?? 80 })

  const target = await resolveSessionTarget({
    root: options.root,
    pr: options.pr,
    product: options.product,
    run,
    choose: (choices, on) => chooseDraft(choices, on, input, output, viewport()),
  })
  if ('refused' in target) {
    process.stderr.write(`design-process: ${refusalMessage(target.refused)}\n`)
    return 1
  }

  const tree = new DirTree(target.root)
  const entries = collectRatifyEntries(tree, target.product, target.increment)
  if (entries.length === 0) {
    process.stderr.write(`design-process: ${target.increment} carries no decision and no question\n`)
    target.release()
    return 0
  }

  const header = readHeader({
    root: target.root,
    product: target.product,
    increment: target.increment,
    branch: target.branch,
    pullRequest: target.pullRequest,
    run,
  })
  const resolve = resolveCitations(tree, target.product)
  const session = { state: openSession(entries, header) }
  const draw = (): void => {
    output.write(CLEAR + renderSession(session.state, viewport(), resolve).join('\n'))
  }

  emitKeypressEvents(input)
  const raw = input.isTTY === true && typeof input.setRawMode === 'function'
  if (raw) {
    input.setRawMode?.(true)
  }
  output.write(ALTERNATE_SCREEN_ON)
  draw()

  try {
    await drive(input, session, draw)
  } finally {
    if (raw) {
      input.setRawMode?.(false)
    }
    output.write(ALTERNATE_SCREEN_OFF)
  }

  const { state } = session
  if (state.quit === true || state.submit === undefined) {
    output.write('design-process: session abandoned; the tree is untouched\n')
    target.release()
    return 0
  }
  const code = await submit(
    { target, run, review: options.review ?? postReview },
    state,
    output,
    raw ? input : undefined,
  )
  target.release()
  return code
}

/** Fold keypresses until the session asks to leave, to write, or to land. */
const drive = (input: Readable, session: { state: SessionState }, draw: () => void): Promise<void> =>
  new Promise((resolve, reject) => {
    const stop = () => {
      input.off('keypress', onKey)
      input.off('error', onError)
      input.pause()
    }
    const onKey = (sequence: string | undefined, key: Key | undefined) => {
      session.state = reduce(session.state, key ?? { name: sequence ?? '', sequence })
      if (session.state.quit === true || session.state.submit !== undefined) {
        stop()
        resolve()
        return
      }
      draw()
    }
    const onError = (error: Error) => {
      stop()
      reject(error)
    }
    input.on('keypress', onKey)
    input.on('error', onError)
    input.resume()
  })

/** The select-draft screen, shown only where the diff carries more than one draft (d-pm6a29v6). */
const chooseDraft = (
  choices: DraftChoice[],
  on: { branch: string; pullRequest: number },
  input: Readable & Terminal,
  output: Writable,
  viewport: { rows: number; columns: number },
): Promise<DraftChoice> =>
  new Promise((resolve) => {
    let selected = 0
    const draw = () => {
      output.write(CLEAR + renderSelectDraft(choices, selected, on, viewport).join('\n'))
    }
    emitKeypressEvents(input)
    const raw = input.isTTY === true && typeof input.setRawMode === 'function'
    if (raw) {
      input.setRawMode?.(true)
    }
    const onKey = (_sequence: string | undefined, key: Key | undefined) => {
      const name = key?.name ?? ''
      if (name === 'down' || name === 'j') {
        selected = Math.min(selected + 1, choices.length - 1)
      } else if (name === 'up' || name === 'k') {
        selected = Math.max(selected - 1, 0)
      } else if (name === 'enter' || name === 'return') {
        input.off('keypress', onKey)
        if (raw) {
          input.setRawMode?.(false)
        }
        input.pause()
        resolve(choices[selected])
        return
      }
      draw()
    }
    input.on('keypress', onKey)
    input.resume()
    draw()
  })

const STEP_MARK = { ok: '✔', skipped: '·', failed: '✖' }

interface Working {
  target: SessionTarget
  run: CommandRunner
  review: ReviewPoster
}

/**
 * The owner's credential, asked for at the terminal the first time a session posts something and
 * held in memory for the rest of that session — not in a file, not in the environment, not in an
 * argument (d-2b23mjrl).
 */
const heldToken = (input: Readable | undefined, output: Writable & Terminal) => {
  let token: string | undefined
  return async (): Promise<string | undefined> => {
    if (token !== undefined) {
      return token
    }
    output.write(
      `${renderSecret('github token', { rows: output.rows ?? 24, columns: output.columns ?? 80 }).join('\n')}\n`,
    )
    const typed = await readSecret({ prompt: '', input })
    token = typed || undefined
    return token
  }
}

/** Write the staged set, post what the sitting noted, and land from the same session when asked. */
const submit = async (
  working: Working,
  state: SessionState,
  output: Writable & Terminal,
  terminal: Readable | undefined,
): Promise<number> => {
  const { target, run } = working
  const staged = withGeneratedIds(new DirTree(target.root), state.staged)
  const problems = stagingProblems(staged, state.entries)
  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`design-process: ${problem}\n`)
    }
    return 1
  }
  const token = heldToken(terminal, output)

  if (state.submit === 'write') {
    const written = writeAndCommit(target, state.entries, staged, run)
    output.write(`design-process: ${written}\n`)
    await postNotes(working, state, staged, output, token)
    return 0
  }

  // the landing applies the staged set itself, as its first step
  const result = await landIncrement({
    root: target.root,
    product: target.product,
    staged: { entries: state.entries, staged },
    approvingToken: token,
  })
  for (const step of result.steps) {
    output.write(`${STEP_MARK[step.status]} ${step.step}${step.detail === undefined ? '' : `: ${step.detail}`}\n`)
  }
  for (const blocker of result.blockers ?? []) {
    process.stderr.write(`design-process: ${blocker}\n`)
  }
  if (!result.landed) {
    return 1
  }
  await postNotes(working, state, staged, output, token)
  output.write(
    result.awaitingApproval === true ?
      `design-process: landed as ${result.number}; the pull request awaits the owner's approval\n`
    : `design-process: landed as ${result.number}\n`,
  )
  return 0
}

/**
 * One `COMMENT` review carrying every note the sitting left, posted after the commit and the push
 * so it anchors to the state it describes. A submit carrying no note posts nothing; a session that
 * cannot obtain a token keeps the notes it could not post (d-f1b5r2f8, d-2b23mjrl).
 */
const postNotes = async (
  working: Working,
  state: SessionState,
  staged: Staged,
  output: Writable,
  token: () => Promise<string | undefined>,
): Promise<void> => {
  const notes: Note[] = state.entries
    .filter((entry) => staged.notes.has(entry.id))
    .map((entry) => ({ entry, note: staged.notes.get(entry.id) ?? '' }))
  const review = draftReview(
    notes,
    (path) => new DirTree(working.target.root).read(path),
    diffRanges(readDiff(working.run, working.target.root, working.target.pullRequest)),
  )
  if (review === undefined) {
    return
  }
  const given = await token()
  if (given === undefined) {
    process.stderr.write(
      `design-process: ${notes.length} note(s) were not posted; supply a token later in this session or they are lost\n`,
    )
    return
  }
  try {
    await working.review(given, working.target.pullRequest, review)
    output.write(`design-process: ${notes.length} note(s) posted as one review\n`)
  } catch (error) {
    process.stderr.write(`design-process: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

/** Mint the ids a routed answer's entry carries; `reduce` is pure and cannot (d-octrdz0j). */
const withGeneratedIds = (tree: DirTree, staged: Staged): Staged => {
  const taken = collectIds(tree)
  let next = staged
  for (const ruling of staged.rulings.values()) {
    if (ruling.kind !== 'question' || ruling.entryId !== undefined || ruling.route === 'fact') {
      continue
    }
    const [id] = generateIds(ruling.route === 'requirement' ? 'r' : 'd', 1, taken)
    taken.add(id)
    next = stageRuling(next, { ...ruling, entryId: id })
  }
  return next
}

/**
 * The staged rulings written to the draft's own sources, committed with a body tallying what the
 * sitting ruled, and pushed. A sitting that changed nothing writes no commit; a push the remote
 * refuses is reported and the commit left standing (d-lqmwczg3).
 */
const writeAndCommit = (target: SessionTarget, entries: OpenEntry[], staged: Staged, run: CommandRunner): string => {
  const tree = new DirTree(target.root)
  const edits = applyStaged((path) => tree.read(path), entries, staged)
  const body = commitBody(staged)
  if (edits.length === 0 || body === undefined) {
    return 'the sitting ruled nothing; no commit was written'
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
  try {
    run('git', ['-C', target.root, 'push', 'origin', `HEAD:refs/heads/${target.branch}`])
  } catch (error) {
    // the session does not rebase: rewriting the owner's branch under them is worse than a
    // sitting they are told to resolve
    process.stderr.write(`design-process: the push was refused: ${error instanceof Error ? error.message : ''}\n`)
    return `${body}; committed, not pushed`
  }
  return `${body}; committed and pushed`
}
