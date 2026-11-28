import { InputRefusedError, createHub, hubInputs } from '@thrashplay/wishem-hub'
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

  it('has the part name time', () => {
    const { hub } = setup()
    expect(Object.keys(hub.read())).toEqual(['time'])
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
    const payloads: unknown[] = [{ ms: 0 }, { ms: -5 }, { ms: '50' }, { ms: null }, { ms: true }, {}, null]
    for (const payload of payloads) {
      const result = await controls.submit({ type: 'time/advance', payload })
      expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    }
    expect(part()).toBe(before)
  })

  it('refuses a length that is not finite', () => {
    const subsystem = createTime()
    const part = { now: 0, ticks: 0, running: true }
    for (const ms of [Infinity, -Infinity, Number.NaN, '50']) {
      const input = { seq: 1, source: 'test', type: 'time/advance', payload: { ms } }
      expect(() => subsystem.apply(part, input, { read: () => ({}) })).toThrow(InputRefusedError)
    }
  })

  it('applies a tick of a length that is larger than 0 and less than 1', async () => {
    const { controls, part } = setup()
    await controls.submit(timeInputs.advance(0.5))
    await controls.submit(timeInputs.advance(1))
    expect(part()).toEqual({ now: 1.5, ticks: 2, running: true })
  })

  it('refuses a payload that is not an object', async () => {
    const { controls, part } = setup()
    const before = part()
    for (const payload of [undefined, 'text', 5, true]) {
      for (const type of ['time/advance', 'time/set-running']) {
        expect(await controls.submit({ type, payload })).toMatchObject({ ok: false, reason: 'invalid' })
      }
    }
    expect(part()).toBe(before)
    const subsystem = createTime()
    const initial = { now: 0, ticks: 0, running: true }
    for (const type of ['time/advance', 'time/set-running']) {
      const input = { seq: 1, source: 'test', type, payload: undefined }
      expect(() => subsystem.apply(initial, input, { read: () => ({}) })).toThrow(InputRefusedError)
    }
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

describe('createTime with a step length', () => {
  it('holds the step length of the first part', () => {
    const { part } = setup({ stepMs: 500 })
    expect(part()).toEqual({ now: 0, ticks: 0, running: true, stepMs: 500 })
  })

  it('keeps the step length through three ticks and a pause', async () => {
    const { controls, part } = setup({ stepMs: 500 })
    for (let i = 0; i < 3; i++) {
      await controls.submit(timeInputs.advance(500))
    }
    await controls.submit(timeInputs.setRunning(false))
    expect(part()).toEqual({ now: 1500, ticks: 3, running: false, stepMs: 500 })
  })

  it('keeps the step length through a rewind', async () => {
    const { controls, part } = setup({ stepMs: 50 })
    for (let i = 0; i < 5; i++) {
      await controls.submit(timeInputs.advance(50))
    }
    await controls.submit(hubInputs.rewind(2))
    expect(part()).toMatchObject({ ticks: 2, stepMs: 50 })
  })

  it('gives a part with no key stepMs when there is no option', () => {
    const { part } = setup()
    expect(Object.hasOwn(part(), 'stepMs')).toBe(false)
    expect(Object.hasOwn(setup({ running: false }).part(), 'stepMs')).toBe(false)
  })

  it('throws a RangeError for a step length that is not correct', () => {
    for (const stepMs of [0, -1, Number.NaN, Infinity, '50' as unknown as number]) {
      expect(() => createTime({ stepMs })).toThrow(RangeError)
      expect(() => createTime({ stepMs })).toThrow('The step length must be a finite number larger than 0.')
    }
  })
})

describe('timeInputs', () => {
  it('builds the inputs', () => {
    expect(timeInputs.advance(50)).toEqual({ type: 'time/advance', payload: { ms: 50 } })
    expect(timeInputs.setRunning(false)).toEqual({ type: 'time/set-running', payload: { running: false } })
  })
})
