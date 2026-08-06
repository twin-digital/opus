import { rm, writeFile } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { acquireAttachLock, AlreadyAttachedError, attachLockPath, holderIsAlive } from './attach-lock.js'

const PROJECT = 'attach-lock-under-test'

afterEach(async () => {
  await rm(attachLockPath(PROJECT), { force: true })
})

describe('the attach lock', () => {
  // d-wgzr4lvx — one attached run per workspace
  it('refuses a second attach and names the run that holds it', async () => {
    const first = await acquireAttachLock(PROJECT)

    await expect(acquireAttachLock(PROJECT)).rejects.toBeInstanceOf(AlreadyAttachedError)
    await expect(acquireAttachLock(PROJECT)).rejects.toThrow(String(process.pid))

    await first.release()
    await expect(acquireAttachLock(PROJECT)).resolves.toBeDefined()
  })

  it('takes the lock over a record left by a run that is gone', async () => {
    await acquireAttachLock(PROJECT)
    await writeFile(attachLockPath(PROJECT), JSON.stringify({ pid: 2 ** 30, since: 'yesterday' }), 'utf8')

    await expect(acquireAttachLock(PROJECT)).resolves.toBeDefined()
  })

  it('knows a live holder from a dead one', () => {
    expect(holderIsAlive({ pid: process.pid, since: 'now' })).toBe(true)
    expect(holderIsAlive({ pid: 2 ** 30, since: 'then' })).toBe(false)
  })
})
