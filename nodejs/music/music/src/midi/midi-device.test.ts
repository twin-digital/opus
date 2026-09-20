import { afterEach, describe, expect, it, vi } from 'vitest'

import { MidiDevice } from './midi-device.js'

const mocks = vi.hoisted(() => {
  const ports = ['Piano', 'IAC Driver Bus 1']
  const outputs = new Map<string, { send: ReturnType<typeof vi.fn> }>()
  const enumerationClient = () => ({
    getPortCount: () => ports.length,
    getPortName: (i: number) => ports[i],
    destroy: () => undefined,
  })
  return {
    outputs,
    julusian: {
      Input: vi.fn(function () {
        return enumerationClient()
      }),
      Output: vi.fn(function () {
        return enumerationClient()
      }),
    },
    easymidi: {
      Input: vi.fn(function () {
        return { on: () => undefined, close: () => undefined }
      }),
      Output: vi.fn(function (name: string) {
        const output = { send: vi.fn(), close: () => undefined }
        outputs.set(name, output)
        return output
      }),
    },
  }
})

vi.mock('@julusian/midi', () => mocks.julusian)
vi.mock('easymidi', () => mocks.easymidi)

const connected = (device: MidiDevice) =>
  new Promise<void>((resolve) => {
    device.on('connected', resolve)
  })

describe('MidiDevice.mirrorTo', () => {
  const devices: MidiDevice[] = []

  afterEach(() => {
    devices.forEach((device) => {
      device.close()
    })
    devices.length = 0
    mocks.outputs.clear()
  })

  it('forwards every message it sends to the mirror, except Local Control', async () => {
    const piano = new MidiDevice({ name: 'Piano', pollIntervalMs: 10 })
    const mirror = new MidiDevice({ name: 'IAC Driver Bus 1', direction: 'output', pollIntervalMs: 10 })
    devices.push(piano, mirror)
    await Promise.all([connected(piano), connected(mirror)])
    piano.mirrorTo(mirror)

    piano.send('noteon', { channel: 3, note: 60, velocity: 100 })
    piano.send('program', { channel: 3, number: 5 })
    piano.send('cc', { channel: 3, controller: 122, value: 0 })

    const pianoOut = mocks.outputs.get('Piano')?.send
    const mirrorOut = mocks.outputs.get('IAC Driver Bus 1')?.send
    expect(pianoOut).toHaveBeenCalledTimes(3)
    expect(mirrorOut).toHaveBeenCalledTimes(2)
    expect(mirrorOut).toHaveBeenCalledWith('noteon', { channel: 3, note: 60, velocity: 100 })
    expect(mirrorOut).toHaveBeenCalledWith('program', { channel: 3, number: 5 })
  })
})
