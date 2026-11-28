// Starts the sample construct and serves its link.
// Usage: node construct.ts [--paused] [--hub-port <number>]
import { parseArgs } from 'node:util'
import { DEFAULT_HUB_PORT, startSampleConstruct } from '../src/sample-construct.ts'

const parsePort = (name: string, value: string | undefined, fallback: number) => {
  if (value === undefined) {
    return fallback
  }
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 65535) {
    throw new Error(`${name} must be a number from 0 to 65535`)
  }
  return number
}

const main = async () => {
  try {
    const { values } = parseArgs({
      options: {
        paused: { type: 'boolean' },
        'hub-port': { type: 'string' },
      },
    })
    const port = parsePort('--hub-port', values['hub-port'], DEFAULT_HUB_PORT)
    const paused = values.paused === true
    if (paused) {
      console.log('wishem: the time of the construct starts paused')
    }

    let construct
    try {
      construct = await startSampleConstruct({ port, paused })
    } catch (error) {
      if (error instanceof Error && (error as { code?: string }).code === 'EADDRINUSE') {
        console.error(`wishem: port ${String(port)} is in use`)
        process.exit(1)
      }
      throw error
    }
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
    console.error(error instanceof Error ? `wishem: ${error.message}` : error)
    process.exit(1)
  }
}

void main()
