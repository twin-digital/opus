import { describe, expect, it } from 'vitest'

import { idleUntilSignal } from './main.js'

describe('idleUntilSignal', () => {
  it('stays pending (keeps the process alive) until a signal, then resolves', async () => {
    // Inject a test-only signal so we don't tear down the test runner.
    const p = idleUntilSignal(['SIGUSR2'])
    const race = await Promise.race([
      p.then(() => 'resolved'),
      new Promise((r) => {
        setTimeout(() => {
          r('pending')
        }, 25)
      }),
    ])
    expect(race).toBe('pending') // did not resolve on its own — the ref'd timer holds the loop open

    process.emit('SIGUSR2')
    await expect(p).resolves.toBeUndefined() // signal clears the timer and resolves → clean shutdown
  })
})
