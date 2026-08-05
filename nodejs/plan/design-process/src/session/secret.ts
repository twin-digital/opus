import type { Readable, Writable } from 'node:stream'

export interface SecretOptions {
  prompt: string
  /** Defaults to the terminal; the typed characters are never echoed to it. */
  input?: Readable
  output?: Writable
}

/**
 * Read a secret from the terminal with echo off and hand it back to the caller. It is held in the
 * returned string and nowhere else: nothing here writes a file, sets an environment variable, or
 * builds a command line, and nothing is cached between calls (r-rxb7pn9z, d-6fur4w53).
 */
export const readSecret = (_options: SecretOptions): Promise<string> => {
  throw new Error('not implemented')
}
