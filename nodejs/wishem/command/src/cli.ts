#!/usr/bin/env node
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createConstructList } from '@thrashplay/wishem-construct-manager'
import {
  attachConstructManager,
  checkProductCode,
  childProcessLauncher,
} from '@thrashplay/wishem-construct-manager/node'
import type { ConstructManager } from '@thrashplay/wishem-construct-manager/node'
import { ModelError } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { DEFAULT_PORT, PRODUCT_ID, startConstruct } from '@thrashplay/wishem-host-nodejs'
import type { Construct } from '@thrashplay/wishem-host-nodejs'
import { describeCounts, formatProblem } from '@thrashplay/wishem-host-nodejs/format'

const USAGE = 'usage: wishem start <folder> [--product <folder>] [--product-code <module>] [--port <number>]'

const isPathValue = (value: string) => value.startsWith('.') || value.startsWith('/')

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

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
    parsed = parseArgs({
      allowPositionals: true,
      options: { port: { type: 'string' }, product: { type: 'string' }, 'product-code': { type: 'string' } },
    })
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

  const productCode = parsed.values['product-code']
  if (productCode === '') {
    return usageError()
  }
  if (productCode !== undefined && product === undefined) {
    return usageError('--product-code needs --product')
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

  let productCodeUrl: string | undefined
  if (productCode !== undefined) {
    say(`wishem: product code ${productCode}`)
    try {
      productCodeUrl =
        isPathValue(productCode) ? pathToFileURL(path.resolve(productCode)).href : import.meta.resolve(productCode)
    } catch (error) {
      console.error(`wishem: the product code ${productCode} cannot be loaded: ${errorText(error)}`)
      process.exit(1)
    }
    const check = await checkProductCode(productCodeUrl)
    if (!check.ok) {
      console.error(
        check.reason === 'behaviors' ?
          `wishem: the product code has no correct list behaviors: ${check.message}`
        : `wishem: the product code ${productCode} cannot be loaded: ${check.message}`,
      )
      process.exit(1)
    }
  }

  let construct: Construct | undefined
  let manager: ConstructManager | undefined
  const stopState = { requested: false }
  const closeAndExit = (target: Construct, code = 0) => {
    // The manager stops each product construct before the hub closes.
    const closing =
      manager === undefined ?
        target.close()
      : manager.close().then(
          () => target.close(),
          (error: unknown) =>
            target.close().then(() => {
              throw error
            }),
        )
    closing.then(
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
      subsystems: product === undefined ? undefined : [createConstructList()],
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
    if (product !== undefined) {
      try {
        manager = attachConstructManager({
          hub: started.hub,
          launch: childProcessLauncher({ productCode: productCodeUrl }),
          log: say,
        })
      } catch (error) {
        await started.close()
        throw error
      }
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
