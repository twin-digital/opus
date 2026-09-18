import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReaperClient } from './reaper-client.js'
import { StudioService } from './studio-service.js'

const POLL_MS = 100

interface FakeReaper {
  playState: number
  position: number
  regions: { id: string; name: string; start: number; end: number }[]
  peakDb: number
  offline: boolean
  requests: string[]
}

const makeFakeReaper = (overrides: Partial<FakeReaper> = {}) => {
  const reaper: FakeReaper = {
    playState: 0,
    position: 0,
    regions: [],
    peakDb: -150,
    offline: false,
    requests: [],
    ...overrides,
  }

  const fetchImpl = (url: string) => {
    if (reaper.offline) {
      return Promise.reject(new Error('connection refused'))
    }
    const command = url.slice(url.indexOf('/_/') + 3)
    reaper.requests.push(command)
    // transport actions take effect immediately, as in REAPER
    for (const part of command.split(';')) {
      if (part === '1016') {
        reaper.playState = 0
      }
      if (part === '1007') {
        reaper.playState = 1
      }
      if (part === '1013') {
        reaper.playState = 5
      }
      if (part.startsWith('SET/POS/')) {
        reaper.position = Number(part.slice('SET/POS/'.length))
      }
    }
    const lines = [
      `TRANSPORT\t${reaper.playState}\t${reaper.position}\t0\t0\t0`,
      ...reaper.regions.map((r) => `REGION\t${r.name}\t${r.id}\t${r.start}\t${r.end}\t0`),
      `TRACK\t1\tPiano\t0\t1\t0\t${reaper.peakDb}\t${reaper.peakDb}`,
    ]
    return Promise.resolve({ ok: true, text: () => Promise.resolve(lines.join('\n')) })
  }

  return { reaper, client: new ReaperClient({ fetch: fetchImpl }) }
}

const twoTakes = [
  { id: '1', name: 'Take 1', start: 0, end: 10 },
  { id: '2', name: 'Take 2', start: 12, end: 20 },
]

describe('StudioService', () => {
  const services: StudioService[] = []

  const makeService = (overrides: Partial<FakeReaper> = {}) => {
    const { reaper, client } = makeFakeReaper(overrides)
    const service = new StudioService({ client, pollIntervalMs: POLL_MS })
    services.push(service)
    return { reaper, service }
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    while (services.length > 0) {
      services.pop()?.stop()
    }
    vi.useRealTimers()
  })

  it('lists takes newest first with durations', async () => {
    const { service } = makeService({ regions: twoTakes })
    await service.refresh()

    expect(service.getState().connected).toBe(true)
    expect(service.getState().takes.map((take) => take.name)).toEqual(['Take 2', 'Take 1'])
    expect(service.getState().takes[0]?.duration).toBe(8)
  })

  it('records after the last take, or at the project end when there are none', async () => {
    const empty = makeService()
    await empty.service.refresh()
    await empty.service.record()
    expect(empty.reaper.requests.at(-2)).toBe('1016;40043;1013')

    const withTakes = makeService({ regions: twoTakes })
    await withTakes.service.refresh()
    await withTakes.service.record()
    expect(withTakes.reaper.requests.at(-2)).toBe('1016;SET/POS/22.000;1013')
  })

  it('tracks elapsed recording time from where recording started', async () => {
    const { reaper, service } = makeService({ playState: 5, position: 30 })
    await service.refresh()
    reaper.position = 34.5
    await service.refresh()

    expect(service.getState().transport).toBe('recording')
    expect(service.getState().recordingElapsed).toBe(4.5)

    reaper.playState = 0
    await service.refresh()
    expect(service.getState().recordingElapsed).toBe(0)
  })

  it('plays a take from its start and stops when its end is reached', async () => {
    const { reaper, service } = makeService({ regions: twoTakes })
    await service.refresh()

    await service.playTake('1')
    expect(reaper.requests).toContain('1016;SET/POS/0.000;1007')

    reaper.position = 5
    await service.refresh()
    expect(service.getState().playingTake?.id).toBe('1')

    reaper.position = 10
    await service.refresh()
    expect(reaper.requests.at(-1)).toBe('1016')
    expect(service.getState().playingTake).toBeUndefined()
  })

  it('forgets the playing take when REAPER is stopped from elsewhere', async () => {
    const { reaper, service } = makeService({ regions: twoTakes, playState: 1 })
    await service.refresh()
    await service.playLatest()
    expect(service.getState().playingTake?.id).toBe('2')

    reaper.playState = 0
    await service.refresh()
    expect(service.getState().playingTake).toBeUndefined()
  })

  it('toggles record and play for single-button surfaces', async () => {
    const { reaper, service } = makeService({ regions: twoTakes })
    await service.refresh()

    await service.toggleRecord()
    expect(reaper.requests.at(-2)).toBe('1016;SET/POS/22.000;1013')

    await service.toggleRecord()
    expect(reaper.requests.at(-2)).toBe('1016')

    await service.togglePlayLatest()
    expect(reaper.requests.at(-2)).toBe('1016;SET/POS/12.000;1007')
  })

  it('maps peaks to a 0..1 level only while the transport is moving', async () => {
    const { reaper, service } = makeService({ playState: 1, peakDb: -30 })
    await service.refresh()
    expect(service.getState().level).toBeCloseTo(0.5)

    reaper.playState = 0
    await service.refresh()
    expect(service.getState().level).toBe(0)
  })

  it('polls on an interval and emits change events', async () => {
    const { reaper, service } = makeService()
    const change = vi.fn()
    service.events.on('change', change)

    service.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(service.getState().connected).toBe(true)

    reaper.playState = 1
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(service.getState().transport).toBe('playing')
    expect(change).toHaveBeenCalled()

    service.stop()
    reaper.playState = 0
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(service.getState().transport).toBe('playing')
  })

  it('keeps the playing take when a poll started before the play command resolves late', async () => {
    const { reaper, service } = makeService({ regions: twoTakes })
    await service.refresh()

    // a poll is in flight, then playback starts before it resolves
    const stalePoll = service.refresh()
    await service.playTake('2')
    await stalePoll

    expect(reaper.playState).toBe(1)
    expect(service.getState().playingTake?.id).toBe('2')
  })

  it('reports disconnection and recovers', async () => {
    const { reaper, service } = makeService()
    await service.refresh()
    expect(service.getState().connected).toBe(true)

    reaper.offline = true
    await service.refresh()
    expect(service.getState().connected).toBe(false)

    reaper.offline = false
    await service.refresh()
    expect(service.getState().connected).toBe(true)
  })
})
