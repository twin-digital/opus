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
 * in the `x-auth-token` *header*. The token is read from / written to an injected
 * `TokenCache` and re-minted on a 401 (it lasts ~95 days, so logging in rarely is also
 * the lowest-profile behaviour). Responses are parsed through the zod schema so contract
 * drift surfaces as a parse error. The base URL is injectable for tests/canary.
 */

const DEFAULT_BASE_URL = 'https://api.getlynx.co'
const PREFIX = '/ProdV1.1'
const PER_PAGE = 50
/** Safety bound on the pagination loop, in case the API misreports its total. */
const MAX_PAGES = 1000

/**
 * Where the Lynx JWT lives between runs. The in-memory default only survives a warm
 * Lambda container, so production injects a durable store (Secrets Manager, DynamoDB, …)
 * behind this interface — async so those stores fit. Picking one is a future PR.
 */
export interface TokenCache {
  get: () => Promise<string | undefined>
  set: (token: string) => Promise<void>
}

/** Process-memory token cache — the default; fine for tests and warm-container reuse. */
export const inMemoryTokenCache = (): TokenCache => {
  let token: string | undefined
  return {
    get: () => Promise.resolve(token),
    set: (value) => {
      token = value
      return Promise.resolve()
    },
  }
}

export interface LynxClientOptions {
  readonly username: string
  readonly password: string
  /** Per-user id sent as `hostId`/`loggedInUserId` in bodies (NOT the account id). */
  readonly userId: string
  /** Override for tests/canary; defaults to the production API. */
  readonly baseUrl?: string
  /** Durable token store; defaults to in-memory (see `TokenCache`). */
  readonly cache?: TokenCache
  /** Invoked on every auth-endpoint call (successful or not) — feeds the token-churn metric. */
  readonly onLogin?: () => void
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
  private readonly cache: TokenCache
  private readonly onLogin: (() => void) | undefined
  /** Coalesces concurrent logins so parallel calls mint at most one token. */
  private inflightLogin: Promise<string> | undefined

  constructor(options: LynxClientOptions) {
    this.username = options.username
    this.password = options.password
    this.userId = options.userId
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.cache = options.cache ?? inMemoryTokenCache()
    this.onLogin = options.onLogin
  }

  /** All reservations for a property in a poll bucket (paginated under the hood). */
  async listReservations(propertyId: number, type: ReservationType): Promise<Reservation[]> {
    return this.paginate('getReservationsByProperty', { propertyId, type }, (json) => {
      const parsed = reservationsResponseSchema.parse(json)
      return { items: parsed.data.reservations, total: parsed.paginationInfo.total }
    })
  }

  /** The property's full lock set — the denominator for "all locks ready". */
  async listSmartLocks(propertyId: number): Promise<SmartLock[]> {
    return this.paginate(
      'getSmartLocksByPropertyWithStatus',
      { propertyId, isHubAndLockStatusRequired: true, provisioningInfo: true, skipDeviceStatusApiCall: false },
      (json) => {
        const parsed = smartLocksResponseSchema.parse(json)
        return { items: parsed.data.smartLocksInfo, total: parsed.paginationInfo.total }
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
        return { items: parsed.data.properties, total: parsed.paginationInfo.total }
      },
    )
  }

  private async paginate<T>(
    action: string,
    baseBody: Record<string, unknown>,
    parsePage: (json: unknown) => { items: T[]; total: number },
  ): Promise<T[]> {
    const all: T[] = []
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const json = await this.dashboard(action, { ...baseBody, page: String(page), perPage: PER_PAGE })
      const { items, total } = parsePage(json)
      all.push(...items)
      // Stop on the authoritative record count or an empty page — not on totalPages, which
      // is wrong if the API caps or ignores the requested perPage.
      if (items.length === 0 || all.length >= total) {
        break
      }
    }
    return all
  }

  /**
   * POST a Lynx dashboard endpoint. `action` is the endpoint name —
   * `getReservationsByProperty` / `getSmartLocksByPropertyWithStatus` /
   * `getPropertiesWithDeviceFiltersNew` — which all share this auth + `hostId`/
   * `loggedInUserId` envelope and the 401 re-mint, so the public methods don't repeat it.
   */
  private async dashboard(action: string, body: Record<string, unknown>): Promise<unknown> {
    const path = `${PREFIX}/dashboard/${action}`
    const payload = { hostId: this.userId, loggedInUserId: this.userId, ...body }
    let res = await this.post(path, payload, await this.authToken())
    if (res.status === 401) {
      // Cached token rejected (expired/invalidated) — mint a fresh one and retry once.
      res = await this.post(path, payload, await this.authToken(true))
    }
    const text = await res.text()
    if (!res.ok) {
      throw new LynxApiError(res.status, `Lynx ${action} failed: HTTP ${String(res.status)}`)
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new LynxApiError(res.status, `Lynx ${action} returned a non-JSON body`)
    }
  }

  /** A token from the cache, minting + caching a fresh one when absent or forced (401). */
  private async authToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.cache.get()
      if (cached !== undefined) {
        return cached
      }
    }
    // Coalesce concurrent mints; clear on settle so a failed login can be retried.
    this.inflightLogin ??= this.login()
      .then(async (token) => {
        await this.cache.set(token)
        return token
      })
      .finally(() => {
        this.inflightLogin = undefined
      })
    return this.inflightLogin
  }

  /**
   * Mint a JWT; it arrives in the `x-auth-token` response header, not the body. Lynx
   * expects the account identifier as `email` on the wire (the `username` we track is
   * the same string — Lynx accounts use email addresses as their login handle).
   */
  private async login(): Promise<string> {
    this.onLogin?.()
    const res = await fetch(`${this.baseUrl}${PREFIX}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.username, password: this.password }),
    })
    const token = res.headers.get('x-auth-token')
    if (!res.ok || token === null) {
      // Include the response body so a misconfiguration doesn't hide behind a generic
      // message. `res.text()` on a mint failure is cheap; the response is small JSON.
      let detail = ''
      try {
        detail = ` — ${(await res.text()).slice(0, 200)}`
      } catch {
        // ignore body read failures
      }
      throw new LynxApiError(res.status, `Lynx login failed (no x-auth-token)${detail}`)
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
