import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { isEqual, storeInputs, validateModel } from '@thrashplay/wishem-core'
import type { Entity, Model, Problem } from '@thrashplay/wishem-core'
import type { Hub, Port } from '@thrashplay/wishem-hub'
import { describeCounts, formatProblem } from './format.js'
import { readModelFolder, withSource } from './read-model-folder.js'

export const FILES_ID = 'files'
export const FILES_WRITER_ID = 'files-writer'

const STORE_ID = 'store'
const STATE_FILE = 'state.json'
const SETTLE_MS = 50

export interface ModelFolderStorageOptions {
  folder: string
  hub: Hub
  /** The model of the first read. It is the first value of the last sync. */
  first: Model
  log: (line: string) => void
  onWatchError?: (error: Error) => void
}

export interface ModelFolderStorage {
  /** Starts the watch and the quiet read. */
  watch(): void
  /**
   * Closes the watch, and waits for the running read and write. Gives the same promise on each call.
   * Prints a line when the model folder does not hold the last changes of the store.
   */
  close(): Promise<void>
}

const sameDefinitions = (a: Model, b: Model) => isEqual({ ...a, entities: [] }, { ...b, entities: [] })
const sameDefinitionList = (a: Model['definitions'], b: Model['definitions']) =>
  isEqual({ definitions: [...a], entities: [] }, { definitions: [...b], entities: [] })
const sameEntities = (a: readonly Entity[], b: readonly Entity[]) =>
  isEqual({ definitions: [], entities: [...a] }, { definitions: [], entities: [...b] })

/** Attaches `files` and `files-writer` to the hub. */
export const attachModelFolderStorage = (options: ModelFolderStorageOptions): ModelFolderStorage => {
  const { folder, hub, log } = options
  const inputs = storeInputs(STORE_ID)
  const stateFile = path.join(folder, STATE_FILE)

  const files: Port = hub.attach({ id: FILES_ID, kind: 'input' })
  let writer: Port
  try {
    writer = hub.attach({ id: FILES_WRITER_ID, kind: 'output' })
  } catch (error) {
    files.close()
    throw error
  }

  const current = () => hub.read()[STORE_ID] as Model

  let synced = options.first
  // The definitions of the last correct read of the folder.
  let disk = options.first.definitions
  let watcher: FSWatcher | undefined
  let timer: NodeJS.Timeout | undefined
  let queue: Promise<void> = Promise.resolve()
  let writeQueued = false
  let correct = true
  let held = false
  // The store and the disk definitions at the last complete check of the writer.
  let checked: { store: unknown; disk: Model['definitions'] } | undefined
  let closed = false
  let closing: Promise<void> | undefined

  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(job)
  }

  /** Reads the folder. `quiet` skips the warnings when the model did not change. */
  const read = async (quiet: boolean) => {
    if (closed) {
      return
    }
    try {
      const result = await readModelFolder(folder)
      const validation = result.data === undefined ? undefined : validateModel(result.data)
      if (validation?.ok !== true) {
        const problems = validation === undefined ? result.problems : withSource(validation.problems, result)
        problems.forEach((problem) => {
          log(formatProblem(problem))
        })
        log('wishem: the last correct model stays')
        correct = false
        return
      }

      const read = validation.model
      disk = read.definitions
      const store = current()
      const next: Model = {
        definitions: sameDefinitions(read, synced) ? store.definitions : read.definitions,
        entities: sameEntities(read.entities, synced.entities) ? store.entities : read.entities,
      }
      let changed = false
      if (!isEqual(next, store)) {
        const outcome = await files.submit(inputs.replaceModel(next))
        if (!outcome.ok) {
          if (outcome.reason !== 'not-running') {
            outcome.problems.forEach((problem) => {
              const entry: Problem = { severity: 'error', message: problem.message, path: [...(problem.path ?? [])] }
              log(formatProblem(withSource([entry], result)[0] ?? entry))
            })
            log('wishem: the last correct model stays')
            correct = false
          }
          return
        }
        changed = true
      }
      synced = read
      if (!quiet || changed) {
        withSource(validation.warnings, result).forEach((warning) => {
          log(formatProblem(warning))
        })
      }
      if (!correct) {
        log(`wishem: the model is correct: ${describeCounts(current())}`)
      }
      correct = true
      requestWrite()
    } catch (error) {
      log(`wishem: cannot read the model: ${String(error)}`)
    }
  }

  const write = async () => {
    writeQueued = false
    const store = current()
    if (checked?.store === store && checked.disk === disk) {
      return
    }
    const { definitions, entities } = store
    if (!sameDefinitionList(definitions, disk)) {
      if (!held) {
        log(
          `wishem: the definitions of the store differ from the files in definitions, so ${STATE_FILE} is not written`,
        )
        held = true
      }
      checked = { store, disk }
      return
    }
    if (held) {
      log('wishem: the definitions of the store are equal to the files in definitions again')
      held = false
    }
    if (entities === synced.entities || sameEntities(entities, synced.entities)) {
      checked = { store, disk }
      return
    }
    const temporary = path.join(folder, `.${STATE_FILE}.${randomBytes(4).toString('hex')}.tmp`)
    try {
      await writeFile(temporary, `${JSON.stringify({ entities }, null, 2)}\n`)
      await rename(temporary, stateFile)
      synced = { ...synced, entities }
      checked = { store, disk }
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      log(`wishem: cannot write ${STATE_FILE}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const requestWrite = () => {
    if (!writeQueued) {
      writeQueued = true
      enqueue(write)
    }
  }

  writer.subscribe((event) => {
    if (event.type === 'applied') {
      requestWrite()
    }
  })

  const scheduleRead = (quiet: boolean) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      enqueue(() => read(quiet))
    }, SETTLE_MS)
  }

  return {
    watch: () => {
      watcher = watch(folder, { recursive: true }, () => {
        if (!closed) {
          scheduleRead(false)
        }
      })
      watcher.on('error', (error) => {
        log(`wishem: the watch failed: ${error.message}`)
        options.onWatchError?.(error)
      })
      // Picks up a change made between the first read and the start of the watch.
      scheduleRead(true)
    },
    close: () => {
      closing ??= (async () => {
        closed = true
        clearTimeout(timer)
        watcher?.close()
        let seen: Promise<void>
        do {
          seen = queue
          await seen
        } while (seen !== queue)
        if (!sameDefinitionList(current().definitions, disk)) {
          log('wishem: the process stops, and the model folder does not hold the last changes of the store')
        }
        files.close()
        writer.close()
      })()
      return closing
    },
  }
}
