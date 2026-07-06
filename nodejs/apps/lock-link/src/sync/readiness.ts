import { type AccessCode, type Reservation, type SmartLock } from '../lynx/schema.js'

/**
 * Whether a reservation's access codes are safe to push to Lodgify. Lock provisioning is
 * eventually consistent, so "all locks set to one code" is a readiness *signal*, not an
 * always-true invariant. Ready means: every lock in the property's lock set is covered by
 * an access code, each `syncToLockStatus: "success"`, all the same code. The guest `code`
 * is assigned up front and uniform even while a lock is still `scheduled` — so a uniform
 * code is NOT the signal; `success` on every lock is. Never push a partial/unsynced code:
 * a code that opens some doors is worse than none.
 */

export interface ReadinessResult {
  readonly ready: boolean
  /** The uniform code to push — present only when `ready`. */
  readonly code?: string
  /** Why it isn't ready (empty when ready); feeds the escalation message. */
  readonly reasons: string[]
}

export const checkReadiness = (reservation: Reservation, lockSet: readonly SmartLock[]): ReadinessResult => {
  const codes: readonly AccessCode[] = reservation.accessCodes
  const reasons: string[] = []

  if (lockSet.length === 0) {
    reasons.push('property has no locks in its lock set')
  }
  if (codes.length === 0) {
    reasons.push('reservation has no access codes')
  }

  // Every lock in the set must be covered by an access code (matched by name).
  const coveredNames = new Set(codes.map((c) => c.lockName))
  for (const lock of lockSet) {
    if (!coveredNames.has(lock.lockName)) {
      reasons.push(`lock "${lock.lockName}" has no access code`)
    }
  }

  // Every access code must be live on its lock.
  for (const code of codes) {
    if (code.syncToLockStatus !== 'success') {
      reasons.push(`lock "${code.lockName}" is "${code.syncToLockStatus}", not "success"`)
    }
  }

  // All codes must agree (a divergent set means something is wrong upstream).
  const distinctCodes = new Set(codes.map((c) => c.code))
  if (distinctCodes.size > 1) {
    reasons.push(`access codes differ across locks: ${[...distinctCodes].join(', ')}`)
  }
  // Empty string is not a usable code. The gap filter treats `''` as a gap, so an
  // empty code would look like a gap again on the next tick — route to escalation.
  if (codes.some((c) => c.code === '')) {
    reasons.push('access code is empty')
  }

  const ready = reasons.length === 0
  return ready ? { ready, code: codes[0]?.code, reasons } : { ready, reasons }
}
