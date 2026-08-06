import type { ComposeClient } from '../docker/compose.js'

/**
 * The world-load line reporting the pack stack. It is emitted once per world load and names what
 * the load actually brought up — `None` included, which is exactly what an unlisted or misrouted
 * pack produces.
 */
const PACK_STACK = /^.*\bPack Stack - (.+?)\s*$/

/** The pack stack a world load reported. */
export interface PackStackLine {
  /** the whole line, as the harness reports it on the stream */
  line: string
  /** what followed `Pack Stack - ` */
  stack: string
  /** whether the load brought nothing up */
  none: boolean
}

/** Matches one log line against the world-load pack stack line. */
export const matchPackStack = (line: string): PackStackLine | undefined => {
  const match = PACK_STACK.exec(line)
  if (match === null) {
    return undefined
  }
  const stack = match[1]
  return { line: line.trim(), stack, none: stack === 'None' }
}

/** The last pack stack line a log holds, or `undefined` when no world has loaded in it. */
export const lastPackStack = (log: string): PackStackLine | undefined => {
  let last: PackStackLine | undefined
  for (const line of log.split('\n')) {
    const match = matchPackStack(line)
    if (match !== undefined) {
      last = match
    }
  }
  return last
}

/** The server did not report a world load in time. */
export class ReadinessTimeoutError extends Error {
  constructor(seconds: number) {
    super(`the server did not report a world load within ${seconds}s`)
    this.name = 'ReadinessTimeoutError'
  }
}

/** Every world-load line a log holds, in order. */
export const allPackStacks = (log: string): PackStackLine[] => {
  const found: PackStackLine[] = []
  for (const line of log.split('\n')) {
    const match = matchPackStack(line)
    if (match !== undefined) {
      found.push(match)
    }
  }
  return found
}

/**
 * What the container log already said before the operation that causes a world load.
 *
 * Readiness is a poll of the log rather than a follow of it, because a follow cannot be attached
 * before the container exists — which is exactly the case a `start` is in — and attaching after the
 * operation would miss a load that had already happened. The mark is what tells the load this run
 * caused from one already in the log, and it needs no clock: a longer log with more world loads in
 * it, or a shorter one, both mean the container has loaded a world since.
 */
export interface LogMark {
  loads: number
  length: number
}

/** Takes the mark. Called before whatever is going to cause the load. */
export const markLog = async (compose: ComposeClient): Promise<LogMark> => {
  try {
    const log = await compose.logs()
    return { loads: allPackStacks(log).length, length: log.length }
  } catch {
    // no container yet, which is a log with nothing in it
    return { loads: 0, length: 0 }
  }
}

/** The world load a mark says is new, or `undefined` while the log still shows only old ones. */
export const loadSince = (mark: LogMark, log: string): PackStackLine | undefined => {
  const stacks = allPackStacks(log)
  const restarted = log.length < mark.length
  return (
      restarted ? stacks.length > 0 : stacks.length > mark.loads
    ) ?
      stacks.at(-1)
    : undefined
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** Waits for the world load the operation since `mark` caused. */
export const waitForWorldLoad = async (
  compose: ComposeClient,
  mark: LogMark,
  timeoutMs: number,
  pollMs = 2_000,
): Promise<PackStackLine> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let load: PackStackLine | undefined
    try {
      load = loadSince(mark, await compose.logs())
    } catch {
      load = undefined
    }
    if (load !== undefined) {
      return load
    }
    if (Date.now() >= deadline) {
      throw new ReadinessTimeoutError(Math.round(timeoutMs / 1000))
    }
    await delay(pollMs)
  }
}
