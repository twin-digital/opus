import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  bookingSchema,
  bookingSetSchema,
  bookingStatusSchema,
  keyCodesSchema,
  putKeyCodesRequestSchema,
  roomSchema,
} from './schema.js'
import { LODGIFY_OPERATIONS } from './openapi-source.js'

/**
 * Contract test: our hand-authored zod must stay aligned with Lodgify's documented
 * OpenAPI (vendored as `lodgify.openapi.json`, refreshed by `pull-spec.ts`). The risk is
 * being *stricter* than the API — then valid data fails to parse in production — so the
 * checks here assert presence and "not stricter than the spec," not exact equality.
 *
 * Offline and deterministic: reads the committed spec, never the network. Refreshing the
 * spec (nightly drift PR) re-runs this against the new contract.
 */

// Index lookups are typed `| undefined` (despite noUncheckedIndexedAccess being off) so
// the defensive checks below are real: a missing path/component/field is exactly the
// drift this test exists to catch.
interface SchemaNode {
  $ref?: string
  type?: string
  nullable?: boolean
  enum?: string[]
  properties?: Record<string, SchemaNode | undefined>
  items?: SchemaNode
  content?: Record<string, { schema?: SchemaNode } | undefined>
}

interface Operation {
  requestBody?: { content?: Record<string, { schema?: SchemaNode } | undefined> }
  responses?: Record<string, SchemaNode | undefined>
}
const spec = JSON.parse(readFileSync(new URL('./lodgify.openapi.json', import.meta.url), 'utf8')) as {
  paths: Record<string, Record<string, Operation | undefined> | undefined>
  components: { schemas: Record<string, SchemaNode | undefined> }
}

const deref = (node: SchemaNode): SchemaNode => {
  if (!node.$ref) {
    return node
  }
  const name = node.$ref.split('/').at(-1) ?? ''
  const target = spec.components.schemas[name]
  if (!target) {
    throw new Error(`unresolved $ref ${node.$ref}`)
  }
  return target
}

/** The BookingDto behind the `GET /v2/reservations/bookings/{id}` 200 response. */
const bookingComponent = (): SchemaNode => {
  const json = spec.paths['/v2/reservations/bookings/{id}']?.get?.responses?.['200']?.content?.['application/json']
  if (!json?.schema) {
    throw new Error('no 200 application/json schema for GET booking')
  }
  return deref(json.schema)
}

