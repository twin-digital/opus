import { describe, expect, it, vi } from 'vitest'

import type { MidiDevice } from '../../midi/midi-device.js'
import type { SamplePlayer } from '../../audio/sample-player.js'
import { LaunchpadController } from './controller.js'
import { toChannelId } from './model.js'

type NoteHandler = (note: { channel: number; note: number; velocity: number }) => void

interface StubHarness {
  device: MidiDevice
  samples: SamplePlayer
  /** handlers the controller registered on the device, keyed by event name */
  deviceHandlers: Map<string, NoteHandler[]>
  send: ReturnType<typeof vi.fn>
}

const makeStubs = (): StubHarness => {
  // Handler lists mirror EventEmitter semantics — the same listener registered twice fires twice — so tests can see
  // duplicate registrations that a keyed map would silently dedupe.
  const deviceHandlers = new Map<string, NoteHandler[]>()
  const send = vi.fn()
  return {
    device: {
      on: vi.fn((event: string, handler: NoteHandler) => {
        deviceHandlers.set(event, [...(deviceHandlers.get(event) ?? []), handler])
      }),
      off: vi.fn((event: string, handler: NoteHandler) => {
        const handlers = deviceHandlers.get(event) ?? []
        const index = handlers.indexOf(handler)
        if (index >= 0) {
          handlers.splice(index, 1)
        }
      }),
      send,
    } as unknown as MidiDevice,
    samples: {
      load: vi.fn(() => Promise.resolve()),
      play: vi.fn(),
      stopAll: vi.fn(),
      close: vi.fn(() => Promise.resolve()),
    } as unknown as SamplePlayer,
    deviceHandlers,
    send,
  }
}

/** MIDI channels backing controller channels 0 and 1 (see MidiChannels in controller.ts). */
const MidiChannelOfChannel0 = 3
const MidiChannelOfChannel1 = 4

const noteOnsSentTo = (send: ReturnType<typeof vi.fn>) =>
  send.mock.calls
    .filter(([type]) => type === 'noteon')
    .map(([, payload]) => payload as { channel: number; note: number })

const fire = (
  deviceHandlers: Map<string, NoteHandler[]>,
  event: 'noteon' | 'noteoff',
  note: { channel: number; note: number; velocity: number },
) => {
  ;[...(deviceHandlers.get(event) ?? [])].forEach((handler) => {
    handler(note)
  })
}

describe('LaunchpadController keyboard routing', () => {
  const setup = () => {
    const stubs = makeStubs()
    const controller = new LaunchpadController(stubs.device, stubs.samples, 2)
    controller.initialize()
    stubs.send.mockClear() // drop the initialize() stop-all-sound traffic
    return { ...stubs, controller }
  }

  it('routes every note to every channel by default', () => {
    const { deviceHandlers, send } = setup()

    fire(deviceHandlers, 'noteon', { channel: 0, note: 40, velocity: 64 })

    expect(noteOnsSentTo(send).map((payload) => payload.channel)).toEqual([
      MidiChannelOfChannel0,
      MidiChannelOfChannel1,
    ])
  })

  it('routes notes by key range once routes are set', () => {
    const { controller, deviceHandlers, send } = setup()
    controller.setRoutes([
      { channelId: toChannelId(0), range: { low: 0, high: 59 } },
      { channelId: toChannelId(1), range: { low: 60, high: 127 } },
    ])

    fire(deviceHandlers, 'noteon', { channel: 0, note: 59, velocity: 64 })
    fire(deviceHandlers, 'noteon', { channel: 0, note: 60, velocity: 64 })

    expect(noteOnsSentTo(send)).toEqual([
      expect.objectContaining({ note: 59, channel: MidiChannelOfChannel0 }),
      expect.objectContaining({ note: 60, channel: MidiChannelOfChannel1 }),
    ])
  })

  it('sends a note to an unrouted channel exactly zero times', () => {
    const { controller, deviceHandlers, send } = setup()
    controller.setRoutes([{ channelId: toChannelId(1) }])

    fire(deviceHandlers, 'noteon', { channel: 0, note: 40, velocity: 64 })

    expect(noteOnsSentTo(send).map((payload) => payload.channel)).toEqual([MidiChannelOfChannel1])
  })

  it('matches the whole keyboard when a route has no range', () => {
    const { controller, deviceHandlers, send } = setup()
    controller.setRoutes([{ channelId: toChannelId(0) }])

    fire(deviceHandlers, 'noteon', { channel: 0, note: 0, velocity: 64 })
    fire(deviceHandlers, 'noteon', { channel: 0, note: 127, velocity: 64 })

    expect(noteOnsSentTo(send)).toHaveLength(2)
  })

  it('plays a note at most once per channel when overlapping routes hit the same channel', () => {
    const { controller, deviceHandlers, send } = setup()
    controller.setRoutes([
      { channelId: toChannelId(0), range: { low: 0, high: 64 } },
      { channelId: toChannelId(0), range: { low: 60, high: 127 } },
    ])

    fire(deviceHandlers, 'noteon', { channel: 0, note: 62, velocity: 64 })

    expect(noteOnsSentTo(send)).toHaveLength(1)
  })

  it('routes note-offs through the same table', () => {
    const { controller, deviceHandlers, send } = setup()
    controller.setRoutes([
      { channelId: toChannelId(0), range: { low: 0, high: 59 } },
      { channelId: toChannelId(1), range: { low: 60, high: 127 } },
    ])

    fire(deviceHandlers, 'noteoff', { channel: 0, note: 59, velocity: 0 })

    const noteOffs = send.mock.calls.filter(([type]) => type === 'noteoff')
    expect(noteOffs).toHaveLength(1)
    expect(noteOffs[0][1]).toMatchObject({ note: 59, channel: MidiChannelOfChannel0 })
  })

  it('still honors mute on a routed channel, except for velocity-0 releases', () => {
    const { controller, deviceHandlers, send } = setup()
    controller.setRoutes([{ channelId: toChannelId(0), range: { low: 0, high: 59 } }])
    controller.setMuted(toChannelId(0), true)

    fire(deviceHandlers, 'noteon', { channel: 0, note: 40, velocity: 64 })
    expect(noteOnsSentTo(send)).toHaveLength(0)

    // a velocity-0 note-on is a key release: it bypasses mute and lands as a note-off
    fire(deviceHandlers, 'noteon', { channel: 0, note: 40, velocity: 0 })
    expect(send.mock.calls.filter(([type]) => type === 'noteoff')).toHaveLength(1)
  })

  it('re-initializing keeps each note listener registered exactly once', () => {
    const { controller, deviceHandlers, send } = setup()

    controller.initialize()
    send.mockClear()

    fire(deviceHandlers, 'noteon', { channel: 0, note: 40, velocity: 64 })

    // one note-on per routed channel — duplicated listeners would double every key press
    expect(noteOnsSentTo(send)).toHaveLength(2)
  })

  it('writes each channel level out during initialization, even though nothing changed', () => {
    const stubs = makeStubs()
    const controller = new LaunchpadController(stubs.device, stubs.samples, 2)

    controller.initialize()

    // the piano remembers the last CC 7 it was sent across program switches, so a fresh session must not assume it
    for (const channel of [MidiChannelOfChannel0, MidiChannelOfChannel1]) {
      expect(stubs.send.mock.calls).toEqual(
        expect.arrayContaining([['cc', expect.objectContaining({ channel, controller: 0x07, value: 127 })]]),
      )
    }
  })
})
