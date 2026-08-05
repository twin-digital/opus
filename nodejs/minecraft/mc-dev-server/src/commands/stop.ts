import { stopServer } from '../server/console.js'
import { randomSeed } from '../seed.js'
import { composeFor, levelOrDefault, projectSpec, resolveRun, STOP_TIMEOUT_MS, withDaemon } from '../start/run.js'

import type { CommandContext } from '../start/run.js'

/**
 * Takes the container down and leaves the volume standing, so every world on it survives to the
 * next start. The server goes down through its own console `stop`, waited for, so the world is
 * written first. Finding nothing running is not a failure.
 */
export const stop = async (context: CommandContext): Promise<void> => {
  const { stream } = context
  const run = await resolveRun(context)
  const compose = await composeFor(context, projectSpec(run, levelOrDefault(run.settings), randomSeed()))

  const running = await withDaemon(async () => compose.running())
  if (running === undefined) {
    stream.write('deploy', `no server is running for '${run.workspace.project}'`)
  } else {
    stream.write('deploy', 'stopping the server through its console, so the world is written first')
    await stopServer(compose, STOP_TIMEOUT_MS)
  }

  await compose.down()
  stream.write('deploy', 'the container is down; the volume and every world on it are kept')
}
