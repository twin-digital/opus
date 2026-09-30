import * as path from 'node:path'
import { ReaperSim } from '@thrashplay/reaper-sim'
import { watcherDirectory, watcherScript } from '../src/paths.js'
import { SECTION, STATUS_KEY, type WatcherResponse, type WatcherStatus } from '../src/protocol.js'

const fixtureCommands = path.join(import.meta.dirname, 'commands')

/**
 * A simulated REAPER running the watcher with the fixture commands, on a clock the test moves.
 */
export const startWatcher = async () => {
  let now = 1000
  const sim = new ReaperSim({ clock: () => now })
  await sim.mountDirectory(fixtureCommands, path.join(watcherDirectory, 'commands'))
  const script = await sim.loadScriptFile(watcherScript)

  const status = () => {
    const raw = sim.model.globalExtState.get(SECTION, STATUS_KEY)
    return raw === undefined ? undefined : (JSON.parse(raw) as WatcherStatus)
  }

  return {
    sim,
    script,
    status,
    generation: () => status()?.generation ?? '',
    advance: (seconds: number) => {
      now += seconds
    },
    /**
     * Posts a request through the web remote, as a client does.
     */
    post: async (id: string, request: unknown) => {
      const body = typeof request === 'string' ? request : JSON.stringify(request)
      await sim.fetch(`/_/SET/PROJEXTSTATE/thrashplay/REQ_${id}/${encodeURIComponent(body)}`)
    },
    /**
     * Keys of the requests waiting in the current project.
     */
    requests: () =>
      sim.model.currentProject.extState
        .entries(SECTION)
        .map(([key]) => key)
        .filter((key) => key.startsWith('REQ_')),
    response: (id: string) => {
      const raw = sim.model.globalExtState.get(SECTION, `RES_${id}`)
      return raw === undefined ? undefined : (JSON.parse(raw) as WatcherResponse)
    },
  }
}
