import { writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { createConnection, createServer } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ModelError } from '@thrashplay/wishem-core'
import type { Snapshot } from '@thrashplay/wishem-core'
import { startHost } from './start-host.js'
import type { Host } from './start-host.js'

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const CT2 = 'ct_9a9a9a9a-0000-4000-8000-000000000000'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const E = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

const definition = (label = 'AppBar', id = CT) => ({ id, label, fields: [{ id: FLD, label: 'title', type: 'string' }] })
const state = (title = 'Wishem') => ({ entities: [{ id: E, components: { [CT]: { [FLD]: title } } }] })

/** Reads Server-Sent Events from a response. */
const openStream = async (url: string) => {
  const controller = new AbortController()
  const response = await fetch(`${url}/snapshots`, { signal: controller.signal })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const next = async (): Promise<{ event: string; data: Snapshot } | undefined> => {
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end >= 0) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const event = /^event: (.*)$/m.exec(block)?.[1] ?? ''
        const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null') as Snapshot
        return { event, data }
      }
      const chunk = await reader.read()
      if (chunk.done) {
        return undefined
      }
      buffer += decoder.decode(chunk.value, { stream: true })
    }
  }
  return {
    response,
    next,
    abort: () => {
      controller.abort()
    },
  }
}

const eventually = async (check: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The first IPv4 address of the computer that is not the loopback address. */
const externalAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address

const getTitle = (snapshot: Snapshot) => snapshot.entities[0]?.components[CT]?.[FLD]

describe('startHost', () => {
  let folder: string
  let hosts: Host[]
  let lines: string[]

  const write = async (name: string, content: unknown) => {
    await mkdir(path.dirname(path.join(folder, name)), { recursive: true })
    await writeFile(path.join(folder, name), typeof content === 'string' ? content : JSON.stringify(content))
  }

  const start = async () => {
    const host = await startHost({ folder, port: 0, log: (line) => lines.push(line) })
    hosts.push(host)
    return host
  }

  const title = (host: Host) => {
    const value = host.core.getSnapshot().entities[0]?.components[CT]?.[FLD]
    return value
  }

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-host-'))
    hosts = []
    lines = []
    await write(`definitions/${CT}.json`, definition())
    await write('state.json', state())
  })

  afterEach(async () => {
    await Promise.all(hosts.map((host) => host.close()))
    await rm(folder, { recursive: true, force: true })
  })

  describe('server', () => {
    it('listens on 127.0.0.1', async () => {
      const host = await start()
      expect(host.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    })

    it('serves the snapshot as JSON', async () => {
      const host = await start()
      const response = await fetch(`${host.url}/snapshot`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.json()).toEqual({ definitions: [definition()], entities: state().entities })
    })

    it('sends the current snapshot first on a stream', async () => {
      const host = await start()
      const stream = await openStream(host.url)
      expect(stream.response.headers.get('content-type')).toContain('text/event-stream')
      const first = await stream.next()
      expect(first?.event).toBe('snapshot')
      expect(first?.data).toEqual(host.core.getSnapshot())
      stream.abort()
    })

    it('sends a new snapshot to two streams, and continues after one closes', async () => {
      const host = await start()
      const a = await openStream(host.url)
      const b = await openStream(host.url)
      await a.next()
      await b.next()
      await write('state.json', state('One'))
      const fromA = await a.next()
      const fromB = await b.next()
      expect(fromA?.data.entities[0]?.components[CT]?.[FLD]).toBe('One')
      expect(fromB?.data.entities[0]?.components[CT]?.[FLD]).toBe('One')
      a.abort()
      await write('state.json', state('Two'))
      expect((await b.next())?.data.entities[0]?.components[CT]?.[FLD]).toBe('Two')
      b.abort()
    })

    it('gives 404 with a JSON error for an unknown path', async () => {
      const host = await start()
      const response = await fetch(`${host.url}/panels`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'No such path: /panels' })
    })

    it('gives 404 with a JSON error for a request target that is not a valid URL path', async () => {
      const host = await start()
      const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: Number(new URL(host.url).port), path: '//' }, (res) => {
          let text = ''
          res.on('data', (chunk: Buffer) => {
            text += chunk.toString()
          })
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body: text })
          })
        })
        req.on('error', reject)
        req.end()
      })
      expect(status).toBe(404)
      expect(JSON.parse(body)).toHaveProperty('error')
      expect((await fetch(`${host.url}/snapshot`)).status).toBe(200)
    })

    it('serves the current snapshot, not the first one', async () => {
      const host = await start()
      await pause(200)
      await write('state.json', state('Changed'))
      await eventually(() => title(host) === 'Changed')
      const response = await fetch(`${host.url}/snapshot`)
      expect(getTitle((await response.json()) as Snapshot)).toBe('Changed')
    })

    it('serves the snapshot when the path has a query', async () => {
      const host = await start()
      const response = await fetch(`${host.url}/snapshot?pretty=1`)
      expect(response.status).toBe(200)
      expect(((await response.json()) as Snapshot).entities).toHaveLength(1)
    })

    it('refuses a connection to an address that is not the loopback address', async (context) => {
      if (externalAddress === undefined) {
        context.skip()
        return
      }
      const host = await start()
      const port = Number(new URL(host.url).port)
      const code = await new Promise<string>((resolve) => {
        const socket = createConnection({ host: externalAddress, port })
        socket.on('connect', () => {
          socket.destroy()
          resolve('connected')
        })
        socket.on('error', (error: NodeJS.ErrnoException) => {
          resolve(error.code ?? 'error')
        })
      })
      expect(code).toBe('ECONNREFUSED')
    })

    it.each(['PUT', 'DELETE', 'PATCH'])('gives 405 for %s on /snapshot, with an Allow header', async (method) => {
      const host = await start()
      const response = await fetch(`${host.url}/snapshot`, { method })
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET')
      expect(await response.json()).toHaveProperty('error')
    })

    it('gives 405 for POST on /snapshots', async () => {
      const host = await start()
      const response = await fetch(`${host.url}/snapshots`, { method: 'POST' })
      expect(response.status).toBe(405)
      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('gives 405 with a JSON error for a method that is not GET', async () => {
      const host = await start()
      const response = await fetch(`${host.url}/snapshot`, { method: 'POST' })
      expect(response.status).toBe(405)
      expect(await response.json()).toHaveProperty('error')
    })

    it('rejects with a ModelError when the model is not correct', async () => {
      await write('state.json', '{')
      await expect(startHost({ folder, port: 0, log: () => undefined })).rejects.toBeInstanceOf(ModelError)
    })

    it('rejects with problems that name their file', async () => {
      await write('definitions/other.json', {
        ...definition('Other', CT2),
        fields: [{ id: FLD, label: 'x', type: 'number' }],
      })
      const error = await startHost({ folder, port: 0, log: () => undefined }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ModelError)
      const problems = (error as ModelError).problems
      expect(problems.length).toBeGreaterThan(0)
      expect(problems.every((problem) => problem.source === path.join('definitions', 'other.json'))).toBe(true)
    })

    it('rejects when the port is in use', async () => {
      const blocker = createServer()
      await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
      const address = blocker.address()
      const port = typeof address === 'object' && address ? address.port : 0
      await expect(startHost({ folder, port, log: () => undefined })).rejects.toThrow(/EADDRINUSE/)
      await new Promise((resolve) => blocker.close(resolve))
    })

    it('closes while a client holds an incomplete request', async () => {
      const host = await start()
      const socket = createConnection({ host: '127.0.0.1', port: Number(new URL(host.url).port) })
      await new Promise<void>((resolve) => socket.on('connect', resolve))
      socket.write('GET /snapshot HTTP/1.1\r\nHost: x')
      await pause(50)
      await host.close()
      socket.destroy()
    })

    it('ends open streams and frees the port on close', async () => {
      const host = await start()
      const stream = await openStream(host.url)
      await stream.next()
      await host.close()
      expect(await stream.next()).toBeUndefined()
      const port = Number(new URL(host.url).port)
      const again = await startHost({ folder, port, log: () => undefined })
      hosts.push(again)
    })
  })

  describe('watch', () => {
    it('follows a changed title in state.json', async () => {
      const host = await start()
      const stream = await openStream(host.url)
      await stream.next()
      await pause(200)
      await write('state.json', state('Wishem workbench'))
      expect((await stream.next())?.data.entities[0]?.components[CT]?.[FLD]).toBe('Wishem workbench')
      expect(title(host)).toBe('Wishem workbench')
      stream.abort()
    })

    it('follows a changed label', async () => {
      const host = await start()
      await pause(200)
      await write(`definitions/${CT}.json`, definition('Header'))
      await eventually(() => host.core.getSnapshot().definitions[0]?.label === 'Header')
    })

    it('follows a new definition file', async () => {
      const host = await start()
      await pause(200)
      await write('definitions/other.json', definition('Other', CT2))
      await eventually(() => host.core.getSnapshot().definitions.length === 2)
    })

    it('keeps the last snapshot for invalid JSON, then follows the correction', async () => {
      const host = await start()
      const before = host.core.getSnapshot()
      await write('state.json', '{ "entities": [')
      await eventually(() => lines.some((line) => line.includes('problem in state.json')))
      expect(lines).toContain('wishem: the last correct snapshot stays')
      expect(host.core.getSnapshot()).toBe(before)
      expect(lines.some((line) => line.includes('the model is correct') || line.includes('listener failed'))).toBe(
        false,
      )
      await write('state.json', state('Fixed'))
      await eventually(() => title(host) === 'Fixed')
      await eventually(() =>
        lines.some((line) => line.startsWith('wishem: the model is correct: 1 component type, 1 entity')),
      )
    })

    it('says that the model is correct only after a problem, and once', async () => {
      const host = await start()
      await pause(200)
      await write('state.json', state('One'))
      await eventually(() => title(host) === 'One')
      await write('state.json', '{')
      await eventually(() => lines.some((line) => line.includes('problem in state.json')))
      expect(lines.some((line) => line.includes('the model is correct'))).toBe(false)
      await write('state.json', state('Two'))
      await eventually(() => lines.filter((line) => line.includes('the model is correct')).length === 1)
      await write('state.json', state('Three'))
      await eventually(() => title(host) === 'Three')
      await pause(200)
      expect(lines.filter((line) => line.includes('the model is correct'))).toHaveLength(1)
    })

    it('names state.json in the problem of a state that is not correct', async () => {
      const host = await start()
      await pause(200)
      await write('state.json', { entities: [{ id: E, components: { [CT2]: {} } }] })
      await eventually(() => lines.some((line) => line.includes('problem in state.json')))
      expect(lines).toContain('wishem: the last correct snapshot stays')
      expect(title(host)).toBe('Wishem')
    })

    it('follows a save through a temporary file and a rename', async () => {
      const host = await start()
      await pause(200)
      await write('state.json.tmp', state('Renamed'))
      await pause(200)
      expect(title(host)).toBe('Wishem')
      await rename(path.join(folder, 'state.json.tmp'), path.join(folder, 'state.json'))
      await eventually(() => title(host) === 'Renamed')
    })

    it('logs a failed listener, keeps the new model, and keeps running', async () => {
      const host = await start()
      host.core.subscribe(() => {
        throw new Error('listener broke')
      })
      await write('state.json', state('First'))
      await eventually(() => lines.some((line) => line.includes('a listener failed: ')))
      expect(lines.some((line) => line.includes('listener broke'))).toBe(true)
      expect(lines.some((line) => line.includes('cannot read the model'))).toBe(false)
      expect(title(host)).toBe('First')
      await write('state.json', state('Second'))
      await eventually(() => title(host) === 'Second')
    })

    it('logs each failed listener', async () => {
      const host = await start()
      host.core.subscribe(() => {
        throw new Error('broke one')
      })
      host.core.subscribe(() => {
        throw new Error('broke two')
      })
      await pause(200)
      await write('state.json', state('First'))
      await eventually(() => lines.some((line) => line.includes('broke two')))
      expect(lines.some((line) => line.includes('a listener failed: broke one'))).toBe(true)
      expect(lines.some((line) => line.includes('a listener failed: broke two'))).toBe(true)
    })

    it('prints a warning for two component types with the same label', async () => {
      await start()
      await write('definitions/other.json', definition('AppBar', CT2))
      await eventually(() => lines.some((line) => line.includes('warning')))
    })

    it('prints a warning once at the start, and not again when nothing changes', async () => {
      await write('definitions/other.json', definition('AppBar', CT2))
      await start()
      expect(lines.filter((line) => line.includes('warning'))).toHaveLength(1)
      await pause(300)
      expect(lines.filter((line) => line.includes('warning'))).toHaveLength(1)
    })

    it('does not print that the model is correct after a start or a valid change', async () => {
      const host = await start()
      await pause(200)
      await write('state.json', state('Next'))
      await eventually(() => title(host) === 'Next')
      expect(lines.some((line) => line.includes('the model is correct'))).toBe(false)
    })

    it('joins the events of a burst of writes into one read', async () => {
      await write('definitions/other.json', definition('AppBar', CT2))
      const host = await start()
      await pause(300)
      const warnings = () => lines.filter((line) => line.includes('warning')).length
      const before = warnings()
      for (let index = 0; index < 8; index++) {
        writeFileSync(path.join(folder, 'state.json'), JSON.stringify(state(`Burst ${index}`)))
      }
      await eventually(() => title(host) === 'Burst 7')
      await pause(300)
      expect(warnings() - before).toBe(1)
    })

    it('follows a change that is made between the first read and the start of the watch', async () => {
      await write('definitions/other.json', definition('AppBar', CT2))
      let raced = false
      const host = await startHost({
        folder,
        port: 0,
        log: (line) => {
          lines.push(line)
          if (!raced) {
            raced = true
            writeFileSync(path.join(folder, 'state.json'), JSON.stringify(state('Raced')))
          }
        },
      })
      hosts.push(host)
      await eventually(() => title(host) === 'Raced')
      // The warning shows at the start, and again for the model that changed.
      await eventually(() => lines.filter((line) => line.includes('warning')).length === 2)
    })

    it('does not follow a change after close', async () => {
      const host = await start()
      await pause(200)
      await host.close()
      await write('state.json', state('After close'))
      await pause(300)
      expect(title(host)).toBe('Wishem')
    })
  })
})
