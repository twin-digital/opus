import { createServer, type IncomingMessage, type Server } from 'node:http'

import { handleRoute, type RouteContext, type RouteResult } from './routes.js'

const MAX_BODY_BYTES = 1024 * 1024

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      throw new Error('request body too large')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Bind the route dispatcher to node:http. A handler failure answers 500; it never crashes. */
export const startServer = async (context: RouteContext, port: number, host = '127.0.0.1'): Promise<Server> => {
  const log = context.log ?? (() => undefined)
  const server = createServer((request, response) => {
    void (async () => {
      const method = request.method ?? 'GET'
      const path = new URL(request.url ?? '/', 'http://localhost').pathname
      let result: RouteResult | undefined
      try {
        const raw = await readBody(request)
        let body: unknown
        if (raw.length > 0) {
          try {
            body = JSON.parse(raw)
          } catch {
            result = { status: 400, contentType: 'application/json', body: '{"error":"invalid JSON body"}' }
          }
        }
        result ??= handleRoute(context, method, path, body)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log(`ERROR ${method} ${path}: ${message}`)
        result = { status: 500, contentType: 'application/json', body: JSON.stringify({ error: message }) }
      }
      response.writeHead(result.status, { 'content-type': result.contentType, 'cache-control': 'no-store' })
      response.end(result.body)
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolve)
  })
  return server
}
