// A client of the link that steps, runs, or pauses the time of a construct, and prints the result.
// Usage: node time-client.mjs [--url <address>] step|run|pause
// This file uses the built packages '@thrashplay/wishem-hub' and '@thrashplay/wishem-clock'.
import { parseArgs } from 'node:util'
import { timeInputs } from '../../../clock/dist/index.js'
import { openLink, webSocketChannel } from '../../../hub/dist/index.js'

const USAGE = 'usage: node time-client.mjs [--url <address>] step|run|pause'
const STEP_MS = 500

const inputs = {
  step: () => timeInputs.advance(STEP_MS),
  run: () => timeInputs.setRunning(true),
  pause: () => timeInputs.setRunning(false),
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { url: { type: 'string', default: 'ws://127.0.0.1:4749/link' } },
})
const makeInput = inputs[positionals[0] ?? '']
if (positionals.length !== 1 || makeInput === undefined) {
  console.error(USAGE)
  process.exit(1)
}

const id = `time-client-${process.pid}`
const link = await openLink(await webSocketChannel(new WebSocket(values.url)), [{ id, kind: 'input' }])
const result = await link.ports[id].submit(makeInput())
console.log('result:', JSON.stringify(result))
link.close()
await link.closed
