import { type Booking } from '../lodgify/schema.js'
import {
  type AccessCode,
  type Property,
  type Reservation,
  type ReservationType,
  type SmartLock,
} from '../lynx/schema.js'

/**
 * A single seed shared by both fakes. Lynx and Lodgify are independent systems joined
 * only by `confirmationCode`, so the fakes don't share mutable state — but their seed
 * data must agree (a Lodgify booking's gap is the same reservation Lynx has a code for).
 * `addReservation` declares that linkage once and writes consistent records to both
 * sides, so a test reads as one scenario rather than two hand-synced fixtures.
 *
 * The Lodgify slice (`bookings`) is mutated by `PUT keyCodes`; the Lynx slice is
 * read-only reference data.
 */

const DEFAULT_LOCK_NAMES = ['Dalton Door', '4th Street Lofts', 'Front Door']

interface ReservationSpec {
  /** Lodgify numeric booking id; also the leading run of `confirmationCode`. */
  readonly bookingId: number
  readonly propertyId?: number
  readonly roomTypeId?: number
  readonly guest?: { firstName?: string; lastName?: string; email?: string }
  readonly checkInTimestamp?: number
  readonly checkOutTimestamp?: number
  /** Lodgify booking creation time (unix seconds); defaults to 7 days before check-in. */
  readonly createdAtTimestamp?: number
  readonly bookingSource?: number
  /** The property's full lock set; defaults to the three real locks. */
  readonly lockNames?: readonly string[]
  /** Guest door code in Lynx. Omit to model a reservation with no code yet. */
  readonly code?: string
  /** `true` → `syncToLockStatus: success` (live); `false` → `scheduled` (pending). */
  readonly synced?: boolean
  /** Which locks already have an access code; defaults to the whole lock set. */
  readonly coveredLocks?: readonly string[]
  /** The Lodgify booking's current `key_code` (`''` = a gap to fill). */
  readonly lodgifyKeyCode?: string
  readonly type?: ReservationType
  readonly status?: Booking['status']
  /** Which Lodgify `stayFilter` bucket surfaces this booking. Defaults to `Upcoming`
   * (guest hasn't arrived); use `Current` to model a booking whose check-in-time has
   * already passed (guest checked in but not yet checked out). */
  readonly stayCategory?: LodgifyStayCategory
}

export type LodgifyStayCategory = 'Upcoming' | 'Current' | 'Historic'

/** A Lynx reservation tagged with the property + poll bucket it belongs to. */
interface SeededReservation {
  readonly propertyId: number
  readonly type: ReservationType
  readonly reservation: Reservation
}

interface RequestLog {
  readonly method: string
  readonly path: string
  /** The Lynx dashboard action (last path segment), when applicable. */
  readonly action?: string
  /** Query params as sent (Lodgify only for now); enables tests to assert
   * which `stayFilter` / pagination knobs a request carried. */
  readonly query?: URLSearchParams
}

export interface World {
  readonly accountId: number
  readonly credentials: { username: string; password: string }
  /** Bearer token the Lynx login issues and the other endpoints require. */
  readonly token: string
  /** Key the Lodgify fake requires in `X-ApiKey`. */
  readonly lodgifyApiKey: string
  readonly properties: Map<number, Property>
  readonly locksByProperty: Map<number, SmartLock[]>
  readonly reservations: SeededReservation[]
  readonly bookings: Map<number, Booking>
  /** The Lodgify `stayFilter` bucket each booking lives in. Bookings without an entry
   * default to `Upcoming` when the fake filters — matches the behavior tests seeded
   * before this map existed. */
  readonly stayCategoryByBookingId: Map<number, LodgifyStayCategory>
  readonly lynxRequests: RequestLog[]
  readonly lodgifyRequests: RequestLog[]
  addProperty: (spec: { propertyId: number; name?: string; lockNames?: readonly string[] }) => void
  addReservation: (spec: ReservationSpec) => void
}

const aLock = (lockName: string): SmartLock => ({
  lockName,
  connectivityStatus: 'ONLINE',
  batteryLevel: 90,
  isJammed: 0,
  provisionStatus: 1,
  lockModelUniqueName: 'SCHLAGE_ENCODE',
})

