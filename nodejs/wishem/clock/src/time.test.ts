import { createHub } from '@thrashplay/wishem-hub'
import { describe, expect, it } from 'vitest'
import { TIME_ID, createTime, timeInputs, type TimeOptions, type TimePart } from './time.js'

const setup = (options?: TimeOptions) => {
  const hub = createHub({ subsystems: [createTime(options)] })
  const controls = hub.attach({ id: 'controls', kind: 'input' })
  hub.start()
  const part = () => hub.read()[TIME_ID] as TimePart
  return { hub, controls, part }
}

describe('createTime', () => {
  it('starts a new construct at time 0, running', () => {
    const { part } = setup()
    expect(part()).toEqual({ now: 0, ticks: 0, running: true })
  })

  it('starts in a pause when running is false', () => {
    const { part } = setup({ running: false })
    expect(part().running).toBe(false)
  })

  it('adds three ticks', async () => {
    const { controls, part } = setup()
    for (let i = 0; i < 3; i++) {
      expect(await controls.submit(timeInputs.advance(50))).toMatchObject({ ok: true })
    }
    expect(part()).toEqual({ now: 150, ticks: 3, running: true })
  })

  it('applies a tick during a pause', async () => {
    const { controls, part } = setup({ running: false })
    await controls.submit(timeInputs.advance(50))
    expect(part()).toEqual({ now: 50, ticks: 1, running: false })
  })

  it('refuses a length that is not correct', async () => {
    const { controls, part } = setup()
    const before = part()
    const payloads: unknown[] = [{ ms: 0 }, { ms: -5 }, { ms: '50' }, { ms: null }, { ms: Infinity }, {}, null]
    for (const payload of payloads) {
      const result = await controls.submit({ type: 'time/advance', payload })
      expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    }
    expect(part()).toBe(before)
  })

  it('pauses without a change to time and ticks', async () => {
    const { controls, part } = setup()
    await controls.submit(timeInputs.advance(50))
    await controls.submit(timeInputs.setRunning(false))
    expect(part()).toEqual({ now: 50, ticks: 1, running: false })
  })

  it('keeps the same part object for the same running value', async () => {
    const { controls, part } = setup()
    const before = part()
    await controls.submit(timeInputs.setRunning(true))
    expect(part()).toBe(before)
  })

  it('refuses a running value that is not a boolean', async () => {
    const { controls, part } = setup()
    const before = part()
    for (const payload of [{ running: 'yes' }, { running: 1 }, {}, null]) {
      const result = await controls.submit({ type: 'time/set-running', payload })
      expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    }
    expect(part()).toBe(before)
  })

  it('advances faster than real time with no clock', async () => {
    const { controls, part } = setup()
    for (let i = 0; i < 1000; i++) {
      await controls.submit(timeInputs.advance(50))
    }
    expect(part()).toEqual({ now: 50000, ticks: 1000, running: true })
  })
})

describe('timeInputs', () => {
  it('builds the inputs', () => {
    expect(timeInputs.advance(50)).toEqual({ type: 'time/advance', payload: { ms: 50 } })
    expect(timeInputs.setRunning(false)).toEqual({ type: 'time/set-running', payload: { running: false } })
  })
})
