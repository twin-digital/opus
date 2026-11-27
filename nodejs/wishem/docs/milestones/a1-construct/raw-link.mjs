// A client of the link with no library. It follows the protocol in nodejs/wishem/hub/LINK.md.
// Usage: node raw-link.mjs [--url <address>] [--send <JSON of one input>] [--once]
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'ws://127.0.0.1:4747/link' },
    send: { type: 'string' },
    once: { type: 'boolean', default: false },
  },
})

const socket = new WebSocket(values.url)
socket.addEventListener('open', () => {
  const hello = { t: 'hello', protocol: 1, subsystems: [{ id: `raw-${process.pid}`, kind: 'input' }] }
  console.log('sent:', JSON.stringify(hello))
  socket.send(JSON.stringify(hello))
})
socket.addEventListener('message', ({ data }) => {
  console.log('received:', data)
  const message = JSON.parse(data)
  if (message.t === 'welcome' && values.send !== undefined) {
    const submit = { t: 'submit', request: 1, subsystem: `raw-${process.pid}`, input: JSON.parse(values.send) }
    console.log('sent:', JSON.stringify(submit))
    socket.send(JSON.stringify(submit))
  } else if (values.once && (message.t === 'result' || (message.t === 'welcome' && values.send === undefined))) {
    socket.close()
  }
})
socket.addEventListener('error', () => {
  console.log('error: the connection failed')
})
socket.addEventListener('close', (event) => {
  console.log(`closed: code ${event.code}`)
})
process.on('SIGINT', () => {
  socket.close()
})
