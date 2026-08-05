import type { Readable, Writable } from 'node:stream'

export interface SecretOptions {
  prompt: string
  /** Defaults to the terminal; the typed characters are never echoed to it. */
  input?: Readable
  output?: Writable
}

/** A stream that can leave line discipline — the terminal, when it is one. */
interface RawCapable {
  isTTY?: boolean
  setRawMode?: (raw: boolean) => void
}

/**
 * Read a secret from the terminal with echo off and hand it back to the caller. It is held in the
 * returned string and nowhere else: nothing here writes a file, sets an environment variable, or
 * builds a command line, and nothing is cached between calls (r-rxb7pn9z, d-6fur4w53).
 */
export const readSecret = ({ prompt, input, output }: SecretOptions): Promise<string> => {
  const source = input ?? process.stdin
  const sink = output ?? process.stderr
  const terminal = source as unknown as RawCapable

  return new Promise((resolve, reject) => {
    sink.write(prompt)
    const raw = terminal.isTTY === true && typeof terminal.setRawMode === 'function'
    if (raw) {
      terminal.setRawMode?.(true)
    }
    source.setEncoding('utf8')
    let typed = ''

    const done = (settle: () => void) => {
      source.off('data', onData)
      source.off('error', onError)
      if (raw) {
        terminal.setRawMode?.(false)
      }
      source.pause()
      sink.write('\n')
      settle()
    }

    const onError = (error: Error) => {
      done(() => {
        reject(error)
      })
    }

    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\n' || character === '\r') {
          const secret = typed
          typed = ''
          done(() => {
            resolve(secret)
          })
          return
        }
        if (character === '\u0003') {
          typed = ''
          done(() => {
            reject(new Error('cancelled'))
          })
          return
        }
        // backspace and delete, since raw mode leaves the line to us
        typed = character === '\u007f' || character === '\b' ? typed.slice(0, -1) : typed + character
      }
    }

    source.on('data', onData)
    source.on('error', onError)
    source.resume()
  })
}
