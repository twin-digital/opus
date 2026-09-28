/**
 * The watcher protocol, shared with `lua/watcher.lua`.
 */
export const PROTOCOL_VERSION = 1

/**
 * Ext-state section of every protocol key, in the upper case the web remote stores.
 */
export const SECTION = 'THRASHPLAY'

/**
 * Global ext-state key of the watcher's status.
 */
export const STATUS_KEY = 'WATCHER'

/**
 * Project ext-state key prefix of a request.
 */
export const REQUEST_PREFIX = 'REQ_'

/**
 * Global ext-state key prefix of a response.
 */
export const RESPONSE_PREFIX = 'RES_'

/**
 * The web remote cuts each command off at this many characters, as sent, and answers as usual.
 */
export const COMMAND_LIMIT = 1023

export interface WatcherRequest {
  v: number
  generation: string
  command: string
  options?: Record<string, unknown>
}

/**
 * An error code the watcher answers with.
 */
export type WatcherErrorCode = 'BAD_REQUEST' | 'WRONG_PROJECT' | 'UNKNOWN_COMMAND' | 'FAILED'

export type WatcherResponse =
  | { v: number; ok: true; result?: unknown }
  | { v: number; ok: false; error: { code: WatcherErrorCode; message: string; details?: unknown } }

export interface WatcherProject {
  /**
   * The project's file name; empty when unsaved.
   */
  name: string
  /**
   * The project's `.rpp` path; empty when unsaved.
   */
  path: string
}

export interface WatcherStatus {
  v: number
  /**
   * The installed watcher's release, or `dev` when run without an install manifest.
   */
  version: string
  /**
   * Names the current project for as long as it stays current.
   */
  generation: string
  /**
   * Counts up about once a second while the watcher runs.
   */
  heartbeat: number
  project: WatcherProject
}
