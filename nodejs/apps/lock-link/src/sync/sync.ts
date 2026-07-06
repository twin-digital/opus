import { type LodgifyClient } from '../lodgify/client.js'
import { type Booking } from '../lodgify/schema.js'
import { type LynxClient } from '../lynx/client.js'
import { type Reservation, type SmartLock } from '../lynx/schema.js'
import { type NotifyEvent, type Notifier, type Severity } from './notify.js'
import { checkReadiness } from './readiness.js'
import { ConfirmationCodeError, resolveBookingId } from './resolve.js'

/**
 * The Lodgify-driven gap-fill loop. Drive from the official Lodgify API and touch the
 * unofficial Lynx API only when there are gaps to fill — so at steady state (no in-horizon
 * booking missing a code) Lynx is never called. For each gap we find the Lynx reservation
 * by the confirmationCode join, and push its code to Lodgify only once every lock reports
 * `success` (push-timing decision). A still-bare booking is escalated only once it's both
 * within the SLA window of arrival and past the grace period (so brand-new bookings aren't
 * flagged the instant they appear). The loop is stateless — the schedule is the retry.
 */

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

export interface SyncResult {
  readonly gaps: number
  readonly written: number
  readonly escalated: number
  readonly skipped: number
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
    return { gaps: 0, written: 0, escalated: 0, skipped: 0 }
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
  let written = 0
  let escalated = 0
  let skipped = 0
  for (const gap of gaps) {
    const entry = byBookingId.get(gap.id)

    if (!entry) {
      if (isOverdue(Date.parse(gap.arrival), gap.created_at, now, config)) {
        await notify({
          severity: severityFor(Date.parse(gap.arrival), now),
          reason: 'no Lynx reservation for booking',
          bookingId: gap.id,
        })
        escalated += 1
      } else {
        skipped += 1
      }
      continue
    }

    const readiness = checkReadiness(entry.reservation, lockSets.get(entry.propertyId) ?? [])
    if (readiness.ready && readiness.code !== undefined) {
      const code = readiness.code
      await lodgify.putKeyCodes(
        gap.id,
        roomsNeedingCode(gap).map((room) => ({ room_type_id: room.room_type_id, key_code: code })),
      )
      written += 1
      continue
    }

    const arrivalMs = entry.reservation.checkInTimestamp * 1000
    if (isOverdue(arrivalMs, gap.created_at, now, config)) {
      await notify(notReadyEvent(gap, entry.reservation, readiness.reasons, severityFor(arrivalMs, now)))
      escalated += 1
    } else {
      skipped += 1
    }
  }

  return { gaps: gaps.length, written, escalated, skipped }
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

const notReadyEvent = (
  gap: Booking,
  reservation: Reservation,
  reasons: readonly string[],
  severity: Severity,
): NotifyEvent => ({
  severity,
  reason: 'door code not ready before arrival',
  bookingId: gap.id,
  confirmationCode: reservation.confirmationCode,
  details: reasons,
})
