/* eslint-disable @typescript-eslint/no-empty-function */
import { describe, it, expect, beforeEach } from 'vitest'
import { getLogger, setLogger, runWithLogger } from './logger-context.js'
import { asyncLocalStorage } from './async-local-storage.js'
import { consoleLogger } from '../implementations/implementations.js'
import type { Logger } from '../types.js'

describe('logger-context', () => {
  beforeEach(() => {
    // Reset AsyncLocalStorage state between tests
    asyncLocalStorage.disable()
  })

  describe('getLogger', () => {
    it('returns console logger as fallback when no logger is set', () => {
      const logger = getLogger()

      expect(logger).toBeDefined()
      expect(logger.info).toBeDefined()
      expect(logger.error).toBeDefined()
      expect(logger).toBe(consoleLogger)
    })

    it('returns same fallback logger instance on subsequent calls', () => {
      const logger1 = getLogger()
      const logger2 = getLogger()

      expect(logger1).toBe(logger2)
    })

    it('returns current logger when one is set', () => {
      const customLogger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      setLogger(customLogger)
      const logger = getLogger()

      expect(logger).toBe(customLogger)
      expect(logger).not.toBe(consoleLogger)
    })

    it('maintains logger context across async operations', async () => {
      const customLogger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      setLogger(customLogger)

      const logger1 = getLogger()
      expect(logger1).toBe(customLogger)

      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 10))

      const logger2 = getLogger()
      expect(logger2).toBe(customLogger)
      expect(logger2).toBe(logger1)
    })
  })

  describe('setLogger', () => {
    it('sets the current logger imperatively', () => {
      const customLogger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      setLogger(customLogger)

      expect(getLogger()).toBe(customLogger)
    })
  })

  describe('context isolation', () => {
    it('simulates multiple invocations without pollution', () => {
      const invocation1Logger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }
      const invocation2Logger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      // First invocation - using setLogger
      setLogger(invocation1Logger)
      expect(getLogger()).toBe(invocation1Logger)

      // Second invocation - context automatically isolated
      setLogger(invocation2Logger)
      expect(getLogger()).toBe(invocation2Logger)
    })
  })

  describe('runWithLogger', () => {
    it('sets logger within callback scope', () => {
      const customLogger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      runWithLogger(customLogger, () => {
        expect(getLogger()).toBe(customLogger)
      })
    })

    it('returns sync callback result', () => {
      const customLogger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      const result = runWithLogger(customLogger, () => 'test-result')
      expect(result).toBe('test-result')
    })

    it('returns async callback result', async () => {
      const customLogger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      const result = await runWithLogger(customLogger, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return 'async-result'
      })

      expect(result).toBe('async-result')
    })

    it('maintains logger context across async operations within callback', async () => {
      const customLogger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      await runWithLogger(customLogger, async () => {
        expect(getLogger()).toBe(customLogger)
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(getLogger()).toBe(customLogger)
      })
    })

    it('isolates logger context between concurrent calls', async () => {
      const logger1: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }
      const logger2: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      const results = await Promise.all([
        runWithLogger(logger1, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return getLogger()
        }),
        runWithLogger(logger2, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          return getLogger()
        }),
      ])

      expect(results[0]).toBe(logger1)
      expect(results[1]).toBe(logger2)
    })

    it('reverts context after callback completes', () => {
      const customLogger: Logger = {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }

      runWithLogger(customLogger, () => {
        expect(getLogger()).toBe(customLogger)
      })

      // After callback, should NOT be the custom logger anymore
      // It reverts to whatever context existed before (fallback or outer context)
      expect(getLogger()).not.toBe(customLogger)
    })
  })
})
