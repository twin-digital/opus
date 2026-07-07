import { z } from 'zod'

/**
 * Lynx (reverse-engineered private API) response contracts — the source side of the
 * sync. Same role as the Lodgify schema: one source of truth shared by the runtime
 * client, the test fake, and the canary. Only the fields the sync reads are modeled;
 * unknown fields are stripped on parse, so a parse failure is a real "shape changed"
 * signal rather than noise from Lynx adding a field.
 *
 * Every Lynx dashboard call wraps its payload in the same envelope, so responses are
 * `lynxEnvelope(dataSchema)`.
 */

const lynxEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({
    status: z.boolean(),
    errorCodeId: z.number().int(),
    errorMessage: z.string(),
    data,
    paginationInfo: z.object({
      perPage: z.number().int(),
      totalPages: z.number().int(),
      page: z.number().int(),
      total: z.number().int(),
    }),
  })

/**
 * Per-lock guest code on a reservation. `code` is assigned up front and uniform across
 * locks even while a lock is still `scheduled` — so readiness keys off
 * `syncToLockStatus: "success"`, not the code being present.
 *
 * Only fields the sync actually reads are modeled. Lynx also emits
 * `isCodeSet` / `isHubCommunicated` as int-booleans; not modeled because unused fields
 * with strict types are a maintenance burden without buying validation value (see
 * commit message for the batteryLevel/isJammed drift that triggered this cleanup).
 */
export const accessCodeSchema = z.object({
  lockName: z.string(),
  code: z.string(),
  /** Seen: `scheduled` (pending) | `success` (live on the lock). */
  syncToLockStatus: z.string(),
  syncToCloudStatus: z.string(),
})
export type AccessCode = z.infer<typeof accessCodeSchema>

export const reservationSchema = z.object({
  bookingId: z.number().int(),
  /** `<lodgifyBookingId>VK<accountId>` — the join key back to Lodgify. */
  confirmationCode: z.string(),
  guestFirstName: z.string(),
  guestLastName: z.string(),
  guestEmail: z.string(),
  checkInTimestamp: z.number().int(),
  checkOutTimestamp: z.number().int(),
  /** Int channel code (e.g. 12 = Expedia). */
  bookingSource: z.number().int(),
  /** Empty for `past` reservations — codes are cleared after checkout. */
  accessCodes: z.array(accessCodeSchema),
})
export type Reservation = z.infer<typeof reservationSchema>

/** `getReservationsByProperty` */
export const reservationsResponseSchema = lynxEnvelope(z.object({ reservations: z.array(reservationSchema) }))
export type ReservationsResponse = z.infer<typeof reservationsResponseSchema>

/**
 * One physical lock in a property's lock set. Only `lockName` is currently consumed —
 * `checkReadiness` uses it to enumerate the property's lock set as the readiness
 * denominator. Lynx also emits `connectivityStatus`, `batteryLevel`, `isJammed`,
 * `provisionStatus`, `lockModelUniqueName`; not modeled because their wire types have
 * drifted repeatedly (`isJammed` shifted boolean→number→other; `batteryLevel` shifted
 * number→string) and blocking the sync on validation for fields we don't read costs
 * runtime uptime without buying safety. When we start consuming any of them (health
 * context for escalation messages was the design intent), add them back typed against
 * observed wire data at that point.
 */
export const smartLockSchema = z.object({
  lockName: z.string(),
})
export type SmartLock = z.infer<typeof smartLockSchema>

/** `getSmartLocksByPropertyWithStatus` — `paginationInfo.total` is the lock count. */
export const smartLocksResponseSchema = lynxEnvelope(z.object({ smartLocksInfo: z.array(smartLockSchema) }))
export type SmartLocksResponse = z.infer<typeof smartLocksResponseSchema>

export const propertySchema = z.object({
  uniquePropertyId: z.number().int(),
  name: z.string(),
  timeZone: z.string(),
  /** ACTIVE | ... — enumerate the active set to know which properties to poll. */
  propertyStatus: z.string(),
})
export type Property = z.infer<typeof propertySchema>

/** `getPropertiesWithDeviceFiltersNew` */
export const propertiesResponseSchema = lynxEnvelope(z.object({ properties: z.array(propertySchema) }))
export type PropertiesResponse = z.infer<typeof propertiesResponseSchema>

/** Reservation poll buckets. `past` returns reservations with empty `accessCodes`. */
export const reservationTypeSchema = z.enum(['upcoming', 'current', 'past'])
export type ReservationType = z.infer<typeof reservationTypeSchema>
