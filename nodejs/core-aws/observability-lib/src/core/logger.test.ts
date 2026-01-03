import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { createLogger, type ObservableLogger } from './logger.js'

// Use vi.hoisted to define mocks that will be available during vi.mock hoisting
const { mockAppendKeys, mockRemoveKeys, mockError, mockWarn, mockInfo, mockDebug, MockLogger } = vi.hoisted(() => {
  const mockAppendKeys = vi.fn()
  const mockRemoveKeys = vi.fn()
  const mockError = vi.fn()
  const mockWarn = vi.fn()
  const mockInfo = vi.fn()
  const mockDebug = vi.fn()

  // Use a function constructor that is also a spy
  const MockLogger = vi.fn(function (this: unknown) {
    const self = this as Record<string, unknown>
    self.appendKeys = mockAppendKeys
    self.removeKeys = mockRemoveKeys
    self.error = mockError
    self.warn = mockWarn
    self.info = mockInfo
    self.debug = mockDebug
  }) as unknown as ReturnType<typeof vi.fn> & (new () => unknown)

  return { mockAppendKeys, mockRemoveKeys, mockError, mockWarn, mockInfo, mockDebug, MockLogger }
})

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: MockLogger,
}))

describe('createLogger', () => {
  let originalServiceName: string | undefined
  let originalLogLevel: string | undefined

  beforeAll(() => {
    originalServiceName = process.env.POWERTOOLS_SERVICE_NAME
    originalLogLevel = process.env.POWERTOOLS_LOG_LEVEL
  })

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.POWERTOOLS_SERVICE_NAME
    delete process.env.POWERTOOLS_LOG_LEVEL
  })

  afterAll(() => {
    process.env.POWERTOOLS_SERVICE_NAME = originalServiceName
    process.env.POWERTOOLS_LOG_LEVEL = originalLogLevel
  })

  it('creates a logger with default options', () => {
    const logger = createLogger()

    expect(logger).toBeDefined()
    expect(MockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'service',
        logLevel: 'INFO',
      }),
    )
  })

  it('creates a logger with custom service name', () => {
    createLogger({ serviceName: 'my-custom-service' })

    expect(MockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'my-custom-service',
      }),
    )
  })

  it('creates a logger with custom log level', () => {
    createLogger({ logLevel: 'DEBUG' })

    expect(MockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        logLevel: 'DEBUG',
      }),
    )
  })

  it('uses POWERTOOLS_SERVICE_NAME env var when present', () => {
    process.env.POWERTOOLS_SERVICE_NAME = 'EnvLoggerService'
    createLogger()

    expect(MockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'EnvLoggerService',
      }),
    )
  })

  it('uses POWERTOOLS_LOG_LEVEL env var when present', () => {
    process.env.POWERTOOLS_LOG_LEVEL = 'WARN'
    createLogger()

    expect(MockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        logLevel: 'WARN',
      }),
    )
  })

  describe('log methods', () => {
    let logger: ObservableLogger

    beforeEach(() => {
      logger = createLogger()
    })

    it('calls powertools info with message', () => {
      logger.info('test message')

      expect(mockInfo).toHaveBeenCalledWith('test message')
    })

    it('calls powertools info with message and data', () => {
      logger.info('test message', { key: 'value' })

      expect(mockInfo).toHaveBeenCalledWith('test message', {
        data: [{ key: 'value' }],
      })
    })

    it('ignores undefined messages', () => {
      logger.info(undefined)

      expect(mockInfo).not.toHaveBeenCalled()
    })

    it('calls powertools error with message', () => {
      logger.error('error message')

      expect(mockError).toHaveBeenCalledWith('error message')
    })

    it('calls powertools warn with message', () => {
      logger.warn('warning message')

      expect(mockWarn).toHaveBeenCalledWith('warning message')
    })

    it('calls powertools debug with message', () => {
      logger.debug('debug message')

      expect(mockDebug).toHaveBeenCalledWith('debug message')
    })
  })

  describe('context methods', () => {
    let logger: ObservableLogger

    beforeEach(() => {
      logger = createLogger()
    })

    it('addContext calls appendKeys with key-value', () => {
      logger.addContext('userId', '123')

      expect(mockAppendKeys).toHaveBeenCalledWith({ userId: '123' })
    })

    it('appendKeys calls powertools appendKeys', () => {
      logger.appendKeys({ requestId: 'abc', userId: '123' })

      expect(mockAppendKeys).toHaveBeenCalledWith({
        requestId: 'abc',
        userId: '123',
      })
    })

    it('removeKeys calls powertools removeKeys', () => {
      logger.removeKeys(['userId', 'requestId'])

      expect(mockRemoveKeys).toHaveBeenCalledWith(['userId', 'requestId'])
    })
  })
})
