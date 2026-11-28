import { createHub, hubInputs, type HubEvent, type Port } from '@thrashplay/wishem-hub'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startClock, type ClockOptions } from './clock.js'
import { TIME_ID, createTime, timeInputs, type TimePart } from './time.js'

/** A timer that the test calls, and a source of real time that the test sets. */
const setup = (options: ClockOptions & { running?: boolean } = {}) => {
  let callback: (() => void) | undefined
  let interval: number | undefined
  let stops = 0
  let time = 1_000_000
  const timer = {
    start: (cb: () => void, ms: number) => {
      callback = cb
      interval = ms
      return () => {
        stops += 1
      }
    },
  }
  const hub = createHub({ subsystems: [createTime({ running: options.running })] })
  const clockPort = hub.attach({ id: 'clock', kind: 'input' })
  const controls = hub.attach({ id: 'controls', kind: 'input' })
  hub.start()
  const clock = startClock(clockPort, { ...options, timer, now: () => time })
  return {
    hub,
    clock,
    controls,
    part: () => hub.read()[TIME_ID] as TimePart,
    /** Moves real time and calls the timer one time. */
    fire: (advanceMs: number) => {
      time += advanceMs
      if (!callback) {
        throw new Error('The timer did not start.')
      }
      callback()
    },
    wait: (advanceMs: number) => {
      time += advanceMs
    },
    interval: () => interval,
    stops: () => stops,
  }
}

