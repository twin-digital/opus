#!/usr/bin/env node
import path from 'node:path'
import { parseArgs } from 'node:util'
import { ModelError } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { describeCounts, formatProblem } from './format.js'
import { DEFAULT_PORT, startConstruct } from './start-construct.js'

const USAGE = 'usage: wishem start <folder> [--port <number>]'

const say = (line: string) => {
  console.log(line)
}

const usageError = (message?: string): never => {
  if (message) {
    console.error(`wishem: ${message}`)
  }
  console.error(USAGE)
  process.exit(2)
}

const main = async () => {
  let parsed
  try {
    parsed = parseArgs({ allowPositionals: true, options: { port: { type: 'string' } } })
  } catch (error) {
    return usageError(error instanceof Error ? error.message : String(error))
  }

  const [command, folder] = parsed.positionals
  if (command !== 'start' || parsed.positionals.length < 2) {
    return usageError()
  }

  const portText = parsed.values.port
  const port =
    portText === undefined ? DEFAULT_PORT
    : /^\d+$/.test(portText) ? Number(portText)
    : NaN
  if (!Number.isInteger(port) || port > 65535) {
    return usageError(`the port must be a number from 0 to 65535, not "${parsed.values.port ?? ''}"`)
  }

  say(`wishem: model ${path.resolve(folder)}`)

  try {
    const construct = await startConstruct({
      folder,
      port,
      log: say,
      onWatchError: () => {
        process.exit(1)
      },
    })
    say(`wishem: ${describeCounts(construct.hub.read().store as Model)}`)
    say(`wishem: link at ${construct.linkUrl}`)

    const stop = () => {
      void construct.close().then(() => {
        process.exit(0)
      })
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  } catch (error) {
    if (error instanceof ModelError) {
      error.problems.forEach((problem) => {
        console.error(formatProblem(problem))
      })
      console.error('wishem: the model is not correct, so the hub did not start')
    } else if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`wishem: port ${port} is in use`)
    } else {
      console.error(`wishem: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

await main()
