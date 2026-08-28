import type { PlayerId } from '@twin-digital/football-data'

import { MockStateError, UnknownPlayerError, type App } from './app.js'
import { PAGE } from './page.js'
import type { PollStatus } from './poller.js'

/** What routes need from the poller — DraftPoller in production, a stub in tests. */
export interface PollerLike {
  status: PollStatus
  setEnabled(enabled: boolean): void
}

export interface RouteContext {
  app: App
  poller: PollerLike
  log?: (message: string) => void
}

export interface RouteResult {
  status: number
  contentType: string
  body: string
}

const json = (status: number, value: unknown): RouteResult => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const statePayload = (context: RouteContext): unknown => ({
  ...context.app.statePayload(),
  poll: context.poller.status,
})

/**
 * Dispatch one request. `body` is the parsed JSON body (undefined when absent). Throws only
 * programming errors — the HTTP wrapper turns those into 500s.
 */
export const handleRoute = (context: RouteContext, method: string, path: string, body: unknown): RouteResult => {
  const { app, poller } = context

  if (method === 'GET' && path === '/') {
    return { status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }
  }
  if (method === 'GET' && path === '/api/state') {
    return json(200, statePayload(context))
  }
  if (method === 'GET' && path === '/api/board') {
    return json(200, app.boardPayload())
  }
  if (method === 'GET' && path === '/api/evaluate') {
    return json(200, app.evaluatePayload())
  }
  if (method === 'POST' && path === '/api/poll') {
    if (!isRecord(body) || typeof body.enabled !== 'boolean') {
      return json(400, { error: 'body must be { enabled: boolean }' })
    }
    if (body.enabled && app.mockActive) {
      return json(409, { error: 'mock draft active — stop it before enabling live poll' })
    }
    poller.setEnabled(body.enabled)
    return json(200, statePayload(context))
  }
  if (method === 'POST' && path === '/api/mock') {
    return handleMock(context, body)
  }
  if (method === 'POST' && path === '/api/mark') {
    if (!isRecord(body) || typeof body.playerId !== 'string') {
      return json(400, { error: 'body must be { playerId: string, teamId?: number | "unknown" }' })
    }
    const rawTeam = body.teamId
    let teamId: number | null
    if (rawTeam === undefined || rawTeam === null || rawTeam === 'unknown') {
      teamId = null
    } else if (typeof rawTeam === 'number' && Number.isInteger(rawTeam)) {
      teamId = rawTeam
    } else {
      return json(400, { error: 'teamId must be an integer team id or "unknown"' })
    }
    // Server-side mock switch: the page's ME buttons keep calling /api/mark; a mock routes my
    // own pick into mock memory and refuses everything else — the tables are never written.
    if (app.mockActive) {
      if (teamId !== app.myTeamId) {
        return json(409, { error: 'mock draft active — the room picks for itself; marks are disabled' })
      }
      const playerId = body.playerId as PlayerId
      return mockCall(context, () => {
        app.mockUserPick(playerId)
      })
    }
    try {
      app.markPick(body.playerId as PlayerId, teamId)
    } catch (error) {
      if (error instanceof UnknownPlayerError) {
        return json(404, { error: error.message })
      }
      throw error
    }
    return json(200, statePayload(context))
  }
  if (method === 'POST' && path === '/api/unmark') {
    if (!isRecord(body) || typeof body.playerId !== 'string') {
      return json(400, { error: 'body must be { playerId: string }' })
    }
    if (app.mockActive) {
      return json(409, { error: 'mock draft active — there are no marks to undo' })
    }
    const removed = app.unmarkPick(body.playerId as PlayerId)
    return json(200, { removed, state: statePayload(context) })
  }
  if (method === 'POST' && path === '/api/refresh') {
    if (app.mockActive) {
      return json(409, { error: 'mock draft active — stop it before refreshing data' })
    }
    if (app.ingest.running) {
      return json(409, { error: 'ingest already running' })
    }
    void app.refresh() // errors are captured in app.ingest, never thrown
    return json(202, { started: true })
  }
  return json(404, { error: `no route: ${method} ${path}` })
}

/** Run a mock mutation, mapping its state conflicts to 409 and unknown players to 404. */
const mockCall = (context: RouteContext, mutate: () => void): RouteResult => {
  try {
    mutate()
  } catch (error) {
    if (error instanceof MockStateError) {
      return json(409, { error: error.message })
    }
    if (error instanceof UnknownPlayerError) {
      return json(404, { error: error.message })
    }
    throw error
  }
  return json(200, statePayload(context))
}

const handleMock = (context: RouteContext, body: unknown): RouteResult => {
  const { app, poller } = context
  if (!isRecord(body) || typeof body.action !== 'string') {
    return json(400, { error: "body must be { action: 'start' | 'stop' | 'advance' | 'pick', … }" })
  }
  switch (body.action) {
    case 'start': {
      const { pace, seed } = body
      if (pace !== undefined && (typeof pace !== 'number' || !Number.isFinite(pace) || pace < 0)) {
        return json(400, { error: 'pace must be a number of seconds ≥ 0' })
      }
      if (seed !== undefined && (typeof seed !== 'number' || !Number.isFinite(seed))) {
        return json(400, { error: 'seed must be a number' })
      }
      if (poller.status.enabled) {
        return json(409, { error: 'live poll is enabled — turn it off before starting a mock draft' })
      }
      return mockCall(context, () => {
        app.startMock({ pace, seed })
      })
    }
    case 'stop':
      return mockCall(context, () => {
        app.stopMock()
      })
    case 'advance':
      return mockCall(context, () => {
        app.advanceMock()
      })
    case 'pick': {
      if (typeof body.playerId !== 'string') {
        return json(400, { error: "pick requires { action: 'pick', playerId: string }" })
      }
      const playerId = body.playerId as PlayerId
      return mockCall(context, () => {
        app.mockUserPick(playerId)
      })
    }
    default:
      return json(400, { error: `unknown mock action: ${body.action}` })
  }
}
