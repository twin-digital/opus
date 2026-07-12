import { describe, expect, it } from 'vitest'

import { accessCodeSchema, smartLockSchema } from './schema.js'

/**
 * These tests pin the deliberate contract: fields the sync doesn't consume are stripped
 * on parse and any wire drift on them can't crash the sync. If we ever start consuming
 * `batteryLevel`, `isJammed`, `isCodeSet`, etc., add typed versions back — and these
 * tests will still document why they weren't there before.
 */

describe('smartLockSchema', () => {
  const drifted = {
    lockName: 'Dalton Door',
    // Wire shapes Lynx has emitted at various times for these unused fields — the parse
    // must not choke on any of them.
    connectivityStatus: 'ONLINE',
    batteryLevel: '62', // was number, now string on the wire
    isJammed: 2, // was 0|1, now something else
    provisionStatus: 'PROVISIONED', // was int status code, now string
    lockModelUniqueName: 'SCHLAGE_ENCODE',
    provisioningInfo: { totalCount: 1 },
    somethingLynxAddedLater: true,
  }

  it('accepts a drifted wire shape and strips every field except lockName', () => {
    const parsed = smartLockSchema.parse(drifted)
    expect(parsed).toEqual({ lockName: 'Dalton Door' })
  })

  it('rejects a payload without lockName — the one field we do consume', () => {
    expect(() => smartLockSchema.parse({ ...drifted, lockName: undefined })).toThrow()
  })
})

describe('accessCodeSchema', () => {
  const drifted = {
    lockName: 'Dalton Door',
    code: '9234',
    // Lynx's int-booleans are unmodeled — accepting any shape here means a future drift
    // (boolean instead of 0/1, string instead of int) doesn't block the sync.
    isCodeSet: '1',
    isHubCommunicated: true,
    syncToLockStatus: 'success',
    syncToCloudStatus: 'success',
  }

  it('accepts drifted int-boolean shapes on unused fields', () => {
    expect(accessCodeSchema.parse(drifted)).toEqual({
      lockName: 'Dalton Door',
      code: '9234',
      syncToLockStatus: 'success',
      syncToCloudStatus: 'success',
    })
  })

  it('still validates the fields we read — non-string syncToLockStatus is rejected', () => {
    expect(() => accessCodeSchema.parse({ ...drifted, syncToLockStatus: 1 })).toThrow()
  })
})
