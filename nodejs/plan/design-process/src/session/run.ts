import type { Readable, Writable } from 'node:stream'

export interface SessionOptions {
  root: string
  product: string
  input?: Readable
  output?: Writable
}

/**
 * Drive the full-screen session over the draft the working tree holds: the alternate screen, raw
 * keypresses folded through `reduce`, frames from `renderSession`, the staged set written in one
 * commit, and the landing sequence run from the same session. Returns the process exit code.
 */
export const runIncrementSession = (_options: SessionOptions): Promise<number> => {
  throw new Error('not implemented')
}
