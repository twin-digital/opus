import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createCore, ModelError, validateModel } from '@thrashplay/wishem-core'
import type { Core, Problem } from '@thrashplay/wishem-core'
import { describeCounts, formatProblem } from './format.js'
import { readModelFolder, withSource } from './read-model-folder.js'
import type { ModelFolderResult } from './read-model-folder.js'

export interface HostOptions {
  folder: string
  /** Default 4747. Use 0 to let the system select a port. */
  port?: number
  /** Default: write to the terminal. */
  log?: (line: string) => void
  /** Called when the watch of the model folder fails. */
  onWatchError?: (error: Error) => void
}

export interface Host {
  /** For example `http://127.0.0.1:4747`. */
  url: string
  core: Core
  close(): Promise<void>
}

export const DEFAULT_PORT = 4747
const HOST_ADDRESS = '127.0.0.1'
const SETTLE_MS = 50

/** Checks the folder data. Returns the problems with `source`, and the warnings. */
const check = (result: ModelFolderResult): { problems: Problem[]; warnings: Problem[] } => {
  if (result.data === undefined) {
    return { problems: result.problems, warnings: [] }
  }
  const validation = validateModel(result.data)
  return validation.ok ?
      { problems: [], warnings: withSource(validation.warnings, result) }
    : { problems: withSource(validation.problems, result), warnings: [] }
}

const sendJson = (response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

/** Rejects with a `ModelError` when the model is not correct at the start. */
export const startHost = async (options: HostOptions): Promise<Host> => {
  const { folder, port = DEFAULT_PORT } = options
  const log =
    options.log ??
    ((line: string) => {
      console.log(line)
    })

  const initial = await readModelFolder(folder)
  const first = check(initial)
  if (first.problems.length > 0 || initial.data === undefined) {
    throw new ModelError(first.problems)
  }
  first.warnings.forEach((warning) => {
    log(formatProblem(warning))
  })
  const core = createCore(initial.data)

  const streams = new Set<ServerResponse>()

  const sendSnapshot = (response: ServerResponse) => {
    response.write(`event: snapshot\ndata: ${JSON.stringify(core.getSnapshot())}\n\n`)
  }

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const pathname = (request.url ?? '/').split('?')[0] ?? '/'
    if (pathname !== '/snapshot' && pathname !== '/snapshots') {
      sendJson(response, 404, { error: `No such path: ${pathname}` })
    } else if (request.method !== 'GET') {
      sendJson(response, 405, { error: `Method not allowed: ${request.method ?? ''}` }, { Allow: 'GET' })
    } else if (pathname === '/snapshot') {
      sendJson(response, 200, core.getSnapshot())
    } else {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      streams.add(response)
      sendSnapshot(response)
      response.on('close', () => streams.delete(response))
    }
  }

  const unsubscribe = core.subscribe(() => {
    streams.forEach(sendSnapshot)
  })

  const server = createServer(handle)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, HOST_ADDRESS, () => {
      server.off('error', reject)
      resolve()
    })
  }).catch((error: unknown) => {
    unsubscribe()
    throw error
  })

  const closeServer = () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
      server.closeAllConnections()
    })

  let timer: NodeJS.Timeout | undefined
  let reading: Promise<void> = Promise.resolve()
  let correct = true

  /** Reads the folder again. `quiet` skips the warnings when the model did not change. */
  const reload = async (quiet = false) => {
    const result = await readModelFolder(folder)
    const { problems, warnings } = check(result)
    if (problems.length > 0 || result.data === undefined) {
      problems.forEach((problem) => {
        log(formatProblem(problem))
      })
      log('wishem: the last correct snapshot stays')
      correct = false
      return
    }
    const before = core.getSnapshot()
    try {
      core.setModel(result.data)
    } catch (error) {
      const failures = error instanceof AggregateError ? (error.errors as unknown[]) : [error]
      failures.forEach((failure) => {
        log(`wishem: a listener failed: ${failure instanceof Error ? failure.message : String(failure)}`)
      })
    }
    if (!quiet || core.getSnapshot() !== before) {
      warnings.forEach((warning) => {
        log(formatProblem(warning))
      })
    }
    if (!correct) {
      log(`wishem: the model is correct: ${describeCounts(core.getSnapshot())}`)
    }
    correct = true
  }

  const scheduleReload = (quiet = false) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      reading = reading
        .then(() => reload(quiet))
        .catch((error: unknown) => {
          log(`wishem: cannot read the model: ${String(error)}`)
        })
    }, SETTLE_MS)
  }

  let watcher: FSWatcher
  try {
    watcher = watch(folder, { recursive: true }, () => {
      scheduleReload()
    })
  } catch (error) {
    unsubscribe()
    await closeServer()
    throw error
  }
  watcher.on('error', (error) => {
    log(`wishem: the watch failed: ${error.message}`)
    options.onWatchError?.(error)
  })
  // Picks up a change made between the first read and the start of the watch.
  scheduleReload(true)

  return {
    url: `http://${HOST_ADDRESS}:${(server.address() as AddressInfo).port}`,
    core,
    close: async () => {
      clearTimeout(timer)
      watcher.close()
      unsubscribe()
      await reading
      streams.forEach((stream) => stream.end())
      streams.clear()
      await closeServer()
    },
  }
}
