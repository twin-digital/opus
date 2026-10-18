import { afterEach, describe, expect, it } from 'vitest'

import { configuredOutputDevice, resolveOutputSinkId } from './output-device.js'

const devices = [
  { kind: 'audioinput', label: 'BlackHole 2ch', deviceId: 'in-1' },
  { kind: 'audiooutput', label: 'MacBook Pro Speakers', deviceId: 'out-1' },
  { kind: 'audiooutput', label: 'BlackHole 2ch', deviceId: 'out-2' },
]
const mediaDevices = { enumerateDevices: () => Promise.resolve(devices) }

describe('resolveOutputSinkId', () => {
  it('matches an output device by label substring, ignoring case and inputs', async () => {
    await expect(resolveOutputSinkId(mediaDevices, 'blackhole')).resolves.toBe('out-2')
  })

  it('is undefined when no output matches', async () => {
    await expect(resolveOutputSinkId(mediaDevices, 'Scarlett')).resolves.toBeUndefined()
  })
})

describe('configuredOutputDevice', () => {
  const original = process.env.MUSIC_SAMPLE_OUTPUT

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MUSIC_SAMPLE_OUTPUT
    } else {
      process.env.MUSIC_SAMPLE_OUTPUT = original
    }
  })

  it('reads MUSIC_SAMPLE_OUTPUT and treats blank as unset', () => {
    process.env.MUSIC_SAMPLE_OUTPUT = ' BlackHole '
    expect(configuredOutputDevice()).toBe('BlackHole')
    process.env.MUSIC_SAMPLE_OUTPUT = ''
    expect(configuredOutputDevice()).toBeUndefined()
  })
})
