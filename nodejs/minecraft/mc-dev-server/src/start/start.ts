import type { CommandLineSettings } from '../settings/resolve.js'
import type { OutputStream } from '../stream.js'

/** What every command takes from the command line and its environment. */
export interface CommandContext {
  cwd: string
  configPath?: string
  stream: OutputStream
  cli: CommandLineSettings
  /** whether the run can ask the author a question */
  interactive: boolean
}

/**
 * Brings the server up and watches, or attaches to one already running.
 *
 * A run fails before bringing anything up when a selected pack is one the kit reports invalid,
 * when there is no Docker or no reachable daemon, when a `--config` file will not parse, when the
 * EULA has not been accepted, or when the selection names something the workspace does not hold.
 * Everything short of that is reported on the stream and carried: a build that failed leaves its
 * pack deployed with a stub, a package declaring no `watch` script is built once and not watched,
 * and a watch process that exits is reported and not restarted.
 *
 * Resolves when the foreground loop is closed by a signal, having left the server running.
 */
export const start = (_context: CommandContext): Promise<void> => {
  throw new Error('not implemented: start')
}
