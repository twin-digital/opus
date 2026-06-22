import { bookingSchema, bookingSetSchema, type Booking, type BookingSet, type PutKeyCodesRequest } from './schema.js'

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

  /** `GET /v2/reservations/bookings/{id}` — resolve / diff. */
  async getBooking(id: number): Promise<Booking> {
    return bookingSchema.parse(await this.request('GET', `/v2/reservations/bookings/${String(id)}`))
  }

  /** `PUT /v2/reservations/bookings/{id}/keyCodes` — returns the updated booking (200 echo). */
  async putKeyCodes(id: number, rooms: PutKeyCodesRequest['rooms']): Promise<Booking> {
    return bookingSchema.parse(await this.request('PUT', `/v2/reservations/bookings/${String(id)}/keyCodes`, { rooms }))
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
    const text = await res.text()
    const json: unknown = text.length === 0 ? undefined : JSON.parse(text)
    if (!res.ok) {
      const envelope = (json ?? {}) as { code?: string; message?: string; correlation_id?: string }
      throw new LodgifyApiError(
        res.status,
        envelope.message ?? `HTTP ${String(res.status)}`,
        envelope.code,
        envelope.correlation_id,
      )
    }
    return json
  }
}
