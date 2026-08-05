import type { Spawn } from '../config/types.js'
import type { ComposeClient } from '../docker/compose.js'

/** The image's non-interactive console helper. */
export const CONSOLE_HELPER = 'send-command'

/** The argv that writes one command to the running server's console. */
export const consoleArgv = (command: readonly string[]): string[] => [CONSOLE_HELPER, ...command]

/** Issues a console command. Nothing is assumed about what the server says back. */
export const sendCommand = async (compose: ComposeClient, command: readonly string[]): Promise<string> => {
  const result = await compose.exec(consoleArgv(command))
  return result.stdout
}

/**
 * Reloads the world's function and script files. A reload takes up an edited file's new content
 * and a removed file's absence; a pack's own script output is never read as the acknowledgement.
 */
export const reload = async (compose: ComposeClient): Promise<void> => {
  await sendCommand(compose, ['reload'])
}

/** Sets the world spawn. The command acknowledges nothing, so nothing is waited on. */
export const setWorldSpawn = async (compose: ComposeClient, spawn: Spawn): Promise<void> => {
  await sendCommand(compose, ['setworldspawn', String(spawn[0]), String(spawn[1]), String(spawn[2])])
}

/** The server did not go down within the time a stop was given. */
export class StopTimeoutError extends Error {
  constructor(seconds: number) {
    super(`the server was still running ${seconds}s after the console stop`)
    this.name = 'StopTimeoutError'
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Takes the server down through its own console `stop`, waited for, so the world is written before
 * the process goes down. Never a container kill. Waiting is polling the container's own state: the
 * console acknowledges nothing, and the container exiting is what says the world was written.
 */
export const stopServer = async (compose: ComposeClient, timeoutMs: number, pollMs = 500): Promise<void> => {
  await sendCommand(compose, ['stop'])

  const deadline = Date.now() + timeoutMs
  for (;;) {
    if ((await compose.running()) === undefined) {
      return
    }
    if (Date.now() >= deadline) {
      throw new StopTimeoutError(Math.round(timeoutMs / 1000))
    }
    await delay(pollMs)
  }
}