export const createWorld = (
  options: {
    readonly accountId?: number
    readonly credentials?: { username: string; password: string }
    readonly token?: string
    readonly lodgifyApiKey?: string
  } = {},
): World => {
  const accountId = options.accountId ?? 222262

  const world: World = {
    accountId,
    credentials: options.credentials ?? { username: 'lynx-user', password: 'lynx-pass' },
    token: options.token ?? 'fake-lynx-jwt',
    lodgifyApiKey: options.lodgifyApiKey ?? 'test-api-key',
    properties: new Map(),
    locksByProperty: new Map(),
    reservations: [],
    bookings: new Map(),
    stayCategoryByBookingId: new Map(),
    lynxRequests: [],
    lodgifyRequests: [],

    addProperty: ({ propertyId, name, lockNames = DEFAULT_LOCK_NAMES }) => {
      if (world.properties.has(propertyId)) {
        throw new Error(`world.addProperty: propertyId ${String(propertyId)} already exists`)
      }
      world.properties.set(propertyId, {
        uniquePropertyId: propertyId,
        name: name ?? `Property ${String(propertyId)}`,
        timeZone: 'America/Chicago',
        propertyStatus: 'ACTIVE',
      })
      world.locksByProperty.set(propertyId, lockNames.map(aLock))
    },

    addReservation: (spec) => {
      // One Lodgify booking per bookingId — real systems can't produce two, so tests
      // shouldn't silently model one either.
      if (world.bookings.has(spec.bookingId)) {
        throw new Error(`world.addReservation: duplicate bookingId ${String(spec.bookingId)}`)
      }

      const propertyId = spec.propertyId ?? 72230
      const roomTypeId = spec.roomTypeId ?? 501
      const lockNames = spec.lockNames ?? DEFAULT_LOCK_NAMES
      const checkInTimestamp = spec.checkInTimestamp ?? 1781557200
      const checkOutTimestamp = spec.checkOutTimestamp ?? 1781625600
      const createdAtTimestamp = spec.createdAtTimestamp ?? checkInTimestamp - 7 * 86400
      const synced = spec.synced ?? true
      const status = spec.status ?? 'Booked'

      if (world.properties.has(propertyId)) {
        // Locks are property-scoped in Lynx: a property's lock set is fixed. Reject a
        // reservation whose `lockNames` disagree with the property's existing set.
        const existing = (world.locksByProperty.get(propertyId) ?? []).map((l) => l.lockName).sort()
        const requested = [...lockNames].sort()
        if (existing.join('|') !== requested.join('|')) {
          throw new Error(
            `world.addReservation: property ${String(propertyId)} already has lock set [${existing.join(', ')}]; ` +
              `cannot add a reservation covering [${requested.join(', ')}]`,
          )
        }
      } else {
        world.addProperty({ propertyId, lockNames })
      }

      const covered = spec.coveredLocks ?? lockNames
      const accessCodes =
        spec.code === undefined || spec.type === 'past' ?
          []
        : covered.map(
            (lockName): AccessCode => ({
              lockName,
              code: spec.code ?? '',
              isCodeSet: synced ? 1 : 0,
              isHubCommunicated: 1,
              syncToLockStatus: synced ? 'success' : 'scheduled',
              syncToCloudStatus: 'success',
            }),
          )

      world.reservations.push({
        propertyId,
        type: spec.type ?? 'upcoming',
        reservation: {
          bookingId: 10_000_000 + spec.bookingId,
          confirmationCode: `${String(spec.bookingId)}VK${String(accountId)}`,
          guestFirstName: spec.guest?.firstName ?? 'Jordan',
          guestLastName: spec.guest?.lastName ?? 'Rivers',
          guestEmail: spec.guest?.email ?? `guest-${String(spec.bookingId)}@example.com`,
          checkInTimestamp,
          checkOutTimestamp,
          bookingSource: spec.bookingSource ?? 12,
          accessCodes,
        },
      })

      world.bookings.set(spec.bookingId, {
        id: spec.bookingId,
        property_id: propertyId,
        arrival: new Date(checkInTimestamp * 1000).toISOString(),
        departure: new Date(checkOutTimestamp * 1000).toISOString(),
        status,
        is_deleted: false,
        source: 'Expedia',
        source_text: null,
        created_at: new Date(createdAtTimestamp * 1000).toISOString(),
        guest: {
          name: `${spec.guest?.firstName ?? 'Jordan'} ${spec.guest?.lastName ?? 'Rivers'}`,
          email: spec.guest?.email ?? `guest-${String(spec.bookingId)}@example.com`,
        },
        rooms: [{ room_type_id: roomTypeId, key_code: spec.lodgifyKeyCode ?? '' }],
      })
      world.stayCategoryByBookingId.set(spec.bookingId, spec.stayCategory ?? 'Upcoming')
    },
  }

  return world
}
