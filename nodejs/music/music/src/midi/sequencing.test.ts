import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MidiDevice } from './midi-device.js'
import { MidiScheduler, type SequencedEvent } from './sequencing.js'

// the scheduler measures time via currentTimeMillis (performance.now in this environment)
const useFakeClock = () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
}

const noteon = (note: number, deltaTimeMs: number): SequencedEvent => ({
  deltaType: 'milliseconds',
  deltaTimeMs,
  event: 'noteon',
  data: { channel: 4, note, velocity: 96 },
})

const noteoff = (note: number, deltaTimeMs: number): SequencedEvent => ({
  deltaType: 'milliseconds',
  deltaTimeMs,
  event: 'noteoff',
  data: { channel: 4, note, velocity: 0 },
})

describe('MidiScheduler.cancelAllSequences', () => {
  let send: ReturnType<typeof vi.fn>
  let scheduler: MidiScheduler

  beforeEach(() => {
    useFakeClock()
    send = vi.fn()
    scheduler = new MidiScheduler({ send } as unknown as MidiDevice)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes pending noteoffs, drops other events, and skips completion callbacks', () => {
    const onComplete = vi.fn()
    scheduler.addSequence([noteon(60, 0), noteoff(60, 1000), noteon(64, 100), noteoff(64, 1000)], onComplete)

    // let the first noteon fire, leaving its noteoff (and a second note pair) pending
    vi.advanceTimersByTime(10)
    expect(send).toHaveBeenCalledWith('noteon', expect.objectContaining({ note: 60 }))

    send.mockClear()
    scheduler.cancelAllSequences()

    // pending noteoffs are sent immediately (nothing sticks); pending noteons are dropped
    expect(send).toHaveBeenCalledWith('noteoff', expect.objectContaining({ note: 60 }))
    expect(send).toHaveBeenCalledWith('noteoff', expect.objectContaining({ note: 64 }))
    expect(send).not.toHaveBeenCalledWith('noteon', expect.anything())

    // nothing fires later, and the sequence never "completes"
    send.mockClear()
    vi.advanceTimersByTime(10_000)
    expect(send).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('is a no-op when nothing is queued', () => {
    scheduler.cancelAllSequences()
    expect(send).not.toHaveBeenCalled()
  })
})
