// A client of the link with no library. It follows the protocol in nodejs/wishem/hub/LINK.md.
// Usage: node raw-link.mjs [--url <address>] [--send <JSON of one input>]... [--once]
// Each --send is one input. The inputs go out with no wait, as requests 1, 2, ...
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'ws://127.0.0.1:4747/link' },
    send: { type: 'string', multiple: true },
    once: { type: 'boolean', default: false },
  },
})

const sends = values.send ?? []
let results = 0
const socket = new WebSocket(values.url)
socket.addEventListener('open', () => {
  const hello = { t: 'hello', protocol: 1, subsystems: [{ id: `raw-${process.pid}`, kind: 'input' }] }
  console.log('sent:', JSON.stringify(hello))
  socket.send(JSON.stringify(hello))
})
socket.addEventListener('message', ({ data }) => {
  console.log('received:', data)
  const message = JSON.parse(data)
  if (message.t === 'welcome' && sends.length > 0) {
    sends.forEach((input, index) => {
      const submit = { t: 'submit', request: index + 1, subsystem: `raw-${process.pid}`, input: JSON.parse(input) }
      console.log('sent:', JSON.stringify(submit))
      socket.send(JSON.stringify(submit))
    })
  } else if (message.t === 'result') {
    results += 1
    if (values.once && results >= sends.length) socket.close()
  } else if (values.once && message.t === 'welcome') {
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
