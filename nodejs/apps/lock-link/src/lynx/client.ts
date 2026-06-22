import {
  propertiesResponseSchema,
  reservationsResponseSchema,
  smartLocksResponseSchema,
  type Property,
  type Reservation,
  type ReservationType,
  type SmartLock,
} from './schema.js'

/**
 * Lynx dashboard client — the read-only source side. Endpoints are POSTs (a read modeled
 * as a query-in-body POST) under a Bearer token minted by `login`, whose JWT comes back
 * in the `x-auth-token` *header*. The token is cached and re-minted on a 401 (it lasts
 * ~95 days, so logging in rarely is also the lowest-profile behaviour). Responses are
 * parsed through the zod schema so contract drift surfaces as a parse error. The base URL
 * is injectable for tests/canary.
 */

const DEFAULT_BASE_URL = 'https://api.getlynx.co'
const PREFIX = '/ProdV1.1'
const PER_PAGE = 50

export interface LynxClientOptions {
  readonly username: string
  readonly password: string
  /** Per-user id sent as `hostId`/`loggedInUserId` in bodies (NOT the account id). */
  readonly userId: string
  /** Override for tests/canary; defaults to the production API. */
  readonly baseUrl?: string
}

export class LynxApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'LynxApiError'
  }
}

export class LynxClient {
  private readonly username: string
  private readonly password: string
  private readonly userId: string
  private readonly baseUrl: string
  private token: string | undefined

  constructor(options: LynxClientOptions) {
    this.username = options.username
    this.password = options.password
    this.userId = options.userId
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  }

  /** All reservations for a property in a poll bucket (paginated under the hood). */
  async listReservations(propertyId: number, type: ReservationType): Promise<Reservation[]> {
    return this.paginate('getReservationsByProperty', { propertyId, type }, (json) => {
      const parsed = reservationsResponseSchema.parse(json)
      return { items: parsed.data.reservations, totalPages: parsed.paginationInfo.totalPages }
    })
  }

  /** The property's full lock set — the denominator for "all locks ready". */
  async listSmartLocks(propertyId: number): Promise<SmartLock[]> {
    return this.paginate(
      'getSmartLocksByPropertyWithStatus',
      { propertyId, isHubAndLockStatusRequired: true, provisioningInfo: true, skipDeviceStatusApiCall: false },
      (json) => {
        const parsed = smartLocksResponseSchema.parse(json)
        return { items: parsed.data.smartLocksInfo, totalPages: parsed.paginationInfo.totalPages }
      },
    )
  }

  /** The active property set — the dynamic enumeration source (no static list). */
  async listProperties(): Promise<Property[]> {
    return this.paginate(
      'getPropertiesWithDeviceFiltersNew',
      { searchKey: '', sortBy: { by: 'name', order: 'asc' }, filters: {} },
      (json) => {
        const parsed = propertiesResponseSchema.parse(json)
        return { items: parsed.data.properties, totalPages: parsed.paginationInfo.totalPages }
      },
    )
  }

  private async paginate<T>(
    action: string,
    baseBody: Record<string, unknown>,
    parsePage: (json: unknown) => { items: T[]; totalPages: number },
  ): Promise<T[]> {
    const all: T[] = []
    let page = 1
    for (;;) {
      const json = await this.dashboard(action, { ...baseBody, page: String(page), perPage: PER_PAGE })
      const { items, totalPages } = parsePage(json)
      all.push(...items)
      if (page >= totalPages) {
        return all
      }
      page += 1
    }
  }

  /** POST a dashboard action with the cached token, re-minting once on a 401. */
  private async dashboard(action: string, body: Record<string, unknown>): Promise<unknown> {
    const path = `${PREFIX}/dashboard/${action}`
    const payload = { hostId: this.userId, loggedInUserId: this.userId, ...body }
    let res = await this.post(path, payload, await this.authToken())
    if (res.status === 401) {
      this.token = undefined
      res = await this.post(path, payload, await this.authToken())
    }
    if (!res.ok) {
      throw new LynxApiError(res.status, `Lynx ${action} failed: HTTP ${String(res.status)}`)
    }
    return res.json()
  }

  private async authToken(): Promise<string> {
    this.token ??= await this.login()
    return this.token
  }

  /** Mint a JWT; it arrives in the `x-auth-token` response header, not the body. */
  private async login(): Promise<string> {
    const res = await fetch(`${this.baseUrl}${PREFIX}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    })
    const token = res.headers.get('x-auth-token')
    if (!res.ok || token === null) {
      throw new LynxApiError(res.status, 'Lynx login failed (no x-auth-token)')
    }
    return token
  }

  private async post(path: string, body: unknown, token: string): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  }
}
