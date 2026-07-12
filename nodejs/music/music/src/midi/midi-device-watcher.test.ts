import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MidiDeviceWatcher } from './midi-device-watcher.js'

const midiMock = vi.hoisted(() => {
  const state = {
    inputPorts: [] as string[],
    outputPorts: [] as string[],
    failEnumeration: false,
  }

  const makeClient = (ports: () => string[]) => ({
    getPortCount: () => {
      if (state.failEnumeration) {
        throw new Error('MIDI backend unavailable')
      }
      return ports().length
    },
    getPortName: (port: number) => ports()[port],
    destroy: () => undefined,
  })

  return {
    state,
    // constructor-style mocks: `new Input()` yields the returned client (the implementations
    // must be regular functions — arrows aren't constructable), and construction counts come
    // from the mocks themselves
    Input: vi.fn(function () {
      return makeClient(() => state.inputPorts)
    }),
    Output: vi.fn(function () {
      return makeClient(() => state.outputPorts)
    }),
  }
})

vi.mock('@julusian/midi', () => ({ Input: midiMock.Input, Output: midiMock.Output }))

const POLL_MS = 100
const { state } = midiMock

describe('MidiDeviceWatcher', () => {
  const watchers: MidiDeviceWatcher[] = []

  const makeWatcher = (options: ConstructorParameters<typeof MidiDeviceWatcher>[0] = {}) => {
    const watcher = new MidiDeviceWatcher({ pollIntervalMs: POLL_MS, ...options })
    watchers.push(watcher)
    return watcher
  }

  beforeEach(() => {
    vi.useFakeTimers()
    state.inputPorts = []
    state.outputPorts = []
    state.failEnumeration = false
  })

  afterEach(() => {
    while (watchers.length > 0) {
      watchers.pop()?.stop()
    }
    vi.useRealTimers()
  })

  // This is the property the leak fix exists to establish: enumeration must NOT construct
  // native clients per poll (each construction pins a native MIDI client forever — the
  // original OOM). This test must run first in the file, before any other test triggers the
  // lazily-created module-level client pair.
  it('constructs the native enumeration clients at most once, ever', () => {
    const first = makeWatcher()
    first.start()
    vi.advanceTimersByTime(POLL_MS * 20)

    const second = makeWatcher()
    second.start()
    vi.advanceTimersByTime(POLL_MS * 20)

    expect(midiMock.Input).toHaveBeenCalledTimes(1)
    expect(midiMock.Output).toHaveBeenCalledTimes(1)
  })

  it('emits found/lost transitions for watched devices only', () => {
    const found = vi.fn()
    const lost = vi.fn()
    const watcher = makeWatcher({ devicesToWatch: ['Piano'] })
    watcher.on('found', found).on('lost', lost)

    watcher.start()
    expect(found).not.toHaveBeenCalled()

    state.inputPorts = ['Piano', 'Other Device']
    vi.advanceTimersByTime(POLL_MS)
    expect(found).toHaveBeenCalledExactlyOnceWith('Piano')

    state.inputPorts = ['Other Device']
    vi.advanceTimersByTime(POLL_MS)
    expect(lost).toHaveBeenCalledExactlyOnceWith('Piano')
  })

  it('reports every device when no filter is given', () => {
    const found = vi.fn()
    const watcher = makeWatcher()
    watcher.on('found', found)

    state.inputPorts = ['Piano']
    state.outputPorts = ['Launchpad']
    watcher.start()

    expect(found).toHaveBeenCalledTimes(2)
    expect(found).toHaveBeenCalledWith('Piano')
    expect(found).toHaveBeenCalledWith('Launchpad')
  })

  it('ignores start() while already running and stops cleanly', () => {
    const found = vi.fn()
    const watcher = makeWatcher()
    watcher.on('found', found)

    watcher.start()
    watcher.start()

    state.inputPorts = ['Piano']
    vi.advanceTimersByTime(POLL_MS)
    expect(found).toHaveBeenCalledTimes(1)

    watcher.stop()
    state.inputPorts = []
    vi.advanceTimersByTime(POLL_MS * 5)
    expect(found).toHaveBeenCalledTimes(1)
  })

  it('halts polling when stop() is called from a listener', () => {
    const lost = vi.fn()
    const watcher = makeWatcher()
    watcher.on('found', () => {
      watcher.stop()
    })
    watcher.on('lost', lost)

    state.inputPorts = ['Piano']
    watcher.start()

    state.inputPorts = []
    vi.advanceTimersByTime(POLL_MS * 5)
    expect(lost).not.toHaveBeenCalled()
  })

  it('survives enumeration errors and resumes on the next poll', () => {
    const found = vi.fn()
    const watcher = makeWatcher()
    watcher.on('found', found)

    state.failEnumeration = true
    watcher.start()
    vi.advanceTimersByTime(POLL_MS)

    state.failEnumeration = false
    state.inputPorts = ['Piano']
    vi.advanceTimersByTime(POLL_MS)
    expect(found).toHaveBeenCalledExactlyOnceWith('Piano')
  })
})