describe('startClock', () => {
  it('starts the timer with the step length', () => {
    expect(setup().interval()).toBe(50)
    expect(setup({ stepMs: 100 }).interval()).toBe(100)
  })

  it('sends 20 ticks in one second at the default step length', () => {
    const { fire, part } = setup()
    for (let i = 0; i < 20; i++) {
      fire(50)
    }
    expect(part()).toMatchObject({ now: 1000, ticks: 20 })
  })

  it('sends 10 ticks in one second at a step length of 100', () => {
    const { fire, part } = setup({ stepMs: 100 })
    for (let i = 0; i < 10; i++) {
      fire(100)
      expect(part().ticks).toBe(i + 1)
    }
    expect(part()).toMatchObject({ now: 1000, ticks: 10 })
  })

  it('sends no tick before a full step length passes', () => {
    const { fire, part } = setup()
    fire(49)
    expect(part().ticks).toBe(0)
    fire(1)
    expect(part().ticks).toBe(1)
  })

  it('keeps the remainder of a step length between calls', () => {
    const { fire, part } = setup()
    fire(30)
    fire(30)
    expect(part().ticks).toBe(1)
    fire(40)
    expect(part().ticks).toBe(2)
  })

  it('sends no tick during a pause and none for the time of the pause', async () => {
    const { fire, wait, controls, part } = setup()
    await controls.submit(timeInputs.setRunning(false))
    fire(10_000)
    expect(part().ticks).toBe(0)
    await controls.submit(timeInputs.setRunning(true))
    fire(49)
    expect(part().ticks).toBe(0)
    wait(1)
    fire(0)
    expect(part().ticks).toBe(1)
  })

  it('measures from the moment of a resume when the timer did not run in the pause', async () => {
    const { fire, wait, controls, part } = setup()
    await controls.submit(timeInputs.setRunning(false))
    wait(10_000)
    await controls.submit(timeInputs.setRunning(true))
    fire(50)
    expect(part().ticks).toBe(1)
  })

  it('sends no late ticks after a rewind while the construct runs', async () => {
    const { fire, wait, controls, part } = setup()
    fire(50)
    wait(120)
    await controls.submit(hubInputs.rewind(0))
    fire(20)
    expect(part().ticks).toBe(0)
    fire(30)
    expect(part().ticks).toBe(1)
  })

  it('sends no tick after a rewind to a pause until running is true', async () => {
    const { fire, controls, part } = setup()
    await controls.submit(timeInputs.setRunning(false))
    await controls.submit(timeInputs.setRunning(true))
    fire(50)
    await controls.submit(hubInputs.rewind(1))
    expect(part().running).toBe(false)
    fire(10_000)
    expect(part().ticks).toBe(0)
    await controls.submit(timeInputs.setRunning(true))
    fire(50)
    expect(part().ticks).toBe(1)
  })

  it('does not start ticks of a construct that starts in a pause', () => {
    const { fire, part } = setup({ running: false })
    fire(500)
    expect(part().ticks).toBe(0)
  })

  it('sends three ticks after a short delay', () => {
    const { fire, part } = setup()
    fire(150)
    expect(part().ticks).toBe(3)
  })

  it('sends five ticks after a long delay and drops the rest', () => {
    const { fire, part } = setup()
    fire(10_000)
    expect(part().ticks).toBe(5)
    fire(50)
    expect(part().ticks).toBe(6)
  })

  it('drops the remainder of the time above the limit', () => {
    const { fire, part } = setup()
    fire(10_025)
    fire(25)
    expect(part().ticks).toBe(5)
  })

  it('keeps the remainder when the due ticks equal the limit', () => {
    const { fire, part } = setup({ maxTicksPerCall: 2 })
    fire(125)
    expect(part().ticks).toBe(2)
    fire(25)
    expect(part().ticks).toBe(3)
  })

  it('sends no tick when the part time is not an object, or running is not true', () => {
    for (const time of [null, undefined, {}, { running: 1 }, { running: 'true' }]) {
      const submit = vi.fn(() => Promise.resolve({ ok: true }))
      const port = {
        subsystem: { id: 'clock', kind: 'input' },
        read: () => ({ [TIME_ID]: time }),
        subscribe: () => () => undefined,
        submit,
      } as unknown as Port
      let callback: (() => void) | undefined
      let now = 0
      startClock(port, {
        timer: {
          start: (cb) => {
            callback = cb
            return () => undefined
          },
        },
        now: () => now,
      })
      now = 500
      expect(callback).toBeDefined()
      expect(() => callback?.()).not.toThrow()
      expect(submit).not.toHaveBeenCalled()
    }
  })

  it('raises no error in a listener when the hub starts after the clock', () => {
    const onError = vi.fn()
    const hub = createHub({ subsystems: [createTime()], onError })
    const clockPort = hub.attach({ id: 'clock', kind: 'input' })
    const clock = startClock(clockPort, { timer: { start: () => () => undefined }, now: () => 0 })
    hub.start()
    expect(onError).not.toHaveBeenCalled()
    clock.stop()
  })

  it('uses the option maxTicksPerCall', () => {
    const { fire, part } = setup({ maxTicksPerCall: 2 })
    fire(1000)
    expect(part().ticks).toBe(2)
  })

  it('stops when the hub stops', () => {
    const { hub, fire, part, stops } = setup()
    fire(50)
    hub.stop()
    expect(stops()).toBe(1)
    fire(500)
    expect(part().ticks).toBe(1)
  })

  it('stops when the code that started it calls stop', () => {
    const { clock, fire, part, stops } = setup()
    clock.stop()
    expect(stops()).toBe(1)
    fire(500)
    expect(part().ticks).toBe(0)
  })

  it('does nothing for a second stop', () => {
    const { clock, stops } = setup()
    clock.stop()
    clock.stop()
    expect(stops()).toBe(1)
  })

  it('removes its listener when it stops', () => {
    const remove = vi.fn()
    const port = {
      subsystem: { id: 'clock', kind: 'input' },
      read: () => ({ [TIME_ID]: { now: 0, ticks: 0, running: true } }),
      subscribe: () => remove,
    } as unknown as Port
    const clock = startClock(port, { timer: { start: () => () => undefined }, now: () => 0 })
    expect(remove).not.toHaveBeenCalled()
    clock.stop()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('sends no more ticks after a stop inside a listener of an applied event', () => {
    const { hub, clock, fire, part } = setup()
    const watcher = hub.attach({ id: 'watcher', kind: 'output' })
    watcher.subscribe((event) => {
      if (event.type === 'applied' && (watcher.read()[TIME_ID] as TimePart).ticks === 2) {
        clock.stop()
      }
    })
    fire(250)
    expect(part().ticks).toBe(2)
  })

  it('sends no more ticks after a pause inside a listener of an applied event', async () => {
    const { hub, fire, wait, controls, part } = setup()
    const pauser = hub.attach({ id: 'pauser', kind: 'input' })
    let paused = false
    pauser.subscribe((event) => {
      if (event.type === 'applied' && event.input.type === 'time/advance' && !paused) {
        paused = true
        void pauser.submit(timeInputs.setRunning(false))
      }
    })
    fire(150)
    expect(part()).toMatchObject({ ticks: 1, running: false })
    wait(10_000)
    await controls.submit(timeInputs.setRunning(true))
    fire(49)
    expect(part().ticks).toBe(1)
    fire(1)
    expect(part().ticks).toBe(2)
  })

  it('does not wait for a rejected tick, and the rejection is handled', async () => {
    let submits = 0
    const submit = () => {
      submits += 1
      return Promise.reject(new Error('rejected'))
    }
    const port = {
      subsystem: { id: 'clock', kind: 'input' },
      read: () => ({ [TIME_ID]: { now: 0, ticks: 0, running: true } }),
      subscribe: () => () => undefined,
      submit,
      close: () => undefined,
    } as unknown as Port
    let callback: (() => void) | undefined
    let time = 0
    startClock(port, {
      timer: {
        start: (cb) => {
          callback = cb
          return () => undefined
        },
      },
      now: () => time,
    })
    const unhandled: unknown[] = []
    const record = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', record)
    try {
      time = 100
      callback?.()
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(submits).toBe(2)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', record)
    }
  })

  it('throws for the port of an output subsystem', () => {
    const hub = createHub({ subsystems: [createTime()] })
    const screen = hub.attach({ id: 'screen', kind: 'output' })
    expect(() => startClock(screen)).toThrow(Error)
  })

  it('throws when the joined state has no part time', () => {
    const hub = createHub({ subsystems: [] })
    const clockPort = hub.attach({ id: 'clock', kind: 'input' })
    expect(() => startClock(clockPort)).toThrow(/time/)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '50' as unknown as number])(
    'throws for the option stepMs %s',
    (stepMs) => {
      const hub = createHub({ subsystems: [createTime()] })
      const clockPort = hub.attach({ id: 'clock', kind: 'input' })
      expect(() => startClock(clockPort, { stepMs })).toThrow(/stepMs/)
    },
  )

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'throws for the option maxTicksPerCall %s',
    (maxTicksPerCall) => {
      const hub = createHub({ subsystems: [createTime()] })
      const clockPort = hub.attach({ id: 'clock', kind: 'input' })
      expect(() => startClock(clockPort, { maxTicksPerCall })).toThrow(/maxTicksPerCall/)
    },
  )

  it('does not call the timer when an option is not correct', () => {
    const hub = createHub({ subsystems: [createTime()] })
    const clockPort = hub.attach({ id: 'clock', kind: 'input' })
    const start = vi.fn(() => () => undefined)
    expect(() => startClock(clockPort, { stepMs: 0, timer: { start } })).toThrow()
    expect(start).not.toHaveBeenCalled()
  })

  describe('with the default timer', () => {
    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('follows performance.now, not Date.now', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      let real = 5_000
      vi.spyOn(performance, 'now').mockImplementation(() => real)
      const hub = createHub({ subsystems: [createTime()] })
      const clockPort = hub.attach({ id: 'clock', kind: 'input' })
      hub.start()
      startClock(clockPort)
      real += 100
      vi.advanceTimersByTime(50)
      expect(hub.read()[TIME_ID]).toMatchObject({ ticks: 2 })
      hub.stop()
    })

    it('calls performance.now on the performance object', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      const receivers: unknown[] = []
      vi.spyOn(performance, 'now').mockImplementation(function (this: unknown) {
        receivers.push(this)
        return 0
      })
      const hub = createHub({ subsystems: [createTime()] })
      const clockPort = hub.attach({ id: 'clock', kind: 'input' })
      startClock(clockPort)
      expect(receivers.length).toBeGreaterThan(0)
      expect(receivers.every((receiver) => receiver === performance)).toBe(true)
    })

    it('uses setInterval and the fake real time', () => {
      vi.useFakeTimers()
      const hub = createHub({ subsystems: [createTime()] })
      const clockPort = hub.attach({ id: 'clock', kind: 'input' })
      hub.start()
      const events: HubEvent['type'][] = []
      clockPort.subscribe((event) => events.push(event.type))
      startClock(clockPort)
      vi.advanceTimersByTime(50)
      expect(hub.read()[TIME_ID]).toMatchObject({ now: 50, ticks: 1 })
      vi.advanceTimersByTime(950)
      expect(hub.read()[TIME_ID]).toMatchObject({ now: 1000, ticks: 20 })
      hub.stop()
      expect(vi.getTimerCount()).toBe(0)
      expect(events).toContain('stopping')
    })
  })
})

