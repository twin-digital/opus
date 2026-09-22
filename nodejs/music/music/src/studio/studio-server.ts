import * as http from 'node:http'
import * as fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

import { logger } from '../logger.js'
import type { StudioApi, StudioState } from './studio-service.js'
import { TouchPageHtml } from './touch-page.js'
import { pipeline } from 'node:stream/promises'
import { defaultOutboxDir, findClipMix, mixContentType } from './outbox.js'

const ACTION_PATH = /^\/actions\/(record|stop|play-latest|play-take\/([^/]+)|rename\/([^/]+)|seek\/([^/]+))$/

/** The on-screen keyboard, served from its installed package so the page needs no CDN. */
/**
 * Each file is found next to the package's main entry (resolved through the package's own
 * exports), since the packages do not export their build files by subpath.
 */
const VENDOR_FILES: Record<string, { module: string; file: string; type: string }> = {
  '/vendor/simple-keyboard.js': { module: 'simple-keyboard', file: 'index.js', type: 'text/javascript' },
  '/vendor/simple-keyboard.css': { module: 'simple-keyboard', file: 'css/index.css', type: 'text/css' },
  '/vendor/wavesurfer.js': { module: 'wavesurfer.js', file: 'wavesurfer.min.js', type: 'text/javascript' },
}

const CLIP_PATH = /^\/clips\/([^/]+)\.wav$/

const readVendorFile = (() => {
  const cache = new Map<string, Promise<string>>()
  return (module: string, file: string) => {
    const key = `${module}/${file}`
    let read = cache.get(key)
    if (read === undefined) {
      read = (async () => {
        const entry = fileURLToPath(import.meta.resolve(module))
        return fs.readFile(path.join(path.dirname(entry), file), 'utf8')
      })()
      read.catch(() => cache.delete(key)) // a failed lookup is retried next time, not cached
      cache.set(key, read)
    }
    return read
  }
})()

const MAX_BODY_BYTES = 4096

const readJsonBody = (request: http.IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        request.destroy()
      }
    })
    request.on('end', () => {
      try {
        const parsed: unknown = body === '' ? {} : JSON.parse(body)
        resolve(typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {})
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
    request.on('error', reject)
  })

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
 * - `POST /actions/rename/<id>` with `{"name": "..."}` — relabels a clip.
 * - `POST /actions/play-take/<id>` may carry `{"at": <seconds>}` to start part-way in.
 * - `POST /actions/seek/<id>` with `{"at": <seconds>}` — moves playback within a clip (scrubbing).
 * - `GET /clips/<id>.wav` — the clip's finished mix from the Outbox (whatever format the project
 *   renders in; the media type follows the file), for the waveform.
 * - `GET /vendor/*` — the on-screen keyboard's script and stylesheet, and the waveform library.
 */
export const createStudioServer = async ({
  service,
  port,
  host = '127.0.0.1',
  outboxDir = defaultOutboxDir(),
  clipFile,
}: {
  service: StudioApi
  /** 0 picks a free port. */
  port: number
  /** Bind address; the default keeps the page local to the machine driving REAPER. */
  host?: string
  /** Where the watcher's Outbox is, for serving rendered mixes. */
  outboxDir?: string
  /** Overrides how a clip's mix file is found (the preview hands out a synthetic one). */
  clipFile?: (id: string) => Promise<string | undefined>
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

  const runAction = async (request: http.IncomingMessage, match: RegExpExecArray) => {
    const action = match[1]
    // optional groups are absent for the other actions; .at() keeps that in the type
    const playId = match.at(2)
    const renameId = match.at(3)
    const seekId = match.at(4)
    switch (action) {
      case 'record':
        return service.record()
      case 'stop':
        return service.stopTransport()
      case 'play-latest':
        return service.playLatest()
      default:
        if (renameId !== undefined) {
          const { name } = await readJsonBody(request)
          return service.renameTake(decodeURIComponent(renameId), typeof name === 'string' ? name : '')
        }
        if (seekId !== undefined) {
          const { at } = await readJsonBody(request)
          return service.seekTake(decodeURIComponent(seekId), typeof at === 'number' && Number.isFinite(at) ? at : 0)
        }
        {
          const { at } = await readJsonBody(request)
          return service.playTake(
            decodeURIComponent(playId ?? ''),
            typeof at === 'number' && Number.isFinite(at) ? at : 0,
          )
        }
    }
  }

  /**
   * Streams a clip's finished mix in chunks (the MIDI echo shares this process; a whole mix in
   * one buffer would be a large copy on the main thread). The file can vanish between lookup and
   * open, since the watcher renames and re-renders mixes: every failure ends up in the caller's
   * catch, and an aborted download releases the file.
   */
  const serveClip = async (rawId: string, response: http.ServerResponse) => {
    let id: string
    try {
      id = decodeURIComponent(rawId)
    } catch {
      send(response, 400, 'Bad clip id')
      return
    }
    const { takes, projectName } = service.getState()
    const take = takes.find((candidate) => candidate.id === id)
    const file =
      clipFile !== undefined ? await clipFile(id)
      : take?.number !== undefined && projectName !== undefined ? await findClipMix(outboxDir, projectName, take.number)
      : undefined
    if (file === undefined) {
      send(response, 404, 'No rendered mix for this clip yet')
      return
    }
    const stat = await fs.stat(file)
    if (!stat.isFile()) {
      send(response, 404, 'Not found')
      return
    }
    // opened before any header goes out, so an open failure is still a clean 404; bounded to
    // the size just measured, so a file growing underneath (a re-render) cannot overrun it
    const stream = createReadStream(file, { highWaterMark: 256 * 1024, end: Math.max(0, stat.size - 1) })
    try {
      await once(stream, 'open')
      response.writeHead(200, {
        'content-type': mixContentType(file),
        'content-length': stat.size,
        'cache-control': 'no-store',
      })
      await pipeline(stream, response)
    } finally {
      // pipeline rejects before attaching its cleanup when the client has already gone
      stream.destroy()
    }
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (request.method === 'GET' && url.pathname === '/') {
      send(response, 200, TouchPageHtml, 'text/html; charset=utf-8')
      return
    }

    const vendor = request.method === 'GET' ? VENDOR_FILES[url.pathname] : undefined
    if (vendor !== undefined) {
      readVendorFile(vendor.module, vendor.file).then(
        (content) => {
          send(response, 200, content, vendor.type)
        },
        (error: unknown) => {
          log.warn(error, `Cannot serve ${url.pathname}.`)
          send(response, 404, 'Not found')
        },
      )
      return
    }

    const clip = request.method === 'GET' ? CLIP_PATH.exec(url.pathname) : null
    if (clip !== null) {
      serveClip(clip.at(1) ?? '', response).catch((error: unknown) => {
        // nothing below may take the process down: it also hosts the MIDI echo. The page drops
        // a download whenever it moves to another clip, which is routine, not a failure
        if (response.destroyed) {
          log.debug(`Client left while downloading ${url.pathname}.`)
        } else {
          log.warn(error, `Cannot serve ${url.pathname}.`)
        }
        if (!response.headersSent) {
          send(response, 404, 'Not found')
        } else {
          response.destroy()
        }
      })
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
      runAction(request, action).catch((error: unknown) => {
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
