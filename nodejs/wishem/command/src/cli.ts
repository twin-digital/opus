#!/usr/bin/env node
import path from 'node:path'
import { parseArgs } from 'node:util'
import { ModelError } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { DEFAULT_PORT, PRODUCT_ID, startConstruct } from '@thrashplay/wishem-host-nodejs'
import type { Construct } from '@thrashplay/wishem-host-nodejs'
import { describeCounts, formatProblem } from '@thrashplay/wishem-host-nodejs/format'

const USAGE = 'usage: wishem start <folder> [--product <folder>] [--port <number>]'

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
    parsed = parseArgs({ allowPositionals: true, options: { port: { type: 'string' }, product: { type: 'string' } } })
  } catch (error) {
    return usageError(error instanceof Error ? error.message : String(error))
  }

  const [command, folder] = parsed.positionals
  if (command !== 'start' || parsed.positionals.length < 2) {
    return usageError()
  }

  const product = parsed.values.product
  if (product === '') {
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
  if (product !== undefined) {
    say(`wishem: product ${path.resolve(product)}`)
  }

  let construct: Construct | undefined
  const stopState = { requested: false }
  const closeAndExit = (target: Construct, code = 0) => {
    target.close().then(
      () => process.exit(code),
      (error: unknown) => {
        console.error(`wishem: cannot stop: ${String(error)}`)
        process.exit(1)
      },
    )
  }
  const stop = () => {
    if (stopState.requested) {
      return
    }
    stopState.requested = true
    if (construct !== undefined) {
      closeAndExit(construct)
    }
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  try {
    const started = await startConstruct({
      folder,
      product,
      port,
      log: say,
      onWatchError: () => {
        if (construct === undefined) {
          process.exit(1)
        } else {
          closeAndExit(construct, 1)
        }
      },
    })
    construct = started
    if (stopState.requested) {
      closeAndExit(started)
      return
    }
    say(`wishem: ${describeCounts(started.hub.read().store as Model)}`)
    if (product !== undefined) {
      say(`wishem: product: ${describeCounts(started.hub.read()[PRODUCT_ID] as Model)}`)
    }
    say(`wishem: link at ${started.linkUrl}`)
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
