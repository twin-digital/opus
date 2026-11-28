// Accepts one TCP connection on 127.0.0.1:<port>. Sends its bytes to stdout and writes stdin to it.
// Ends when the connection or stdin ends.
import { createServer } from 'node:net'

const port = Number(process.argv[2])
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('usage: node relay.mjs <port>')
  process.exit(2)
}

const server = createServer((socket) => {
  server.close()
  socket.on('data', (chunk) => process.stdout.write(chunk))
  socket.on('error', () => process.exit(0))
  socket.on('close', () => process.exit(0))
  process.stdin.on('data', (chunk) => socket.write(chunk))
})
server.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
server.listen(port, '127.0.0.1')
// Reads stdin while idle, so that its end is seen. Idle data is dropped.
process.stdin.resume()
process.stdin.on('end', () => process.exit(0))
process.stdin.on('error', () => process.exit(0))