describe('lodgify openapi contract', () => {
  it('still documents every operation the sync depends on', () => {
    for (const { method, path } of LODGIFY_OPERATIONS) {
      expect(spec.paths[path], `missing path ${path}`).toBeDefined()
      expect(spec.paths[path]?.[method], `missing ${method.toUpperCase()} ${path}`).toBeDefined()
    }
  })

  it('documents every booking field the sync reads', () => {
    const props = bookingComponent().properties ?? {}
    for (const field of [
      'id',
      'property_id',
      'arrival',
      'departure',
      'status',
      'source',
      'source_text',
      'created_at',
      'guest',
      'rooms',
      'is_deleted',
    ]) {
      expect(props, `BookingDto missing "${field}"`).toHaveProperty(field)
    }
  })

  it('is not stricter than the spec on nullability (booking fields and nested DTOs)', () => {
    // Every field the sync reads that is `nullable: true` in the spec must round-trip
    // `null` through our zod — else a documented null crashes the parse in production.
    const booking = bookingComponent()
    const rooms = booking.properties?.rooms
    const room = rooms?.items ? deref(rooms.items) : undefined
    const guest = booking.properties?.guest ? deref(booking.properties.guest) : undefined

    if (rooms?.nullable) {
      expect(bookingSchema.shape.rooms.safeParse(null).success, 'booking.rooms is nullable in spec').toBe(true)
    }
    const keyCode = room?.properties?.key_code
    expect(keyCode, 'BookingRoomDto missing key_code').toBeDefined()
    if (keyCode?.nullable) {
      expect(roomSchema.shape.key_code.safeParse(null).success, 'room.key_code is nullable in spec').toBe(true)
    }
    if (guest?.properties?.name?.nullable) {
      expect(bookingSchema.shape.guest.shape.name.safeParse(null).success, 'guest.name is nullable in spec').toBe(true)
    }
    if (guest?.properties?.email?.nullable) {
      expect(bookingSchema.shape.guest.shape.email.safeParse(null).success, 'guest.email is nullable in spec').toBe(
        true,
      )
    }
  })

  it('accepts a null BookingSetDto.count and .items when the spec says nullable', () => {
    // The list-bookings 200 response. Both fields are nullable in the spec; zod must not
    // be stricter. (This was the highest-severity find from the cold review: a null items
    // response would take down the poll driver otherwise.)
    const json = spec.paths['/v2/reservations/bookings']?.get?.responses?.['200']?.content?.['application/json']
    if (!json?.schema) {
      throw new Error('no 200 application/json schema for GET bookings')
    }
    const setDto = deref(json.schema)
    if (setDto.properties?.count?.nullable) {
      expect(bookingSetSchema.safeParse({ count: null, items: [] }).success).toBe(true)
    }
    if (setDto.properties?.items?.nullable) {
      expect(bookingSetSchema.safeParse({ count: 0, items: null }).success).toBe(true)
    }
  })

  it('accepts every documented booking status without silently coercing it', () => {
    // `bookingStatusSchema` has `.catch('Open')` so `safeParse` succeeds for any input —
    // asserting `.success` alone would silently pass a newly-added spec value coerced to
    // `'Open'` (the exact drift this test exists to catch). Compare the parsed value.
    const status = deref(bookingComponent().properties?.status ?? {})
    for (const value of status.enum ?? []) {
      expect(bookingStatusSchema.parse(value), `status "${value}" coerced or rejected`).toBe(value)
    }
  })

  it('models the keyCodes PUT echo as rooms-only, not a full booking', () => {
    // Regression guard: the keyCodes 200 echo is BookingKeyCodeDto ({ rooms }), NOT a full
    // booking. Parsing it through bookingSchema would throw against the real API.
    const json =
      spec.paths['/v2/reservations/bookings/{id}/keyCodes']?.put?.responses?.['200']?.content?.['application/json']
    if (!json?.schema) {
      throw new Error('no 200 application/json schema for PUT keyCodes')
    }
    const echo = deref(json.schema)
    expect(Object.keys(echo.properties ?? {})).toEqual(['rooms'])
    expect(keyCodesSchema.safeParse({ rooms: [{ room_type_id: 1, key_code: null }] }).success).toBe(true)
    expect(keyCodesSchema.safeParse({ rooms: null }).success).toBe(true)
  })

  it('agrees with the spec on the PUT keyCodes REQUEST body — the write shape', () => {
    // The write side of the sync. A `key_code`→`keyCode` (or `room_type_id`) rename
    // upstream would keep the response echo passing but silently break every write; this
    // pins the request field names to `putKeyCodesRequestSchema`.
    const json = spec.paths['/v2/reservations/bookings/{id}/keyCodes']?.put?.requestBody?.content?.['application/json']
    if (!json?.schema) {
      throw new Error('no application/json requestBody schema for PUT keyCodes')
    }
    const reqDto = deref(json.schema)
    expect(Object.keys(reqDto.properties ?? {})).toEqual(['rooms'])
    const roomsField = reqDto.properties?.rooms
    const roomItem = roomsField?.items ? deref(roomsField.items) : undefined
    expect(Object.keys(roomItem?.properties ?? {}).sort()).toEqual(['key_code', 'room_type_id'])
    // Zod's request schema must accept a documented row without any transformation.
    expect(putKeyCodesRequestSchema.safeParse({ rooms: [{ room_type_id: 1, key_code: '1234' }] }).success).toBe(true)
  })
})
