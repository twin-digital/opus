import { z } from 'zod'

/**
 * Lodgify public API v2 response contracts — the single source of truth shared by the
 * runtime client (parse/validate responses), the stateful test fake (validate what it
 * serves), and, later, the canary (assert live responses still match these shapes).
 *
 * Only the fields the sync uses are modeled strictly; unknown fields are stripped on
 * parse (zod's default), so Lodgify can add fields without breaking us. A parse failure
 * is therefore a meaningful "shape changed" signal, not noise from an extra field.
 */

/** A booking's room and its (possibly empty) door code — the gap signal + write target. */
export const roomSchema = z.object({
  room_type_id: z.number().int(),
  /** Empty string or `null` when no code has been written yet — i.e. a gap to fill. */
  key_code: z.string().nullable(),
})
export type Room = z.infer<typeof roomSchema>

/**
 * Booking status; `Booked` is the only one we act on. An unknown value from Lodgify
 * (a new StatusEnum entry) falls back to `Open` rather than throwing, so one unfamiliar
 * status can't halt the whole poll — anything not `Booked` is skipped by the sync anyway.
 */
export const bookingStatusSchema = z.enum(['Booked', 'Tentative', 'Declined', 'Open']).catch('Open')

export const bookingSchema = z.object({
  id: z.number().int(),
  property_id: z.number().int(),
  arrival: z.string(),
  departure: z.string(),
  status: bookingStatusSchema,
  is_deleted: z.boolean(),
  /**
   * Channel the booking came through (a `SourceEnum`: Expedia, BookingCom, Airbnb, …).
   * Modeled as a plain string so a new channel value can't break parsing.
   */
  source: z.string().nullable(),
  /** Real OTA reference (e.g. an Expedia confirmation), distinct from `source`. */
  source_text: z.string().nullable(),
  /** Booking creation time (ISO). Used for the escalation GRACE window. */
  created_at: z.string(),
  guest: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  /** Nullable in the API; a booking with no rooms has nothing to write to. */
  rooms: z.array(roomSchema).nullable(),
})
export type Booking = z.infer<typeof bookingSchema>

/**
 * `GET /v2/reservations/bookings` — the poll driver. The spec marks both `count` and
 * `items` nullable; we accept nulls on the wire and normalize to `0` / `[]` so consumers
 * (the sync loop, the client, tests) don't need null-handling everywhere.
 */
export const bookingSetSchema = z.object({
  count: z
    .number()
    .int()
    .nullable()
    .transform((v) => v ?? 0),
  items: z
    .array(bookingSchema)
    .nullable()
    .transform((v) => v ?? []),
})
export type BookingSet = z.infer<typeof bookingSetSchema>

/** `PUT /v2/reservations/bookings/{id}/keyCodes` request body. */
export const putKeyCodesRequestSchema = z.object({
  rooms: z.array(
    z.object({
      room_type_id: z.number().int(),
      key_code: z.string(),
    }),
  ),
})
export type PutKeyCodesRequest = z.infer<typeof putKeyCodesRequestSchema>

/**
 * `PUT /v2/reservations/bookings/{id}/keyCodes` 200 echo. Lodgify returns only the
 * updated rooms (`BookingKeyCodeDto`), NOT a full booking — read back `rooms[].key_code`
 * to confirm the write.
 */
export const keyCodesSchema = z.object({
  rooms: z
    .array(
      z.object({
        room_type_id: z.number().int(),
        key_code: z.string().nullable(),
      }),
    )
    .nullable(),
})
export type KeyCodes = z.infer<typeof keyCodesSchema>
