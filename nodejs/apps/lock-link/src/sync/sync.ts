import { type LodgifyClient } from '../lodgify/client.js'
import { type Booking } from '../lodgify/schema.js'
import { type LynxClient } from '../lynx/client.js'
import { type Reservation, type SmartLock } from '../lynx/schema.js'
import { type Notifier, type Severity } from './notify.js'
import { checkReadiness } from './readiness.js'
import { ConfirmationCodeError, resolveBookingId } from './resolve.js'

/** The Lodgify-driven gap-fill loop. See `docs/architecture.md` for the design. */

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const CRITICAL_HOURS = 6

export interface SyncConfig {
  /** Lynx account id baked into every `confirmationCode` suffix. */
  readonly accountId: number
  /** Only fill gaps arriving within this many days (bounds Lynx work). */
  readonly horizonDays: number
  /** Escalate a still-bare booking once arrival is within this many hours. */
  readonly slaHours: number
  /** ...but not until the booking is at least this many minutes old. */
  readonly graceMinutes: number
}

export interface SyncDeps {
  readonly lynx: LynxClient
  readonly lodgify: LodgifyClient
  readonly notify: Notifier
  readonly config: SyncConfig
  /** Current time as epoch ms; injected so the run uses one consistent clock. */
  readonly now: number
}

export type OutcomeAction = 'written' | 'escalated' | 'skipped'

/** What happened to one identified gap during a run — the unit of per-run logging. */
export interface Outcome {
  readonly bookingId: number
  readonly action: OutcomeAction
  /** The Lynx confirmation code when a Lynx entry was found — the join key back. */
  readonly confirmationCode?: string
  /** For `written`: the code pushed to Lodgify. */
  readonly code?: string
  /** For `written`: the Lodgify room_type_ids that received the code. */
  readonly roomTypeIds?: readonly number[]
  /** For `skipped` / `escalated`: why. Multiple lines for multi-cause readiness misses. */
  readonly reasons?: readonly string[]
}

export interface SyncResult {
  readonly gaps: number
  readonly written: number
  readonly escalated: number
  readonly skipped: number
  readonly outcomes: readonly Outcome[]
}

/** Rooms still missing a code (empty string or null) — the per-room gap signal. */
const roomsNeedingCode = (booking: Booking) =>
  (booking.rooms ?? []).filter((room) => room.key_code === null || room.key_code === '')

