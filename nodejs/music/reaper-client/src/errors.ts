import type { WatcherErrorCode } from './protocol.js'

/**
 * Why a client operation failed: a watcher error code, or one the client raises itself.
 */
export type ReaperErrorCode =
  | WatcherErrorCode
  | 'REQUEST_TOO_LARGE'
  | 'TIMEOUT'
  | 'WATCHER_NOT_RUNNING'
  | 'INCOMPATIBLE_WATCHER'
  | 'REAPER_UNREACHABLE'
  | 'BAD_RESPONSE'

export class ReaperError extends Error {
  constructor(
    readonly code: ReaperErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ReaperError'
  }
}
