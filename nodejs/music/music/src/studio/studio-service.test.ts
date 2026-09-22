import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReaperClient } from './reaper-client.js'
import { StudioService, parseTakeName, sanitizeLabel } from './studio-service.js'

const POLL_MS = 100

interface FakeReaper {
  playState: number
  position: number
  regions: { id: string; name: string; start: number; end: number }[]
  peakDb: number
  offline: boolean
  projectName: string
  watcherHash: string
  requests: string[]
  /** When true, replies are captured at request time but delivered only by release(). */
  hold: boolean
  release: () => void
}

const makeFakeReaper = (overrides: Partial<FakeReaper> = {}) => {
  const reaper: FakeReaper = {
    playState: 0,
    position: 0,
    regions: [],
    peakDb: -150,
    offline: false,
    projectName: '',
    watcherHash: '',
    requests: [],
    hold: false,
    release: () => {
      const pending = held.splice(0)
      pending.forEach((deliver) => {
        deliver()
      })
    },
    ...overrides,
  }
  const held: (() => void)[] = []

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
      `TRACK\t1\tPiano\t0\t1\t0\t${reaper.peakDb * 10}\t${reaper.peakDb * 10}`,
      `PROJEXTSTATE\tStudio\tproject_name\t${reaper.projectName}`,
      `PROJEXTSTATE\tStudio\twatcher_hash\t${reaper.watcherHash}`,
      `PROJEXTSTATE\tStudio\twatcher_version\t1`,
    ]
    const reply = { ok: true, text: () => Promise.resolve(lines.join('\n')) }
    if (!reaper.hold) {
      return Promise.resolve(reply)
    }
    return new Promise<typeof reply>((resolve) => {
      held.push(() => {
        resolve(reply)
      })
    })
  }

  return { reaper, client: new ReaperClient({ fetch: fetchImpl }) }
}

const twoTakes = [
  { id: '1', name: 'Take 1', start: 0, end: 10 },
  { id: '2', name: 'Take 2', start: 12, end: 20 },
]

describe('parseTakeName', () => {
  it('splits watcher names into number and label, and keeps foreign names whole', () => {
    expect(parseTakeName('Clip 7 - Sep 21, 04:12 PM')).toEqual({ number: 7, label: 'Sep 21, 04:12 PM' })
    expect(parseTakeName('Take 3 - Twinkle')).toEqual({ number: 3, label: 'Twinkle' })
    expect(parseTakeName('Clip 9')).toEqual({ number: 9, label: '' })
    expect(parseTakeName('Twinkle (rough)')).toEqual({ number: undefined, label: 'Twinkle (rough)' })
  })
})

describe('sanitizeLabel', () => {
  it('strips separators and control characters, collapses space, and caps length', () => {
    expect(sanitizeLabel('  Twinkle / Little; Star\t\n ')).toBe('Twinkle Little Star')
    expect(sanitizeLabel('x'.repeat(60))).toHaveLength(40)
  })
})

