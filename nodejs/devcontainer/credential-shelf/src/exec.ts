import { execFile, spawn } from 'node:child_process'
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