describe('startClock and the start of the hub', () => {
  /** A clock that the test starts, on a hub that the test starts. */
  const setupBeforeStart = () => {
    let callback: (() => void) | undefined
    let time = 1_000_000
    const hub = createHub({ subsystems: [createTime()] })
    const clockPort = hub.attach({ id: 'clock', kind: 'input' })
    const timer = {
      start: (cb: () => void) => {
        callback = cb
        return () => undefined
      },
    }
    return {
      hub,
      startClock: () => startClock(clockPort, { stepMs: 100, timer, now: () => time }),
      wait: (ms: number) => {
        time += ms
      },
      fire: (ms: number) => {
        time += ms
        callback?.()
      },
      ticks: () => (hub.read()[TIME_ID] as TimePart).ticks,
    }
  }

  it('measures from the start of the hub when the clock starts before the hub', () => {
    const { hub, startClock, wait, fire, ticks } = setupBeforeStart()
    startClock()
    wait(600)
    hub.start()
    fire(20)
    expect(ticks()).toBe(0)
    fire(80)
    expect(ticks()).toBe(1)
  })

  it('measures from its own start when the clock starts after the hub', () => {
    const { hub, startClock, wait, fire, ticks } = setupBeforeStart()
    hub.start()
    wait(600)
    startClock()
    fire(20)
    expect(ticks()).toBe(0)
    fire(80)
    expect(ticks()).toBe(1)
  })

  it('changes nothing and sends no tick for a started event after the clock stops', () => {
    const { hub, startClock, wait, fire, ticks } = setupBeforeStart()
    startClock().stop()
    wait(600)
    hub.start()
    fire(100)
    expect(ticks()).toBe(0)
    expect(hub.seq).toBe(0)
  })
})
