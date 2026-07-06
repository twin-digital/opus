import {
  bookingSchema,
  bookingSetSchema,
  keyCodesSchema,
  type Booking,
  type BookingSet,
  type KeyCodes,
  type PutKeyCodesRequest,
} from './schema.js'

/**
 * Lodgify public API v2 client — the destination side of the sync. Every response is
 * parsed through the zod schema (`./schema.ts`), so a contract drift surfaces as a parse
 * error rather than silently-wrong data. The base URL is injectable so tests point it at
 * the stateful fake and the canary can target a test account.
 */

const DEFAULT_BASE_URL = 'https://api.lodgify.com'

export interface LodgifyClientOptions {
  /** Lodgify dashboard → Settings → Public API. Sent as the `X-ApiKey` header. */
  readonly apiKey: string
  /** Override for tests/canary; defaults to the production API. */
  readonly baseUrl?: string
}

/** A non-2xx response from Lodgify, carrying its typed error envelope. */
export class LodgifyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly correlationId?: string,
  ) {
    super(message)
    this.name = 'LodgifyApiError'
  }
}

/** Query params for the booking list (the poll driver); see the architecture doc. */
export interface ListBookingsParams {
  readonly stayFilter?: 'Upcoming' | 'Current' | 'Historic' | 'ArrivalDate' | 'DepartureDate' | 'All'
  readonly stayFilterDate?: string
  readonly page?: number
  readonly size?: number
  readonly includeCount?: boolean
  /** Incremental poll: only bookings changed since this ISO timestamp. */
  readonly updatedSince?: string
}

export class LodgifyClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(options: LodgifyClientOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  }

  /** `GET /v2/reservations/bookings` — the gap-fill poll driver. */
  async listBookings(params: ListBookingsParams = {}): Promise<BookingSet> {
    const query = new URLSearchParams()
    if (params.stayFilter !== undefined) {
      query.set('stayFilter', params.stayFilter)
    }
    if (params.stayFilterDate !== undefined) {
      query.set('stayFilterDate', params.stayFilterDate)
    }
    if (params.page !== undefined) {
      query.set('page', String(params.page))
    }
    if (params.size !== undefined) {
      query.set('size', String(params.size))
    }
    if (params.includeCount !== undefined) {
      query.set('includeCount', String(params.includeCount))
    }
    if (params.updatedSince !== undefined) {
      query.set('updatedSince', params.updatedSince)
    }
    const qs = query.toString()
    return bookingSetSchema.parse(await this.request('GET', `/v2/reservations/bookings${qs ? `?${qs}` : ''}`))
  }

  /**
   * All bookings matching the filter across every page. Loops until the accumulated
   * item count reaches `count` (or a page comes back empty). Callers that need only
   * one page — canary probes, targeted diagnostics — use `listBookings` directly.
   */
  async listAllBookings(params: Omit<ListBookingsParams, 'page'> = {}): Promise<Booking[]> {
    // Explicit `size=50` matches Lodgify's documented default; leaving it implicit means
    // a silent server-side change to the default page size would silently change our
    // fetch cadence. `includeCount` is required so the loop can detect the end.
    const size = params.size ?? 50
    const items: Booking[] = []
    let page = 1
    for (;;) {
      const set = await this.listBookings({ ...params, page, size, includeCount: true })
      items.push(...set.items)
      if (set.items.length === 0 || items.length >= set.count) {
        return items
      }
      page += 1
    }
  }

  /** `GET /v2/reservations/bookings/{id}` — resolve / diff. */
  async getBooking(id: number): Promise<Booking> {
    return bookingSchema.parse(await this.request('GET', `/v2/reservations/bookings/${String(id)}`))
  }

  /**
   * `PUT /v2/reservations/bookings/{id}/keyCodes`. Lodgify echoes only the updated rooms
   * (not a full booking) on 200 — read back `rooms[].key_code` to confirm the write.
   */
  async putKeyCodes(id: number, rooms: PutKeyCodesRequest['rooms']): Promise<KeyCodes> {
    return keyCodesSchema.parse(
      await this.request('PUT', `/v2/reservations/bookings/${String(id)}/keyCodes`, { rooms }),
    )
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { 'X-ApiKey': this.apiKey }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    // Tolerant parse: a proxy/CDN 5xx or text/plain error body isn't JSON, but the failure
    // must still surface as a LodgifyApiError carrying the status (not an opaque SyntaxError).
    const text = await res.text()
    let json: unknown
    try {
      json = text.length === 0 ? undefined : JSON.parse(text)
    } catch {
      json = undefined
    }
    if (!res.ok) {
      const envelope = (json ?? {}) as { code?: string; message?: string; correlation_id?: string }
      throw new LodgifyApiError(
        res.status,
        envelope.message ?? `HTTP ${String(res.status)}`,
        envelope.code,
        envelope.correlation_id,
      )
    }
    if (json === undefined) {
      throw new LodgifyApiError(res.status, `Lodgify returned a ${String(res.status)} with a non-JSON body`)
    }
    return json
  }
}
