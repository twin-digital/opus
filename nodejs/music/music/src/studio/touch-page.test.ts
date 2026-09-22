// @vitest-environment jsdom
/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StudioState, Take } from './studio-service.js'
import { TouchPageHtml } from './touch-page.js'

/**
 * Runs the page's inline script against its own markup in jsdom, with the vendor libraries,
 * the event stream, and fetch stubbed, so the scrub and waveform-load lifecycles are pinned by
 * tests rather than by reading.
 */

const script = /<script>([\s\S]*)<\/script>/.exec(TouchPageHtml)?.[1] ?? ''
const markup = TouchPageHtml.replace(/^<!DOCTYPE html>\s*/i, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')

type Handler = (...args: unknown[]) => void
const $ = (id: string) => document.getElementById(id) as HTMLElement

/**
 * A WaveSurfer stand-in that records handlers and calls. Each load is a promise the test
 * settles: `ready()` resolves the latest, `fail()` rejects one (the latest by default).
 */
const makeWaveSurfer = () => {
  const handlers: Record<string, Handler[]> = {}
  const loads: { resolve: () => void; reject: (error: Error) => void }[] = []
  const instance = {
    on: vi.fn((event: string, handler: Handler) => {
      ;(handlers[event] ??= []).push(handler)
    }),
    load: vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          loads.push({ resolve, reject })
        }),
    ),
    getDuration: vi.fn(() => 30),
    setTime: vi.fn(),
    empty: vi.fn(),
  }
  const emit = (event: string, ...args: unknown[]) => {
    for (const handler of handlers[event] ?? []) {
      handler(...args)
    }
  }
  const ready = async () => {
    loads.at(-1)?.resolve()
    await vi.advanceTimersByTimeAsync(1)
  }
  const fail = async (error: Error, index = loads.length - 1) => {
    loads[index]?.reject(error)
    await vi.advanceTimersByTimeAsync(1)
  }
  return { instance, emit, ready, fail, create: vi.fn(() => instance) }
}

const take = (id: string, number: number, duration = 30): Take => ({
  id,
  name: `Clip ${String(number)}`,
  number,
  label: '',
  start: number * 100,
  end: number * 100 + duration,
  duration,
})

const idle: StudioState = {
  connected: true,
  transport: 'stopped',
  recordingElapsed: 0,
  level: 0,
  meters: [],
  position: 0,
  takes: [take('1', 1)],
  playingTake: undefined,
  instruments: undefined,
  projectName: 'Piano Corner',
  helper: undefined,
}

