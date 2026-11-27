// A client of the link that sends the input hub/rewind, and prints the state that it reads after the result.
// Usage: node rewind-client.mjs --seq <number> [--url <address>]
// This file is the package '@thrashplay/wishem-hub', after its build.
import { parseArgs } from 'node:util'
import { hubInputs, openLink, webSocketChannel } from '../../../hub/dist/index.js'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'ws://127.0.0.1:4747/link' },
    seq: { type: 'string' },
  },
})
if (values.seq === undefined) {
  console.error('usage: node rewind-client.mjs --seq <number> [--url <address>]')
  process.exit(2)
}

const id = process.pid
const link = await openLink(await webSocketChannel(new WebSocket(values.url)), [
  { id: `rewinder-${id}`, kind: 'input' },
])
const port = link.ports[`rewinder-${id}`]

const result = await port.submit(hubInputs.rewind(Number(values.seq)))
console.log('result:', JSON.stringify(result))
const [entity] = port.read().store.entities
console.log('title now:', JSON.stringify(Object.values(Object.values(entity.components)[0])[0]))
link.close()
await link.closed
