import { AsyncLocalStorage } from 'node:async_hooks'
import type { Logger } from '../types.js'

/**
 * Exported internally for use in unit tests, but not part of public API.
 *
 * @internal
 */
export const asyncLocalStorage = new AsyncLocalStorage<Logger>()