describe('touch page', () => {
  let ws: ReturnType<typeof makeWaveSurfer>
  let fetchMock: ReturnType<typeof vi.fn>
  let push: (state: StudioState) => void

  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.innerHTML = markup
    ws = makeWaveSurfer()
    fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    // the script's EventSource is captured so tests can push states through it
    const source: { onmessage?: (event: { data: string }) => void; onopen?: () => void } = {}
    Object.assign(window, {
      WaveSurfer: { create: ws.create },
      SimpleKeyboard: { default: vi.fn() },
      fetch: fetchMock,
      EventSource: function () {
        return source
      },
    })
    // Deliberate: the page's inline script must run as-is against the served markup.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    new Function(script)()
    source.onopen?.()
    push = (state) => {
      source.onmessage?.({ data: JSON.stringify(state) })
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Selects clip 2 by letting it appear as a newly finished recording. */
  const selectNewClip = () => {
    push(idle)
    push({ ...idle, takes: [take('2', 2), take('1', 1)] })
    vi.advanceTimersByTime(1)
  }

  it('loads the selected clip and seeks it with a scrub when stopped', async () => {
    selectNewClip()
    expect(ws.instance.load).toHaveBeenCalledWith('/clips/2.wav', undefined, 30)
    await ws.ready()

    ws.emit('click', 0.5)
    ws.emit('drag', 0.75)
    expect(ws.instance.setTime).toHaveBeenLastCalledWith(22.5)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(120)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('/actions/seek/2')
    expect(JSON.parse(init.body)).toEqual({ at: 22.5 })
  })

  it('holds the cursor where the finger left it until REAPER catches up', async () => {
    selectNewClip()
    await ws.ready()
    ws.emit('click', 0.5)
    vi.advanceTimersByTime(120)
    ws.instance.setTime.mockClear()

    const playing = {
      ...idle,
      takes: [take('2', 2), take('1', 1)],
      transport: 'playing' as const,
      playingTake: take('2', 2),
    }
    push({ ...playing, position: 3 }) // REAPER still reports the old position
    vi.advanceTimersByTime(1)
    expect(ws.instance.setTime).not.toHaveBeenCalled()
    push({ ...playing, position: 15.2 }) // near the target: REAPER drives the cursor again
    vi.advanceTimersByTime(1)
    expect(ws.instance.setTime.mock.lastCall?.[0]).toBeCloseTo(15.2)
  })

  it('follows REAPER again after a scrub whose clip vanished before it was sent', async () => {
    selectNewClip()
    await ws.ready()
    ws.emit('click', 0.5)
    push({ ...idle, takes: [take('1', 1)] }) // clip 2 removed from the project
    vi.advanceTimersByTime(120)
    expect(fetchMock).not.toHaveBeenCalled()

    push({ ...idle, transport: 'playing', playingTake: take('1', 1), position: 6 })
    vi.advanceTimersByTime(1)
    expect(ws.instance.load).toHaveBeenLastCalledWith('/clips/1.wav', undefined, 30)
    await ws.ready()
    push({ ...idle, transport: 'playing', playingTake: take('1', 1), position: 9 })
    vi.advanceTimersByTime(1)
    expect(ws.instance.setTime).toHaveBeenLastCalledWith(9)
  })

  it('retries a clip that could not be decoded, after a pause', async () => {
    selectNewClip()
    expect(ws.instance.load).toHaveBeenCalledTimes(1)
    await ws.fail(new Error('Unable to decode audio data'))
    expect(ws.instance.empty).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    push(idle)
    push({ ...idle, takes: [take('2', 2), take('1', 1)] })
    vi.advanceTimersByTime(1)
    expect(ws.instance.load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    push({ ...idle, takes: [take('2', 2), take('1', 1)] })
    vi.advanceTimersByTime(1)
    expect(ws.instance.load).toHaveBeenCalledTimes(2)
  })

  it('ignores the outcome of a load that a newer clip superseded', async () => {
    selectNewClip()
    push({ ...idle, transport: 'playing', playingTake: take('1', 1), takes: [take('2', 2), take('1', 1)] })
    vi.advanceTimersByTime(1)
    expect(ws.instance.load).toHaveBeenLastCalledWith('/clips/1.wav', undefined, 30)
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    await ws.fail(abort, 0) // the library aborts the older fetch
    // clip 1 is still the loaded clip; nothing was marked failed or reloaded
    expect(ws.instance.load).toHaveBeenCalledTimes(2)
    expect(ws.instance.empty).not.toHaveBeenCalled()
    await ws.ready()
    push({ ...idle, transport: 'playing', playingTake: take('1', 1), takes: [take('2', 2), take('1', 1)], position: 4 })
    vi.advanceTimersByTime(1)
    expect(ws.instance.setTime).toHaveBeenLastCalledWith(4)
    vi.advanceTimersByTime(5000)
    push({ ...idle, transport: 'playing', playingTake: take('1', 1), takes: [take('2', 2), take('1', 1)], position: 5 })
    vi.advanceTimersByTime(1)
    expect(ws.instance.load).toHaveBeenCalledTimes(2) // nothing was marked failed, so no reload
  })

  it('clears the stage of the previous waveform when the new clip has no mix yet', async () => {
    push({ ...idle, transport: 'playing', playingTake: take('1', 1) })
    vi.advanceTimersByTime(1)
    await ws.ready()
    push(idle)
    push({ ...idle, takes: [take('2', 2), take('1', 1)] })
    await vi.advanceTimersByTimeAsync(1)
    expect(ws.instance.load).toHaveBeenLastCalledWith('/clips/2.wav', undefined, 30)
    expect($('wave').classList.contains('loading')).toBe(true) // hidden while clip 2 loads
    await ws.fail(new Error('Failed to fetch audio: 404'))
    expect(ws.instance.empty).toHaveBeenCalled()
    expect($('progress').style.display).toBe('block') // the fallback stays until a mix loads
    expect($('wave').classList.contains('loading')).toBe(true)
  })

  it('shows the waveform once its clip is loaded', async () => {
    selectNewClip()
    expect($('wave').classList.contains('loading')).toBe(true)
    await ws.ready()
    expect($('wave').classList.contains('loading')).toBe(false)
  })

  it('releases the cursor hold on a short clip once REAPER is within a quarter second', async () => {
    push(idle)
    push({ ...idle, takes: [take('2', 2, 2), take('1', 1)] })
    vi.advanceTimersByTime(1)
    ws.instance.getDuration.mockReturnValue(2)
    await ws.ready()
    ws.emit('click', 0.5)
    vi.advanceTimersByTime(120)
    ws.instance.setTime.mockClear()
    // 1.2 s into a 2 s clip is 0.2 s from the target: close enough
    push({
      ...idle,
      takes: [take('2', 2, 2), take('1', 1)],
      transport: 'playing',
      playingTake: take('2', 2, 2),
      position: 1.2,
    })
    vi.advanceTimersByTime(1)
    expect(ws.instance.setTime.mock.lastCall?.[0]).toBeCloseTo(1.2)
  })
})
