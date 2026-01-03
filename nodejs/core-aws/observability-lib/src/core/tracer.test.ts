import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { createTracer } from './tracer.js'
import type { Tracer as PowertoolsTracer } from '@aws-lambda-powertools/tracer'

// Hoist mocks so they are available during vi.mock hoisting
const { MockTracer, mockPutAnnotation, mockPutMetadata } = vi.hoisted(() => {
  const mockPutAnnotation = vi.fn()
  const mockPutMetadata = vi.fn()

  const MockTracer = vi.fn(function (this: unknown) {
    const self = this as Record<string, unknown>
    self.putAnnotation = mockPutAnnotation
    self.putMetadata = mockPutMetadata
  }) as unknown as ReturnType<typeof vi.fn> & (new () => unknown)

  return { MockTracer, mockPutAnnotation, mockPutMetadata }
})

vi.mock('@aws-lambda-powertools/tracer', () => ({
  Tracer: MockTracer,
}))

describe('createTracer', () => {
  let originalServiceName: string | undefined
  let originalTracerEnabled: string | undefined

  beforeAll(() => {
    originalServiceName = process.env.POWERTOOLS_SERVICE_NAME
    originalTracerEnabled = process.env.POWERTOOLS_TRACER_ENABLED
  })

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.POWERTOOLS_SERVICE_NAME
    delete process.env.POWERTOOLS_TRACER_ENABLED
  })

  afterAll(() => {
    process.env.POWERTOOLS_SERVICE_NAME = originalServiceName
    process.env.POWERTOOLS_TRACER_ENABLED = originalTracerEnabled
  })

  it('creates a tracer with default options', () => {
    const tracer: PowertoolsTracer = createTracer()

    expect(tracer).toBeDefined()
    expect(MockTracer).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'service',
        enabled: true,
      }),
    )
  })

  it('creates a tracer with custom service name', () => {
    createTracer({ serviceName: 'my-service' })

    expect(MockTracer).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'my-service',
      }),
    )
  })

  it('respects enabled option', () => {
    createTracer({ enabled: false })

    expect(MockTracer).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    )
  })

  it('uses POWERTOOLS_SERVICE_NAME env var when present', () => {
    process.env.POWERTOOLS_SERVICE_NAME = 'EnvTracerService'
    createTracer()

    expect(MockTracer).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'EnvTracerService',
      }),
    )
  })

  it('uses POWERTOOLS_TRACER_ENABLED env var when set to false', () => {
    process.env.POWERTOOLS_TRACER_ENABLED = 'false'
    createTracer()

    expect(MockTracer).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    )
  })
})
