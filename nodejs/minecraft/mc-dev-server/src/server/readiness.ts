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

/** Waits for the next world-load pack stack line the container emits. */
export const waitForWorldLoad = (_compose: ComposeClient, _timeoutMs: number): Promise<PackStackLine> => {
  throw new Error('not implemented: waitForWorldLoad')
}
