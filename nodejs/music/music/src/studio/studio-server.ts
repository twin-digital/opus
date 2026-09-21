import * as http from 'node:http'

import { logger } from '../logger.js'
import type { StudioApi, StudioState } from './studio-service.js'
import { TouchPageHtml } from './touch-page.js'

const ACTION_PATH = /^\/actions\/(record|stop|play-latest|play-take\/([^/]+))$/

export interface StudioServer {
  /** Address the server is listening on, e.g. `http://127.0.0.1:8765`. */
  url: string
  close(): Promise<void>
}

const send = (response: http.ServerResponse, status: number, body = '', type = 'text/plain') => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  response.end(body)
}

/**
 * Serves the touchscreen page and links it to the studio service. Any number of pages can be
 * open at once; each one sees the same state the Launchpad overlay renders from.
 *
 * - `GET /` — the page.
 * - `GET /events` — server-sent events: the current state on connect, then every change.
 * - `POST /actions/record | stop | play-latest | play-take/<id>` — the service's actions.
 */
export const createStudioServer = async ({
  service,
  port,
  host = '127.0.0.1',
}: {
  service: StudioApi
  /** 0 picks a free port. */
  port: number
  /** Bind address; the default keeps the page local to the machine driving REAPER. */
  host?: string
}): Promise<StudioServer> => {
  const log = logger.child({}, { msgPrefix: '[STUDIO-WEB] ' })
  const streams = new Set<http.ServerResponse>()

  const push = (state: StudioState) => {
    const frame = `data: ${JSON.stringify(state)}\n\n`
    streams.forEach((stream) => {
      stream.write(frame)
    })
  }
  service.events.on('change', push)

  const runAction = (action: string, takeId: string | undefined) => {
    switch (action) {
      case 'record':
        return service.record()
      case 'stop':
        return service.stopTransport()
      case 'play-latest':
        return service.playLatest()
      default:
        return service.playTake(decodeURIComponent(takeId ?? ''))
    }
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (request.method === 'GET' && url.pathname === '/') {
      send(response, 200, TouchPageHtml, 'text/html; charset=utf-8')
      return
    }

    if (request.method === 'GET' && url.pathname === '/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      })
      response.write(`data: ${JSON.stringify(service.getState())}\n\n`)
      streams.add(response)
      request.on('close', () => {
        streams.delete(response)
      })
      return
    }

    const action = request.method === 'POST' ? ACTION_PATH.exec(url.pathname) : null
    if (action !== null) {
      // fire and forget: the outcome reaches the page through the event stream
      runAction(action[1], action[2]).catch((error: unknown) => {
        log.warn(error, `Action ${url.pathname} failed.`)
      })
      send(response, 204)
      return
    }

    send(response, 404, 'Not found')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  const boundPort = typeof address === 'object' && address !== null ? address.port : port
  const url = `http://${host}:${String(boundPort)}`
  log.info(`Touch page at ${url}`)

  return {
    url,
    close: () => {
      service.events.off('change', push)
      streams.forEach((stream) => {
        stream.end()
      })
      streams.clear()
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve()
          } else {
            reject(error)
          }
        })
      })
    },
  }
}
