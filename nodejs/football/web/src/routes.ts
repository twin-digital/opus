import type { PlayerId } from '@twin-digital/football-data'

import { UnknownPlayerError, type App } from './app.js'
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
  if (method === 'POST' && path === '/api/poll') {
    if (!isRecord(body) || typeof body.enabled !== 'boolean') {
      return json(400, { error: 'body must be { enabled: boolean }' })
    }
    poller.setEnabled(body.enabled)
    return json(200, statePayload(context))
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
    const removed = app.unmarkPick(body.playerId as PlayerId)
    return json(200, { removed, state: statePayload(context) })
  }
  if (method === 'POST' && path === '/api/refresh') {
    if (app.ingest.running) {
      return json(409, { error: 'ingest already running' })
    }
    void app.refresh() // errors are captured in app.ingest, never thrown
    return json(202, { started: true })
  }
  return json(404, { error: `no route: ${method} ${path}` })
}
