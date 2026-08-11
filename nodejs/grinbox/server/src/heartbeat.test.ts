import { describe, expect, it, vi } from 'vitest'
import { createHeartbeat, heartbeatCronPattern } from './heartbeat.js'

describe('heartbeatCronPattern', () => {
  it('uses a seconds step below a minute and a minutes step above', () => {
    expect(heartbeatCronPattern(15)).toBe('*/15 * * * * *')
    expect(heartbeatCronPattern(60)).toBe('0 */1 * * * *')
    expect(heartbeatCronPattern(600)).toBe('0 */10 * * * *')
  })

  it('falls back to hourly for a multi-hour beat', () => {
    expect(heartbeatCronPattern(7200)).toBe('0 0 * * * *')
  })
})

describe('the heartbeat', () => {
  it('runs every tick on one beat, in order', async () => {
    const seen: string[] = []
    const heartbeat = createHeartbeat({
      heartbeatSeconds: 60,
      ticks: [
        { name: 'poll', run: async () => void seen.push('poll') },
        { name: 'digest', run: async () => void seen.push('digest') },
        { name: 'pending-archive', run: async () => void seen.push('pending-archive') },
      ],
    })
    await heartbeat.beat()
    expect(seen).toEqual(['poll', 'digest', 'pending-archive'])
  })

  it('runs the ticks after one that throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const seen: string[] = []
    const heartbeat = createHeartbeat({
      heartbeatSeconds: 60,
      ticks: [
        {
          name: 'poll',
          run: () => Promise.reject(new Error('boom')),
        },
        { name: 'digest', run: async () => void seen.push('digest') },
      ],
    })
    await expect(heartbeat.beat()).resolves.toBeUndefined()
    expect(seen).toEqual(['digest'])
    vi.restoreAllMocks()
  })

  it('constructs a valid croner job across the configurable beat range', () => {
    for (const seconds of [15, 60, 600]) {
      const heartbeat = createHeartbeat({ heartbeatSeconds: seconds, ticks: [] })
      expect(() => {
        heartbeat.start()
      }).not.toThrow()
      expect(() => {
        heartbeat.stop()
      }).not.toThrow()
    }
  })
})
