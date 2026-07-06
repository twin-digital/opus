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

/**
 * Lynx encodes booleans as ints on the wire. Strict-literal keeps the runtime type
 * `0 | 1` (JS truthy eval reads naturally, `if (x.isJammed) ...`) while rejecting stray
 * values (`2`, `"1"`, `null`) at parse rather than silently propagating them.
 */
const zBoolInt = z.union([z.literal(0), z.literal(1)])

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
 */
export const accessCodeSchema = z.object({
  lockName: z.string(),
  code: z.string(),
  isCodeSet: zBoolInt,
  isHubCommunicated: zBoolInt,
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

/** One physical lock in a property's lock set, with health/provisioning context. */
export const smartLockSchema = z.object({
  lockName: z.string(),
  /** ONLINE | OFFLINE */
  connectivityStatus: z.string(),
  batteryLevel: z.number().nullable(),
  isJammed: zBoolInt,
  /** Numeric status code on the wire (not a string like `PROVISIONED`). */
  provisionStatus: z.number(),
  /** e.g. `SCHLAGE_ENCODE`, `REMOTELOCK_ACS`. */
  lockModelUniqueName: z.string(),
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
