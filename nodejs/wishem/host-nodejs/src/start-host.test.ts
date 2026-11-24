import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
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

    it('rejects when the port is in use', async () => {
      const blocker = createServer()
      await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
      const address = blocker.address()
      const port = typeof address === 'object' && address ? address.port : 0
      await expect(startHost({ folder, port, log: () => undefined })).rejects.toThrow(/EADDRINUSE/)
      await new Promise((resolve) => blocker.close(resolve))
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
      await write('state.json', state('Wishem workbench'))
      expect((await stream.next())?.data.entities[0]?.components[CT]?.[FLD]).toBe('Wishem workbench')
      expect(title(host)).toBe('Wishem workbench')
      stream.abort()
    })

    it('follows a changed label', async () => {
      const host = await start()
      await write(`definitions/${CT}.json`, definition('Header'))
      await eventually(() => host.core.getSnapshot().definitions[0]?.label === 'Header')
    })

    it('follows a new definition file', async () => {
      const host = await start()
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
      await write('state.json', state('Fixed'))
      await eventually(() => title(host) === 'Fixed')
      expect(lines.some((line) => line.startsWith('wishem: the model is correct: 1 component type, 1 entity'))).toBe(
        true,
      )
    })

    it('follows a save through a temporary file and a rename', async () => {
      const host = await start()
      await write('state.json.tmp', state('Renamed'))
      await rename(path.join(folder, 'state.json.tmp'), path.join(folder, 'state.json'))
      await eventually(() => title(host) === 'Renamed')
    })

    it('prints a warning for two component types with the same label', async () => {
      await start()
      await write('definitions/other.json', definition('AppBar', CT2))
      await eventually(() => lines.some((line) => line.includes('warning')))
    })
  })
})
