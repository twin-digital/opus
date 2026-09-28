import { ReaperError } from './errors.js'
import {
  COMMAND_LIMIT,
  PROTOCOL_VERSION,
  REQUEST_PREFIX,
  RESPONSE_PREFIX,
  SECTION,
  STATUS_KEY,
  type WatcherProject,
  type WatcherRequest,
  type WatcherResponse,
  type WatcherStatus,
} from './protocol.js'

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export interface ReaperClientOptions {
  /**
   * Base URL of REAPER's web remote, e.g. `http://10.0.0.5:8080`.
   */
  url: string
  /**
   * The web remote's username and password, when it has them.
   */
  auth?: { username: string; password: string }
  /**
   * Longest any operation may take, in milliseconds; a request's own timeout can only shorten it.
   */
  timeoutMs?: number
  /**
   * How often to check for a command's response, in milliseconds.
   */
  pollIntervalMs?: number
  fetch?: FetchLike
}

export interface RequestOptions {
  /**
   * Longest this operation may take, in milliseconds; capped at the client's timeout.
   */
  timeoutMs?: number
}

/**
 * A project as the client last saw it. Its commands are refused with `WRONG_PROJECT` once REAPER's
 * current project changes, even back to the same file; get a fresh handle to act on the new one.
 */
export interface ReaperProject {
  readonly generation: string
  runCommand<T = unknown>(command: string, options?: Record<string, unknown>, request?: RequestOptions): Promise<T>
}

export interface ReaperClient {
  /**
   * Reads the watcher's status.
   */
  getWatcherStatus(request?: RequestOptions): Promise<WatcherStatus>
  /**
   * A handle on REAPER's current project.
   */
  currentProject(request?: RequestOptions): Promise<ReaperProject & WatcherProject>
  /**
   * A handle on the project a generation names, as seen earlier.
   */
  project(generation: string): ReaperProject
}

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_POLL_INTERVAL_MS = 50
const WITHDRAW_TIMEOUT_MS = 1000

/**
 * Undoes the web remote's escaping of reply fields.
 */
const unescape = (value: string) =>
  value.replace(/\\(.)/g, (_, c: string) =>
    c === 't' ? '\t'
    : c === 'n' ? '\n'
    : c,
  )

/**
 * A request id: 9 base-36 digits of milliseconds, so one client's ids sort by send time, then 4 random ones.
 */
const newId = () =>
  (
    Date.now().toString(36).padStart(9, '0') +
    Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => (byte % 36).toString(36)).join('')
  ).toUpperCase()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createReaperClient = ({
  url,
  auth,
  timeoutMs: clientTimeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  fetch: fetchImpl = (target, init) => fetch(target, { ...init, cache: 'no-store' }),
}: ReaperClientOptions): ReaperClient => {
  const base = new URL(url)
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error(`REAPER web remote URL must start with http:// or https://: ${url}`)
  }
  // the web remote answers on IPv4 only
  if (base.hostname === 'localhost') {
    base.hostname = '127.0.0.1'
  }
  const baseUrl = base.href.replace(/\/+$/, '')
  const headers: Record<string, string> =
    auth === undefined ?
      {}
    : { authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}` }

  const deadlineFor = (request?: RequestOptions) =>
    Date.now() + Math.min(clientTimeoutMs, request?.timeoutMs ?? clientTimeoutMs)

  const send = async (commands: string[], deadline: number): Promise<string> => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new ReaperError('TIMEOUT', 'REAPER did not answer in time')
    }
    let response: Awaited<ReturnType<FetchLike>>
    try {
      response = await fetchImpl(`${baseUrl}/_/${commands.join(';')}`, {
        signal: AbortSignal.timeout(remaining),
        headers,
      })
    } catch (error) {
      if (Date.now() >= deadline) {
        throw new ReaperError('TIMEOUT', 'REAPER did not answer in time')
      }
      throw new ReaperError('REAPER_UNREACHABLE', `REAPER's web remote is unreachable at ${baseUrl}`, error)
    }
    if (!response.ok) {
      throw new ReaperError('REAPER_UNREACHABLE', `REAPER's web remote answered HTTP ${String(response.status)}`)
    }
    return response.text()
  }

  const readGlobal = async (key: string, deadline: number): Promise<string> => {
    const reply = await send([`GET/EXTSTATE/${SECTION}/${key}`], deadline)
    const fields = reply.split('\n')[0]?.split('\t') ?? []
    return unescape(fields[3] ?? '')
  }

  const parse = (raw: string, what: string): unknown => {
    try {
      return JSON.parse(raw)
    } catch (error) {
      throw new ReaperError('BAD_RESPONSE', `The watcher's ${what} is not JSON`, error)
    }
  }

  const checkVersion = (v: number) => {
    if (v !== PROTOCOL_VERSION) {
      throw new ReaperError(
        'INCOMPATIBLE_WATCHER',
        `The watcher speaks protocol ${String(v)}; this client speaks ${String(PROTOCOL_VERSION)}`,
      )
    }
  }

  const getWatcherStatus = async (request?: RequestOptions): Promise<WatcherStatus> => {
    const raw = await readGlobal(STATUS_KEY, deadlineFor(request))
    if (raw === '') {
      throw new ReaperError('WATCHER_NOT_RUNNING', 'The watcher is not running in REAPER')
    }
    const status = parse(raw, 'status') as WatcherStatus
    checkVersion(status.v)
    return status
  }

  const project = (generation: string): ReaperProject => ({
    generation,
    runCommand: async <T>(command: string, options?: Record<string, unknown>, request?: RequestOptions): Promise<T> => {
      const deadline = deadlineFor(request)
      const id = newId()
      const body: WatcherRequest = { v: PROTOCOL_VERSION, generation, command, options }
      const key = `${REQUEST_PREFIX}${id}`
      const set = `SET/PROJEXTSTATE/${SECTION}/${key}/${encodeURIComponent(JSON.stringify(body))}`
      if (set.length > COMMAND_LIMIT) {
        throw new ReaperError(
          'REQUEST_TOO_LARGE',
          `The ${command} request is ${String(set.length)} characters encoded; REAPER takes at most ${String(COMMAND_LIMIT)}`,
        )
      }
      await send([set], deadline)

      for (;;) {
        const raw = await readGlobal(`${RESPONSE_PREFIX}${id}`, deadline)
        if (raw !== '') {
          const response = parse(raw, `response to ${command}`) as WatcherResponse
          checkVersion(response.v)
          if (!response.ok) {
            throw new ReaperError(response.error.code, response.error.message, response.error.details)
          }
          return response.result as T
        }
        if (Date.now() + pollIntervalMs >= deadline) {
          break
        }
        await sleep(pollIntervalMs)
      }

      // withdraw the request if the watcher hasn't claimed it; it may already have run
      await send([`SET/PROJEXTSTATE/${SECTION}/${key}/`], Date.now() + WITHDRAW_TIMEOUT_MS).catch(() => undefined)
      throw new ReaperError('TIMEOUT', `The watcher did not answer ${command} in time; it may still have run`)
    },
  })

  return {
    getWatcherStatus,
    currentProject: async (request) => {
      const status = await getWatcherStatus(request)
      return { ...project(status.generation), ...status.project }
    },
    project,
  }
}
