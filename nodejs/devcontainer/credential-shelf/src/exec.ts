import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Run a command with inherited stdio (for interactive flows like `aws sso login`). */
export const runInteractive = (file: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${file} exited with code ${(code ?? 'null').toString()}`))
      }
    })
  })

/** Run a command and return its stdout. Rejects (with `.stderr` on the error) on non-zero exit. */
export const run = async (file: string, args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

/** Best-effort stderr text from a rejected `run`, for log messages. */
export const stderrOf = (err: unknown): string => {
  if (typeof err === 'object' && err !== null && 'stderr' in err) {
    const { stderr } = err as { stderr?: unknown }
    if (typeof stderr === 'string') {
      return stderr.replace(/\s+/g, ' ').trim().slice(0, 300)
    }
  }
  return err instanceof Error ? err.message : String(err)
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** A spawned child whose output is watched while it keeps running. */
export interface CapturingChild {
  /** The live child process. */
  child: ChildProcess
  /**
   * Resolve once `re` first matches the accumulated stdout+stderr. Rejects if the process
   * exits (or errors, or `timeoutMs` elapses) before a match — the flow can't proceed.
   */
  waitForMatch: (re: RegExp, timeoutMs?: number) => Promise<RegExpMatchArray>
  /** Resolve with the exit code once the process ends; reject if it fails to spawn. */
  done: Promise<number>
}

/**
 * Spawn a command and watch its combined stdout+stderr while it keeps running — the
 * parse-a-line-then-let-it-finish primitive `run` (buffers to completion) and
 * `runInteractive` (inherits stdio, nothing to read) can't provide. Used to pull the
 * device-code `verification_uri` + `user_code` out of a still-polling `aws sso login`.
 */
export const spawnCapturing = (file: string, args: string[]): CapturingChild => {
  const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  let ended = false

  interface Waiter {
    re: RegExp
    resolve: (m: RegExpMatchArray) => void
    reject: (err: Error) => void
    timer?: NodeJS.Timeout
  }
  const waiters = new Set<Waiter>()

  const settle = (w: Waiter, m: RegExpMatchArray): void => {
    if (w.timer !== undefined) {
      clearTimeout(w.timer)
    }
    waiters.delete(w)
    w.resolve(m)
  }

  const onData = (chunk: Buffer): void => {
    output += chunk.toString()
    for (const w of [...waiters]) {
      const m = output.match(w.re)
      if (m !== null) {
        settle(w, m)
      }
    }
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)

  const failWaiters = (err: Error): void => {
    for (const w of [...waiters]) {
      if (w.timer !== undefined) {
        clearTimeout(w.timer)
      }
      waiters.delete(w)
      w.reject(err)
    }
  }

  const done = new Promise<number>((resolve, reject) => {
    child.on('error', (err) => {
      ended = true
      failWaiters(err)
      reject(err)
    })
    child.on('exit', (code) => {
      ended = true
      failWaiters(new Error(`${file} exited with code ${(code ?? 'null').toString()} before output matched`))
      resolve(code ?? 1)
    })
  })

  const waitForMatch = (re: RegExp, timeoutMs?: number): Promise<RegExpMatchArray> =>
    new Promise((resolve, reject) => {
      const existing = output.match(re)
      if (existing !== null) {
        resolve(existing)
        return
      }
      if (ended) {
        reject(new Error(`${file} produced no match for ${re.toString()}`))
        return
      }
      const w: Waiter = { re, resolve, reject }
      if (timeoutMs !== undefined) {
        w.timer = setTimeout(() => {
          waiters.delete(w)
          reject(new Error(`timed out waiting for ${file} output to match ${re.toString()}`))
        }, timeoutMs)
      }
      waiters.add(w)
    })

  return { child, waitForMatch, done }
}
