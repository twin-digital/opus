import { confirmOnStdin } from '../cli/confirm.js'
import { stopServer } from '../server/console.js'
import { readRunningServer } from '../server/state.js'
import { randomSeed } from '../seed.js'
import { composeFor, levelOrDefault, projectSpec, resolveRun, STOP_TIMEOUT_MS, withDaemon } from '../start/run.js'

import type { CommandContext } from '../start/run.js'

/**
 * Removes the volume and every world on it — the only command that loses an author's work. It
 * names what it is about to remove and asks before doing it, and where nothing can be asked it
 * does nothing.
 */
export const destroy = async (context: CommandContext): Promise<void> => {
  const { stream } = context
  const run = await resolveRun(context)
  const compose = await composeFor(context, projectSpec(run, levelOrDefault(run.settings), randomSeed()))

  const running = await withDaemon(async () => readRunningServer(compose))
  if (running === undefined) {
    stream.write(
      'deploy',
      `no server is running for '${run.workspace.project}', so the worlds on its volume cannot be listed`,
    )
  } else if (running.worlds.length === 0) {
    stream.write('deploy', 'the volume holds no worlds')
  } else {
    stream.write('deploy', `destroying removes ${String(running.worlds.length)} world(s) and everything in them:`)
    for (const world of running.worlds) {
      stream.write('deploy', `  ${world}${world === running.level ? ' (serving now)' : ''}`)
    }
  }

  if (!context.interactive) {
    stream.write('deploy', 'nothing can be asked here, so nothing was removed')
    return
  }

  const ask = context.deps?.confirm ?? ((question: string) => confirmOnStdin(question, stream))
  if (!(await ask(`remove the '${run.workspace.project}' volume and every world on it?`))) {
    stream.write('deploy', 'nothing was removed')
    return
  }

  if (running !== undefined) {
    await stopServer(compose, STOP_TIMEOUT_MS)
  }
  await compose.down({ volumes: true })
  stream.write('deploy', 'the volume and every world on it are gone')
}
