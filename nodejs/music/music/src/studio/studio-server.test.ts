import { afterEach, describe, expect, it, vi } from 'vitest'

import { Events } from '../typed-event-emitter.js'
import { createStudioServer, type StudioServer } from './studio-server.js'
import type { StudioEventMap, StudioService, StudioState } from './studio-service.js'

const idle: StudioState = {
  connected: true,
  transport: 'stopped',
  recordingElapsed: 0,
  level: 0,
  takes: [{ id: '1', name: 'Take 1', number: 1, label: '', start: 0, end: 10, duration: 10 }],
  playingTake: undefined,
  instruments: undefined,
  projectName: undefined,
}

const makeService = () => {
  const events = new Events<StudioEventMap>()
  const service = {
    events,
    getState: vi.fn(() => idle),
    record: vi.fn(() => Promise.resolve()),
    stopTransport: vi.fn(() => Promise.resolve()),
    playLatest: vi.fn(() => Promise.resolve()),
    playTake: vi.fn((_id: string) => Promise.resolve()),
    renameTake: vi.fn((_id: string, _label: string) => Promise.resolve()),
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
    expect(service.playTake).toHaveBeenCalledExactlyOnceWith('Take 1')
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

  it('serves the on-screen keyboard from its package', async () => {
    server = await createStudioServer({ service: makeService(), port: 0 })
    const script = await fetch(`${server.url}/vendor/simple-keyboard.js`)
    expect(script.headers.get('content-type')).toContain('javascript')
    expect(await script.text()).toContain('simple-keyboard')
    const css = await fetch(`${server.url}/vendor/simple-keyboard.css`)
    expect(css.headers.get('content-type')).toContain('text/css')
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
