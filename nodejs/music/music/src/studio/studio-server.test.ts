import { readdirSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Events } from '../typed-event-emitter.js'
import { createStudioServer, type StudioServer } from './studio-server.js'
import type { StudioEventMap, StudioService, StudioState } from './studio-service.js'

const idle: StudioState = {
  connected: true,
  transport: 'stopped',
  recordingElapsed: 0,
  level: 0,
  meters: [],
  position: 0,
  takes: [{ id: '1', name: 'Take 1', number: 1, label: '', start: 0, end: 10, duration: 10 }],
  playingTake: undefined,
  instruments: undefined,
  projectName: undefined,
  helper: undefined,
}

/** Open descriptors of this process, or 0 where /proc is not available. */
const openFdCount = () => {
  try {
    return readdirSync('/proc/self/fd').length
  } catch {
    return 0
  }
}

const makeService = () => {
  const events = new Events<StudioEventMap>()
  const service = {
    events,
    getState: vi.fn(() => idle),
    record: vi.fn(() => Promise.resolve()),
    stopTransport: vi.fn(() => Promise.resolve()),
    playLatest: vi.fn(() => Promise.resolve()),
    playTake: vi.fn((_id: string, _at?: number) => Promise.resolve()),
    renameTake: vi.fn((_id: string, _label: string) => Promise.resolve()),
    seekTake: vi.fn((_id: string, _at: number) => Promise.resolve()),
    reloadHelper: vi.fn(() => Promise.resolve()),
  }
  return service as unknown as StudioService & typeof service
}

/** Reads server-sent events off a fetch body, one parsed `data:` payload per call. */
const eventReader = async (url: string) => {
  const response = await fetch(url)
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new Error('no body')
  }
  const decoder = new TextDecoder()
  let buffer = ''
  const next = async (): Promise<StudioState> => {
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end !== -1) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        return JSON.parse(frame.replace(/^data: /, '')) as StudioState
      }
      const { value, done } = await reader.read()
      if (done) {
        throw new Error('stream ended')
      }
      buffer += decoder.decode(value)
    }
  }
  return { next, cancel: () => reader.cancel() }
}

