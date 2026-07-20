import { open, stat } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

import { execa } from 'execa'

import { CONSOLE_LOG, CONSOLE_POLL_MS, CONSOLE_SCRIPT, CONSOLE_TIMEOUT_MS } from '../config/index.js'

/**
 * The single owner of the Bedrock server's screen console.
 *
 * Bedrock has no request/response channel: a command is typed into its screen
 * session and the reply appears on the server's stdout, which screen tees into
 * one shared log file. Historically several actors (the Flask web UI, the
 * snapshot timer, the nightly backup) drove that console independently, each
 * recording a log offset and grepping for its own marker — so their output
 * interleaved and their offset math raced. This broker makes the console a
 * single-owner resource: every command runs through one in-process mutex, so
 * only one command's reply is ever in flight and interleaving is impossible.
 *
 * Higher-level operations that must hold the console across several commands
 * (the save-hold snapshot protocol) run inside {@link runExclusive} and use the
 * unlocked {@link sendRaw} / {@link waitFor} primitives, so the whole sequence
 * is one critical section.
 */
export class ConsoleBroker {
  /** Serializes every console operation. Chained so failures don't wedge the queue. */
  private queue: Promise<unknown> = Promise.resolve()

  /** Run `fn` with exclusive ownership of the console. */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    // Keep the chain alive regardless of this op's outcome.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * Send a command to the console without waiting for a reply. Unlocked: only
   * call from inside {@link runExclusive}. The helper drives `screen -X stuff`
   * (and asserts the log flush) and returns immediately; the reply, if any,
   * lands in the log.
   */
  async sendRaw(args: string[]): Promise<void> {
    await execa(CONSOLE_SCRIPT, args, { timeout: CONSOLE_TIMEOUT_MS })
  }

  /**
   * Tail the console log from `offset` and resolve with the first match of
   * `reply`, or null on timeout. Unlocked: only call from inside
   * {@link runExclusive}, after {@link currentLogSize} + {@link sendRaw}.
   */
  async waitFor(reply: RegExp, offset: number, timeoutMs: number): Promise<RegExpMatchArray | null> {
    const deadline = Date.now() + timeoutMs
    do {
      await sleep(CONSOLE_POLL_MS)
      const text = await readTail(CONSOLE_LOG, offset)
      // screen writes the PTY stream verbatim, so lines arrive CRLF-terminated;
      // normalize so patterns can anchor on \n.
      const match = text.replace(/\r\n/g, '\n').match(reply)
      if (match) {
        return match
      }
    } while (Date.now() < deadline)
    return null
  }

  /** The console log's current size — the offset to read replies from. */
  async currentLogSize(): Promise<number> {
    return (await stat(CONSOLE_LOG)).size
  }

  /**
   * Send a command and return the first reply matching `reply`, or null on
   * timeout. This is the locked, one-shot path used for `list`, `querytarget`,
   * `time query`, `tp`, `give`, etc.
   */
  async command(args: string[], reply: RegExp, timeoutMs = CONSOLE_TIMEOUT_MS): Promise<RegExpMatchArray | null> {
    return this.runExclusive(async () => {
      const offset = await this.currentLogSize()
      await this.sendRaw(args)
      return this.waitFor(reply, offset, timeoutMs)
    })
  }

  /**
   * Best-effort `save resume`, taken as a critical section. Run at startup to
   * clear a hold that a previous (crashed or killed) snapshot could have left
   * dangling — resuming when nothing is held is harmless.
   */
  async reapDanglingHold(): Promise<void> {
    await this.runExclusive(() => this.sendRaw(['save', 'resume']))
  }
}

/** Read bytes [offset, EOF) of `path` as UTF-8. Empty string if nothing new. */
const readTail = async (path: string, offset: number): Promise<string> => {
  const fh = await open(path, 'r')
  try {
    const { size } = await fh.stat()
    if (size <= offset) {
      return ''
    }
    const length = size - offset
    const buffer = Buffer.allocUnsafe(length)
    await fh.read(buffer, 0, length, offset)
    return buffer.toString('utf8')
  } finally {
    await fh.close()
  }
}