export const runSync = async (deps: SyncDeps): Promise<SyncResult> => {
  const { lynx, lodgify, notify, config, now } = deps
  const horizonCutoff = now + config.horizonDays * DAY_MS

  // 1. Lodgify gap set: Booked, in-horizon, at least one room without a code.
  const bookings = await lodgify.listBookings({ stayFilter: 'Upcoming' })
  const gaps = bookings.items.filter((booking) => {
    if (booking.status !== 'Booked' || booking.is_deleted) {
      return false
    }
    const arrival = Date.parse(booking.arrival)
    const inHorizon = Number.isNaN(arrival) || arrival <= horizonCutoff
    return inHorizon && roomsNeedingCode(booking).length > 0
  })

  // 2. Steady state: no gaps → never touch Lynx.
  if (gaps.length === 0) {
    return { gaps: 0, written: 0, escalated: 0, skipped: 0, outcomes: [] }
  }

  // 3. Index Lynx reservations (upcoming + current) by the joined Lodgify booking id, and
  //    capture each property's lock set (the readiness denominator).
  const lockSets = new Map<number, SmartLock[]>()
  const byBookingId = new Map<number, { reservation: Reservation; propertyId: number }>()
  for (const property of await lynx.listProperties()) {
    if (property.propertyStatus !== 'ACTIVE') {
      continue
    }
    const propertyId = property.uniquePropertyId
    lockSets.set(propertyId, await lynx.listSmartLocks(propertyId))
    const upcoming = await lynx.listReservations(propertyId, 'upcoming')
    const current = await lynx.listReservations(propertyId, 'current')
    for (const reservation of [...upcoming, ...current]) {
      let bookingId: number
      try {
        bookingId = resolveBookingId(reservation.confirmationCode, config.accountId)
      } catch (error) {
        if (!(error instanceof ConfirmationCodeError)) {
          throw error
        }
        await notify({
          severity: 'warning',
          reason: 'Lynx confirmationCode did not parse',
          confirmationCode: reservation.confirmationCode,
          details: [error.message],
        })
        continue
      }
      const existing = byBookingId.get(bookingId)
      if (existing && existing.propertyId !== propertyId) {
        // Same Lodgify booking id resolved from two different properties — no legitimate
        // upstream state produces this. Escalate and keep the first entry.
        await notify({
          severity: 'warning',
          reason: 'Lynx bookingId resolved from multiple properties',
          bookingId,
          details: [
            `${existing.reservation.confirmationCode} on propertyId ${String(existing.propertyId)}`,
            `${reservation.confirmationCode} on propertyId ${String(propertyId)}`,
          ],
        })
        continue
      }
      // Within a property, `current` overwrites `upcoming` on purpose — the newer
      // lifecycle bucket has the more accurate provisioning state.
      byBookingId.set(bookingId, { reservation, propertyId })
    }
  }

  // 4. Resolve each gap: write when ready, escalate when overdue, else leave for next run.
  const outcomes: Outcome[] = []
  for (const gap of gaps) {
    const entry = byBookingId.get(gap.id)

    if (!entry) {
      const reason = 'no Lynx reservation for booking'
      const arrivalMs = Date.parse(gap.arrival)
      if (isOverdue(arrivalMs, gap.created_at, now, config)) {
        await notify({ severity: severityFor(arrivalMs, now), reason, bookingId: gap.id })
        outcomes.push({ bookingId: gap.id, action: 'escalated', reasons: [reason] })
      } else {
        outcomes.push({ bookingId: gap.id, action: 'skipped', reasons: [reason] })
      }
      continue
    }

    const readiness = checkReadiness(entry.reservation, lockSets.get(entry.propertyId) ?? [])
    if (readiness.ready && readiness.code !== undefined) {
      const code = readiness.code
      const rooms = roomsNeedingCode(gap).map((room) => ({ room_type_id: room.room_type_id, key_code: code }))
      await lodgify.putKeyCodes(gap.id, rooms)
      outcomes.push({
        bookingId: gap.id,
        action: 'written',
        confirmationCode: entry.reservation.confirmationCode,
        code,
        roomTypeIds: rooms.map((r) => r.room_type_id),
      })
      continue
    }

    const arrivalMs = entry.reservation.checkInTimestamp * 1000
    if (isOverdue(arrivalMs, gap.created_at, now, config)) {
      await notify({
        severity: severityFor(arrivalMs, now),
        reason: 'door code not ready before arrival',
        bookingId: gap.id,
        confirmationCode: entry.reservation.confirmationCode,
        details: readiness.reasons,
      })
      outcomes.push({
        bookingId: gap.id,
        action: 'escalated',
        confirmationCode: entry.reservation.confirmationCode,
        reasons: readiness.reasons,
      })
    } else {
      outcomes.push({
        bookingId: gap.id,
        action: 'skipped',
        confirmationCode: entry.reservation.confirmationCode,
        reasons: readiness.reasons,
      })
    }
  }

  // Single-pass count — easier to extend if a fourth action shows up.
  const counts = { written: 0, escalated: 0, skipped: 0 }
  for (const o of outcomes) {
    counts[o.action] += 1
  }
  return { gaps: gaps.length, ...counts, outcomes }
}

/** Overdue = within the SLA window of arrival AND past the grace period since booking. */
const isOverdue = (arrivalMs: number, createdAt: string, now: number, config: SyncConfig): boolean => {
  // An unparseable arrival is treated as overdue: a booking we can't even date belongs in
  // the escalation queue, not the silent-skip pile. Symmetric with the createdAt fallback
  // below (unparseable createdAt → Infinity age → grace check passes trivially).
  if (Number.isNaN(arrivalMs)) {
    return true
  }
  const hoursToArrival = (arrivalMs - now) / HOUR_MS
  const created = Date.parse(createdAt)
  const ageMinutes = Number.isNaN(created) ? Infinity : (now - created) / MINUTE_MS
  return hoursToArrival <= config.slaHours && ageMinutes >= config.graceMinutes
}

const severityFor = (arrivalMs: number, now: number): Severity =>
  (arrivalMs - now) / HOUR_MS <= CRITICAL_HOURS ? 'critical' : 'warning'