describe('createStudioServer', () => {
  let server: StudioServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  it('serves the touch page', async () => {
    server = await createStudioServer({ service: makeService(), port: 0 })
    const response = await fetch(server.url)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('CS Studio')
  })

  it('streams the current state on connect and every change after', async () => {
    const service = makeService()
    server = await createStudioServer({ service, port: 0 })

    const events = await eventReader(`${server.url}/events`)
    expect(await events.next()).toEqual(idle)

    const recording: StudioState = { ...idle, transport: 'recording', recordingElapsed: 1.5 }
    service.events.emit('change', recording)
    expect(await events.next()).toEqual(recording)

    await events.cancel()
  })

  it('routes actions to the service', async () => {
    const service = makeService()
    server = await createStudioServer({ service, port: 0 })
    const post = (path: string) => fetch(`${server?.url ?? ''}${path}`, { method: 'POST' })

    expect((await post('/actions/record')).status).toBe(204)
    expect((await post('/actions/stop')).status).toBe(204)
    expect((await post('/actions/play-latest')).status).toBe(204)
    expect((await post('/actions/play-take/Take%201')).status).toBe(204)
    expect((await post('/actions/explode')).status).toBe(404)
    expect((await fetch(`${server.url}/actions/record`)).status).toBe(404)

    expect(service.record).toHaveBeenCalledOnce()
    expect(service.stopTransport).toHaveBeenCalledOnce()
    expect(service.playLatest).toHaveBeenCalledOnce()
    expect(service.playTake).toHaveBeenCalledExactlyOnceWith('Take 1', 0)
  })

  it('renames a clip from a JSON body', async () => {
    const service = makeService()
    server = await createStudioServer({ service, port: 0 })
    const response = await fetch(`${server.url}/actions/rename/2`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Twinkle' }),
    })
    expect(response.status).toBe(204)
    await vi.waitFor(() => {
      expect(service.renameTake).toHaveBeenCalledExactlyOnceWith('2', 'Twinkle')
    })
  })

  it('serves a clip mix through the lookup, and 404s otherwise', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-'))
    const file = path.join(dir, 'mix.flac')
    await fs.writeFile(file, Buffer.from('fLaC-not-really-but-bytes'))
    try {
      const service = makeService()
      server = await createStudioServer({
        service,
        port: 0,
        clipFile: (id) => Promise.resolve(id === '1' ? file : undefined),
      })
      const hit = await fetch(`${server.url}/clips/1.wav`)
      expect(hit.status).toBe(200)
      expect(hit.headers.get('content-type')).toBe('audio/flac')
      expect(hit.headers.get('content-length')).toBe('25')
      expect(Buffer.from(await hit.arrayBuffer()).toString()).toBe('fLaC-not-really-but-bytes')

      expect((await fetch(`${server.url}/clips/2.wav`)).status).toBe(404)
      expect((await fetch(`${server.url}/clips/%.wav`)).status).toBe(400) // bad encoding, no crash
      expect((await fetch(`${server.url}/clips/1.wav`)).status).toBe(200) // still alive
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('answers 404 when the mix file does not exist', async () => {
    const service = makeService()
    server = await createStudioServer({
      service,
      port: 0,
      clipFile: () => Promise.resolve(path.join(os.tmpdir(), 'no-such-clip-' + String(Date.now()) + '.wav')),
    })
    expect((await fetch(`${server.url}/clips/1.wav`)).status).toBe(404)
    expect((await fetch(`${server.url}/`)).status).toBe(200)
  })

  it.skipIf(!openFdCount())('closes the mix file when the client leaves before the stream starts', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-'))
    const file = path.join(dir, 'mix.wav')
    await fs.writeFile(file, Buffer.alloc(1024))
    try {
      const service = makeService()
      // the lookup answers only after the client has gone
      const clipFile = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve(file)
            }, 20)
          }),
      )
      server = await createStudioServer({ service, port: 0, clipFile })
      const before = openFdCount()
      for (let i = 0; i < 10; i += 1) {
        const request = http.get(`${server.url}/clips/1.wav`)
        request.on('error', () => undefined)
        await new Promise((resolve) => setTimeout(resolve, 5))
        request.destroy()
        await new Promise((resolve) => setTimeout(resolve, 40))
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(clipFile).toHaveBeenCalledTimes(10) // every request reached the file
      expect(openFdCount()).toBeLessThanOrEqual(before)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('finds a clip mix in the Outbox by project and clip number', async () => {
    const outbox = await fs.mkdtemp(path.join(os.tmpdir(), 'outbox-'))
    const dir = path.join(outbox, 'Piano Corner')
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, '20260921 - 0001 - clip.wav'), Buffer.from('RIFF....'))
    await fs.writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        clips: { '1': { number: 1, render: { mix: '20260921 - 0001 - clip.wav' } }, '2': { number: 2, render: null } },
      }),
    )
    try {
      const service = makeService()
      service.getState.mockReturnValue({
        ...idle,
        projectName: 'Piano: Corner',
        takes: [
          { id: 'r1', name: 'Clip 1', number: 1, label: '', start: 0, end: 10, duration: 10 },
          { id: 'r2', name: 'Clip 2', number: 2, label: '', start: 20, end: 30, duration: 10 },
        ],
      })
      server = await createStudioServer({ service, port: 0, outboxDir: outbox })
      const hit = await fetch(`${server.url}/clips/r1.wav`)
      expect(hit.status).toBe(200)
      expect(await hit.text()).toBe('RIFF....')
      expect((await fetch(`${server.url}/clips/r2.wav`)).status).toBe(404)
    } finally {
      await fs.rm(outbox, { recursive: true, force: true })
    }
  })

  it('refuses a mix path that is not a regular file', async () => {
    const service = makeService()
    server = await createStudioServer({ service, port: 0, clipFile: () => Promise.resolve(os.tmpdir()) })
    expect((await fetch(`${server.url}/clips/1.wav`)).status).toBe(404)
  })

  it('seeks within a clip from a JSON body, tolerating a bad one', async () => {
    const service = makeService()
    server = await createStudioServer({ service, port: 0 })
    const post = (body: string) =>
      fetch(`${server?.url ?? ''}/actions/seek/1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
    expect((await post('{"at": 4.5}')).status).toBe(204)
    expect((await post('{"at": "x"}')).status).toBe(204)
    await vi.waitFor(() => {
      expect(service.seekTake).toHaveBeenCalledTimes(2)
    })
    expect(service.seekTake).toHaveBeenNthCalledWith(1, '1', 4.5)
    expect(service.seekTake).toHaveBeenNthCalledWith(2, '1', 0)
  })

  it('starts a clip part-way in from the play-take body', async () => {
    const service = makeService()
    server = await createStudioServer({ service, port: 0 })
    await fetch(`${server.url}/actions/play-take/1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"at": 2}',
    })
    await vi.waitFor(() => {
      expect(service.playTake).toHaveBeenCalledWith('1', 2)
    })
  })

  it('serves the on-screen keyboard from its package', async () => {
    server = await createStudioServer({ service: makeService(), port: 0 })
    const script = await fetch(`${server.url}/vendor/simple-keyboard.js`)
    expect(script.headers.get('content-type')).toContain('javascript')
    expect(await script.text()).toContain('simple-keyboard')
    const css = await fetch(`${server.url}/vendor/simple-keyboard.css`)
    expect(css.headers.get('content-type')).toContain('text/css')
    const wave = await fetch(`${server.url}/vendor/wavesurfer.js`)
    expect(wave.headers.get('content-type')).toContain('javascript')
    expect(await wave.text()).toContain('WaveSurfer')
  })

  it('stops pushing after close', async () => {
    const service = makeService()
    server = await createStudioServer({ service, port: 0 })
    const events = await eventReader(`${server.url}/events`)
    await events.next()

    await server.close()
    server = undefined
    service.events.emit('change', idle)
    await expect(events.next()).rejects.toThrow(/stream ended/)
  })
})
