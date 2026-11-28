// Starts the construct of the Godot renderer in a Node.js process.
// Usage: node start.ts [--paused] [--port <number>]
import { parseArgs } from 'node:util'
import { DEFAULT_PORT } from '../src/construct/model.ts'
import { startGodotConstruct } from '../src/construct/process.ts'

const parsePort = (value: string | undefined) => {
  if (value === undefined) {
    return DEFAULT_PORT
  }
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 65535) {
    throw new Error('--port must be a number from 0 to 65535')
  }
  return number
}

const isPortInUse = (error: unknown) => error instanceof Error && (error as { code?: string }).code === 'EADDRINUSE'

const main = async () => {
  let port = DEFAULT_PORT
  try {
    const { values } = parseArgs({ options: { paused: { type: 'boolean' }, port: { type: 'string' } } })
    port = parsePort(values.port)
    const paused = values.paused === true
    if (paused) {
      console.log('wishem: the time of the construct starts paused')
    }
    const construct = await startGodotConstruct({ port, paused })
    console.log(`wishem: link at ${construct.linkUrl}`)

    let stopping = false
    const stop = () => {
      if (stopping) {
        return
      }
      stopping = true
      construct.close().then(
        () => process.exit(0),
        (error: unknown) => {
          console.error(`wishem: cannot stop: ${String(error)}`)
          process.exit(1)
        },
      )
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  } catch (error) {
    if (isPortInUse(error)) {
      console.error(`wishem: port ${String(port)} is in use`)
    } else {
      console.error(error instanceof Error ? `wishem: ${error.message}` : error)
    }
    process.exit(1)
  }
}

if (import.meta.filename === process.argv[1]) {
  void main()
}
