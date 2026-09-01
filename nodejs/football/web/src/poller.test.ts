import { describe, expect, it } from 'vitest'

import { backoffDelayMs, DraftPoller } from './poller.js'

describe('backoffDelayMs', () => {
  it('doubles from the base and caps at 60s', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map((failures) => backoffDelayMs(failures))).toEqual([
      5000, 10000, 20000, 40000, 60000, 60000, 60000,
    ])
  })
})

describe('DraftPoller', () => {
  it('records failures without throwing and recovers on success', async () => {
    let fail = true
    const applied: number[] = []
    const poller = new DraftPoller({
      fetchDetail: () => (fail ? Promise.reject(new Error('espn down')) : Promise.resolve({})),
      apply: () => applied.push(1),
      log: () => undefined,
    })

    await poller.tick()
    await poller.tick()
    expect(poller.status.consecutiveFailures).toBe(2)
    expect(poller.status.lastError).toBe('espn down')
    expect(poller.status.lastSuccessAt).toBeNull()
    expect(poller.status.nextDelayMs).toBe(20000)

    fail = false
    await poller.tick()
    expect(applied).toHaveLength(1)
    expect(poller.status.consecutiveFailures).toBe(0)
    expect(poller.status.lastError).toBeNull()
    expect(poller.status.lastSuccessAt).not.toBeNull()
    expect(poller.status.nextDelayMs).toBe(5000)
  })

  it('counts an apply failure as a failed poll', async () => {
    const poller = new DraftPoller({
      fetchDetail: () => Promise.resolve({}),
      apply: () => {
        throw new Error('db locked')
      },
      log: () => undefined,
    })
    await poller.tick()
    expect(poller.status.consecutiveFailures).toBe(1)
    expect(poller.status.lastError).toBe('db locked')
  })

  it('skips ticks while paused without counting failures', async () => {
    let polls = 0
    const poller = new DraftPoller({
      fetchDetail: () => {
        polls += 1
        return Promise.resolve({})
      },
      apply: () => undefined,
      canPoll: () => false,
      log: () => undefined,
    })
    await poller.tick()
    expect(polls).toBe(0)
    expect(poller.status.consecutiveFailures).toBe(0)
    expect(poller.status.lastAttemptAt).toBeNull()
  })
})
