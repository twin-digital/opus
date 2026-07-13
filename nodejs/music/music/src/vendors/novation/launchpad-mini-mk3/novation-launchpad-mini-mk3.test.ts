import type EventEmitter from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NovationLaunchpadMiniMk3 } from './novation-launchpad-mini-mk3.js'

// Neither native MIDI library can load (or should be exercised) in unit tests; the mocks keep
// the MidiDevice layer inert — no ports are ever enumerated, so no device is ever constructed.
vi.mock('@julusian/midi', () => {
  // regular function, not an arrow — these mocks are `new`-constructed
  function makeClient() {
    return {
      getPortCount: () => 0,
      getPortName: () => '',
      destroy: () => undefined,
    }
  }
  return { Input: vi.fn(makeClient), Output: vi.fn(makeClient) }
})
vi.mock('easymidi', () => ({ Input: vi.fn(), Output: vi.fn() }))

const getEvents = (launchpad: NovationLaunchpadMiniMk3) => (launchpad as unknown as { _events: EventEmitter })._events

describe('getFirmwareVersion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes its identity-response listener after a successful response', async () => {
    const launchpad = new NovationLaunchpadMiniMk3()
    const events = getEvents(launchpad)

    const version = launchpad.getFirmwareVersion()
    expect(events.listenerCount('identity-response')).toBe(1)

    events.emit('identity-response', { message: { version: [1, 2, 3] } })
    await expect(version).resolves.toBe(123)
    expect(events.listenerCount('identity-response')).toBe(0)
  })

  it('removes its identity-response listener after a timeout', async () => {
    const launchpad = new NovationLaunchpadMiniMk3()
    const events = getEvents(launchpad)

    const version = launchpad.getFirmwareVersion(50)
    const rejection = expect(version).rejects.toThrow('Timeout')
    vi.advanceTimersByTime(51)
    await rejection
    expect(events.listenerCount('identity-response')).toBe(0)
  })
})
