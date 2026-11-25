// Serves a folder over HTTP on 127.0.0.1. Usage: node static-server.js <folder> <port>
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const [folderArg, portArg] = process.argv.slice(2)
if (!folderArg || !portArg) {
  console.error('usage: node static-server.js <folder> <port>')
  process.exit(1)
}

const root = resolve(folderArg)

/** @type {Record<string, string>} */
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

createServer((request, response) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }
  const file = normalize(join(root, pathname))
  const inside = file === root || file.startsWith(root + sep)
  if (!inside || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.writeHead(404).end('Not found')
    return
  }
  response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
}).listen(Number(portArg), '127.0.0.1')
