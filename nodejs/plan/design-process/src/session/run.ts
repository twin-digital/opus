import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { emitKeypressEvents } from 'node:readline'

import { collectIds, generateIds } from '../ids.js'
import { landIncrement } from '../land.js'
import { DirTree } from '../tree.js'

import { collectOpenEntries } from './entries.js'
import { openSession, reduce } from './model.js'
import { renderSession } from './render.js'
import { readSecret } from './secret.js'
import { applyStaged, stageRuling, stagingProblems } from './staging.js'
import { resolveSessionTarget } from './target.js'

import type { OpenEntry } from './entries.js'
import type { Key, SessionState } from './model.js'
import type { Staged } from './staging.js'
import type { Readable, Writable } from 'node:stream'

export interface SessionOptions {
  root: string
  /** Absent where the draft the pull request carries names its own product (d-pm6a29v6). */
  product?: string
  /** The pull request to work; absent means the branch the working directory is on (d-7i1l1kfy). */
  pr?: string
  input?: Readable
  output?: Writable
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

/**
 * Drive the full-screen session over the draft the working tree holds: the alternate screen, raw
 * keypresses folded through `reduce`, frames from `renderSession`, the staged set written in one
 * commit, and the landing sequence run from the same session. Returns the process exit code.
 */
export const runIncrementSession = async (options: SessionOptions): Promise<number> => {
  const input = (options.input ?? process.stdin) as Readable & Terminal
  const output = (options.output ?? process.stdout) as Writable & Terminal
  const target =
    options.pr === undefined && options.product !== undefined ?
      { root: options.root, product: options.product, release: () => undefined }
    : await resolveSessionTarget({ root: options.root, pr: options.pr, product: options.product })
  if ('refused' in target) {
    output.write(`design-process: ${target.refused.reason}\n`)
    return 1
  }
  const entries = collectOpenEntries(new DirTree(target.root), target.product)

  if (entries.length === 0) {
    output.write(`design-process: ${target.product} carries nothing open; land it with \`design-process land\`\n`)
    target.release()
    return 0
  }

  const session = { state: openSession(entries) }
  const draw = (): void => {
    const frame = renderSession(session.state, { rows: output.rows ?? 24, columns: output.columns ?? 80 })
    output.write(CLEAR + frame.join('\n'))
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
  const code = await submit({ root: target.root, product: target.product }, state, output, raw ? input : undefined)
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

const STEP_MARK = { ok: '✔', skipped: '·', failed: '✖' }

/** The tree and draft a resolved session works, once the pull request has named them. */
interface Working {
  root: string
  product: string
}

/** Write the staged set, and land from the same session when that is what was asked for. */
const submit = async (
  options: Working,
  state: SessionState,
  output: Writable,
  terminal: Readable | undefined,
): Promise<number> => {
  const staged = withGeneratedIds(new DirTree(options.root), state.staged)
  const problems = stagingProblems(staged, state.entries)
  if (problems.length > 0) {
    for (const problem of problems) {
      output.write(`design-process: ${problem}\n`)
    }
    return 1
  }

  if (state.submit === 'write') {
    const written = writeAndCommit(options, state.entries, staged)
    output.write(`design-process: ${written} source(s) written and committed\n`)
    return 0
  }

  // the landing applies the staged set itself, as its first step
  const result = await landIncrement({
    root: options.root,
    product: options.product,
    staged: { entries: state.entries, staged },
    approvingToken: () =>
      readSecret({ prompt: "the owner's approving token (empty to publish without it): ", input: terminal }).then(
        (token) => token || undefined,
      ),
  })
  for (const step of result.steps) {
    output.write(`${STEP_MARK[step.status]} ${step.step}${step.detail === undefined ? '' : `: ${step.detail}`}\n`)
  }
  for (const blocker of result.blockers ?? []) {
    output.write(`design-process: ${blocker}\n`)
  }
  if (!result.landed) {
    return 1
  }
  output.write(
    result.awaitingApproval === true ?
      `design-process: landed as ${result.number}; the pull request awaits the owner's approval\n`
    : `design-process: landed as ${result.number}\n`,
  )
  return 0
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

/** The staged set applied to the draft's own sources and committed on its branch in one write. */
const writeAndCommit = (options: Working, entries: OpenEntry[], staged: Staged): number => {
  const tree = new DirTree(options.root)
  const edits = applyStaged((path) => tree.read(path), entries, staged)
  for (const edit of edits) {
    const target = join(options.root, edit.path)
    if (edit.content === '') {
      rmSync(target, { force: true })
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, edit.content)
  }
  if (edits.length > 0) {
    const git = (...args: string[]) => {
      execFileSync('git', ['-C', options.root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    }
    git('add', '-A')
    git('commit', '-m', `plan(${options.product}): the owner's rulings`)
  }
  return edits.length
}
