/**
 * The harness's one output stream. Every part of the harness writes through it and nothing else
 * writes to the console, so build output, deploy activity, and the container's own log interleave
 * in one place. Every line carries a short source tag; nothing goes to stderr.
 */

/** `deploy` is the harness's own activity, `server` the container log, anything else a package. */
export type SourceTag = 'deploy' | 'server' | (string & {})

export interface OutputStream {
  /** writes `text` as one or more tagged lines */
  write(tag: SourceTag, text: string): void
}

/** Splits `text` into lines, dropping a single trailing newline's empty tail. */
export const toLines = (text: string): string[] => {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

/** Prefixes one line with its source tag. */
export const tagLine = (tag: SourceTag, line: string): string => `[${tag}] ${line}`

/** An output stream over a sink. The command line owns the one that writes to stdout. */
export const createOutputStream = (sink: (line: string) => void): OutputStream => ({
  write: (tag, text) => {
    for (const line of toLines(text)) {
      sink(tagLine(tag, line))
    }
  },
})

/** The process-wide stream: stdout, and nothing on stderr. */
export const stdoutStream = createOutputStream((line) => {
  process.stdout.write(`${line}\n`)
})
