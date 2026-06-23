import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'

/** A running fake server. */
export interface Fake {
  /** e.g. `http://127.0.0.1:54321` — use as the client base URL. */
  readonly baseUrl: string
  close: () => Promise<void>
}

export const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw.length === 0 ? undefined : JSON.parse(raw)
}

/**
 * Wrap a request handler in an ephemeral-port server. The handler may throw or reject —
 * that becomes a 500 so a fake bug surfaces as a failed assertion, not a hung socket.
 */
export const startServer = async (
  handle: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): Promise<Fake> => {
  const server: Server = createServer((req, res) => {
    void Promise.resolve(handle(req, res)).catch((err: unknown) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      }),
  }
}
