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

/**
 * Takes the server down through its own console `stop`, waited for, so the world is written before
 * the process goes down. Never a container kill.
 */
export const stopServer = (_compose: ComposeClient, _timeoutMs: number): Promise<void> => {
  throw new Error('not implemented: stopServer')
}