describe('StudioService', () => {
  const services: StudioService[] = []

  const makeService = (overrides: Partial<FakeReaper> = {}, expectedHelperHash?: string) => {
    const { reaper, client } = makeFakeReaper(overrides)
    const service = new StudioService({ client, pollIntervalMs: POLL_MS, expectedHelperHash })
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

  it('orders takes by take number, so one recorded earlier on the timeline is still the latest', async () => {
    const { service } = makeService({
      regions: [
        { id: '1', name: 'Take 1 - Sep 21', start: 0, end: 10 }, // named by an earlier watcher
        { id: '2', name: 'Clip 2 - Sep 21', start: 100, end: 110 },
        { id: '3', name: 'Clip 3 - Sep 21', start: 50, end: 60 }, // recorded from REAPER with the cursor parked mid-timeline
        { id: '4', name: 'Twinkle (rough)', start: 200, end: 210 }, // renamed without the number: sorts last
      ],
    })
    await service.refresh()
    expect(service.getState().takes.map((take) => take.id)).toEqual(['3', '2', '1', '4'])
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

  it('seeks within the playing take without restarting, and starts it otherwise', async () => {
    const { reaper, service } = makeService({ regions: twoTakes })
    await service.refresh()

    await service.seekTake('1', 4)
    expect(reaper.requests).toContain('1016;SET/POS/4.000;1007') // not playing yet: starts there

    await service.seekTake('1', 7)
    expect(reaper.requests.at(-2)).toBe('SET/POS/7.000') // playing: a plain cursor move
    expect(reaper.playState).toBe(1)
    expect(service.getState().playingTake?.id).toBe('1')
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
    expect(service.getState().transport).toBe('playing')
  })

  it('resolves a command with a poll taken after it landed, even when a stale poll was in flight', async () => {
    const { reaper, service } = makeService({ regions: twoTakes })
    await service.refresh()

    reaper.hold = true
    const stalePoll = service.refresh() // answered from the stopped state, delivered later
    reaper.hold = false
    const recording = service.record()
    reaper.release()
    await Promise.all([stalePoll, recording])

    expect(service.getState().transport).toBe('recording')
    expect(reaper.requests.at(-1)).toMatch(/^TRANSPORT;REGION;TRACK/)
    expect(reaper.requests.at(-2)).toBe('1016;SET/POS/22.000;1013')
  })

  it('ignores a toggle press while the previous command is still settling', async () => {
    const { reaper, service } = makeService({ regions: twoTakes })
    await service.refresh()

    reaper.hold = true
    const first = service.toggleRecord()
    const second = service.toggleRecord()
    expect(service.busy).toBe(true)
    reaper.hold = false
    reaper.release()
    await Promise.all([first, second])

    expect(reaper.requests.filter((r) => r.endsWith('1013'))).toHaveLength(1)
    expect(reaper.requests).not.toContain('1016')
    expect(service.getState().transport).toBe('recording')
    expect(service.busy).toBe(false)

    await service.toggleRecord()
    expect(reaper.requests.at(-2)).toBe('1016')
  })

  it('does not auto-stop a newly started take because a stale poll passed its end', async () => {
    const { reaper, service } = makeService({ regions: twoTakes, playState: 1, position: 50 })
    await service.refresh()

    reaper.hold = true
    const stalePoll = service.refresh() // reports playing at 50, past take 1's end
    reaper.hold = false
    const play = service.playTake('1')
    reaper.release()
    await Promise.all([stalePoll, play])

    expect(reaper.requests.filter((r) => r === '1016')).toHaveLength(0)
    expect(reaper.playState).toBe(1)
    expect(service.getState().playingTake?.id).toBe('1')
  })

  it('clears the playing take when the play command fails', async () => {
    const { reaper, service } = makeService({ regions: twoTakes })
    await service.refresh()

    reaper.offline = true
    await service.playLatest()
    expect(service.getState().connected).toBe(false)
    expect(service.getState().playingTake).toBeUndefined()
  })

  it('runs a single poll chain after a quick stop() and start()', async () => {
    const { reaper, service } = makeService()
    service.start()
    await vi.advanceTimersByTimeAsync(0)

    reaper.hold = true
    await vi.advanceTimersByTimeAsync(POLL_MS) // a poll is now in flight
    service.stop()
    service.start()
    reaper.hold = false
    reaper.release()
    await vi.advanceTimersByTimeAsync(0)

    const before = reaper.requests.length
    await vi.advanceTimersByTimeAsync(POLL_MS * 10)
    expect(reaper.requests.length - before).toBeLessThanOrEqual(11)
  })

  it('asks the watcher to rename a clip through project ext state', async () => {
    const { reaper, service } = makeService({ regions: twoTakes })
    await service.refresh()

    await service.renameTake('2', '  Twinkle / Little; Star\n ')
    expect(reaper.requests.at(-2)).toBe('SET/PROJEXTSTATE/Studio/rename_2/Twinkle%20Little%20Star')

    const before = reaper.requests.length
    await service.renameTake('2', '   ')
    await service.renameTake('nope', 'x')
    expect(reaper.requests.length).toBe(before)
  })

  it('reports whether the running watcher is the bundled one', async () => {
    const { reaper, service } = makeService({}, 'abc')
    await service.refresh()
    expect(service.getState().helper).toBeUndefined()

    reaper.watcherHash = 'old'
    await service.refresh()
    expect(service.getState().helper).toEqual({ version: '1', hash: 'old', matches: false })

    await service.reloadHelper()
    expect(reaper.requests.at(-2)).toBe('SET/PROJEXTSTATE/Studio/reload/1')

    reaper.watcherHash = 'abc'
    await service.refresh()
    expect(service.getState().helper?.matches).toBe(true)
  })

  it('exposes the project name the watcher publishes', async () => {
    const { reaper, service } = makeService()
    await service.refresh()
    expect(service.getState().projectName).toBeUndefined()

    reaper.projectName = 'Piano Corner'
    await service.refresh()
    expect(service.getState().projectName).toBe('Piano Corner')
  })

  it('carries the current instrument selection for views', () => {
    const { service } = makeService()
    const change = vi.fn()
    service.events.on('change', change)

    service.setInstruments({ split: false, instrument: 'Church Organ' })
    expect(service.getState().instruments).toEqual({ split: false, instrument: 'Church Organ' })
    expect(change).toHaveBeenCalledOnce()

    service.setInstruments(undefined)
    expect(service.getState().instruments).toBeUndefined()
  })

  it('reports disconnection after a few misses and recovers', async () => {
    const { reaper, service } = makeService()
    await service.refresh()
    expect(service.getState().connected).toBe(true)

    // a couple of failed polls (REAPER busy rendering) keep the last good state
    reaper.offline = true
    await service.refresh()
    await service.refresh()
    expect(service.getState().connected).toBe(true)
    await service.refresh()
    expect(service.getState().connected).toBe(false)

    reaper.offline = false
    await service.refresh()
    expect(service.getState().connected).toBe(true)
  })
})
