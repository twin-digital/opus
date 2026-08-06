import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { execa } from 'execa'

import type { OutputStream } from '../stream.js'
import type { ResultPromise } from 'execa'

/** The package manager a workspace's scripts are run through. */
export type PackageManager = 'pnpm' | 'npm'

/** pnpm where the root declares a pnpm workspace, npm otherwise — the kit's own rule. */
export const packageManagerFor = (workspaceRoot: string): PackageManager =>
  existsSync(join(workspaceRoot, 'pnpm-workspace.yaml')) || existsSync(join(workspaceRoot, 'pnpm-workspace.yml')) ?
    'pnpm'
  : 'npm'

/** The argv that runs one of a package's own scripts, from the package's own directory. */
export const runScriptArgv = (manager: PackageManager, script: string): [string, string[]] => [manager, ['run', script]]

/** Whether a package declares a script the harness would run. */
export const declaresScript = (packageJson: { scripts?: Record<string, string> }, script: string): boolean =>
  typeof packageJson.scripts?.[script] === 'string'

/** What a one-shot build did. A failure is reported and carried, never thrown. */
export interface BuildOutcome {
  packageName: string
  ran: boolean
  ok: boolean
  message?: string
}

/** Every line a script writes reaches the one stream, tagged with the package that emitted it. */
const pipe = (subprocess: ResultPromise, packageName: string, stream: OutputStream): void => {
  subprocess.all?.on('data', (chunk: Buffer | string) => {
    stream.write(packageName, chunk.toString())
  })
}

/**
 * Runs a selected package's own `build` script once. A failure is reported and carried: the
 * outcome says what went wrong and the caller goes on.
 */
export const runBuild = async (
  packageDir: string,
  packageName: string,
  manager: PackageManager,
  stream: OutputStream,
): Promise<BuildOutcome> => {
  const [file, args] = runScriptArgv(manager, 'build')
  try {
    const subprocess = execa(file, args, { cwd: packageDir, reject: false, all: true })
    pipe(subprocess, packageName, stream)
    const result = await subprocess
    if (result.exitCode === 0) {
      return { packageName, ran: true, ok: true }
    }
    return { packageName, ran: true, ok: false, message: `the build exited ${String(result.exitCode)}` }
  } catch (error) {
    return { packageName, ran: true, ok: false, message: (error as Error).message }
  }
}

/** A package's watch process, running until the loop detaches. */
export interface WatchProcess {
  packageName: string
  stop(): void
}

/**
 * Starts a selected package's own `watch` script. A watch that exits is reported on the stream and
 * not restarted.
 */
export const startWatch = (
  packageDir: string,
  packageName: string,
  manager: PackageManager,
  stream: OutputStream,
): WatchProcess => {
  const [file, args] = runScriptArgv(manager, 'watch')
  // its own process group, so detaching takes the whole watch down: a package manager's `run` is a
  // parent of the process actually doing the watching, and signalling only the parent orphans it
  const subprocess = execa(file, args, { cwd: packageDir, reject: false, all: true, detached: true })
  pipe(subprocess, packageName, stream)

  let stopped = false
  void subprocess.then(
    (result) => {
      if (!stopped) {
        stream.write('deploy', `${packageName}: the watch exited ${String(result.exitCode)}; it is not restarted`)
      }
    },
    (error: unknown) => {
      if (!stopped) {
        stream.write('deploy', `${packageName}: the watch exited (${(error as Error).message}); it is not restarted`)
      }
    },
  )

  return {
    packageName,
    stop: () => {
      stopped = true
      const { pid } = subprocess
      if (pid !== undefined) {
        try {
          process.kill(-pid, 'SIGTERM')
        } catch {
          subprocess.kill('SIGTERM')
        }
      }
      // an orphan holding the pipes open would keep this process alive after it had detached
      subprocess.all.destroy()
      subprocess.unref()
    },
  }
}
