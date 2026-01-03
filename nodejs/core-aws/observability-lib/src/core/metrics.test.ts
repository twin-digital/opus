import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { createMetrics, MetricUnit } from './metrics.js'
import type { Metrics } from '@aws-lambda-powertools/metrics'

// Hoist mocks for Metrics class
const { MockMetrics, mockAddMetric, mockAddDimension, mockPublishStoredMetrics, mockCaptureColdStart } = vi.hoisted(
  () => {
    const mockAddMetric = vi.fn()
    const mockAddDimension = vi.fn()
    const mockPublishStoredMetrics = vi.fn()
    const mockCaptureColdStart = vi.fn()

    const MockMetrics = vi.fn(function (this: unknown) {
      const self = this as Record<string, unknown>
      self.addMetric = mockAddMetric
      self.addDimension = mockAddDimension
      self.publishStoredMetrics = mockPublishStoredMetrics
      self.captureColdStartMetric = mockCaptureColdStart
    }) as unknown as ReturnType<typeof vi.fn> & (new () => unknown)

    return { MockMetrics, mockAddMetric, mockAddDimension, mockPublishStoredMetrics, mockCaptureColdStart }
  },
)

vi.mock('@aws-lambda-powertools/metrics', () => ({
  Metrics: MockMetrics,
  MetricUnit: { Count: 'Count' },
}))

describe('createMetrics', () => {
  let originalMetricsNamespace: string | undefined
  let originalServiceName: string | undefined

  beforeAll(() => {
    originalMetricsNamespace = process.env.POWERTOOLS_METRICS_NAMESPACE
    originalServiceName = process.env.POWERTOOLS_SERVICE_NAME
  })

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.POWERTOOLS_METRICS_NAMESPACE
    delete process.env.POWERTOOLS_SERVICE_NAME
  })

  afterAll(() => {
    process.env.POWERTOOLS_METRICS_NAMESPACE = originalMetricsNamespace
    process.env.POWERTOOLS_SERVICE_NAME = originalServiceName
  })

  it('creates metrics with default options', () => {
    const metrics = createMetrics()

    expect(metrics).toBeDefined()
    expect(MockMetrics).toHaveBeenCalled()
    expect(MockMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'Application',
        serviceName: 'service',
      }),
    )
  })

  it('creates metrics with custom namespace', () => {
    createMetrics({ namespace: 'Bookify/API' })

    expect(MockMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'Bookify/API',
      }),
    )
  })

  it('creates metrics with custom service name', () => {
    createMetrics({ serviceName: 'MyService' })

    expect(MockMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'MyService',
      }),
    )
  })

  it('uses POWERTOOLS_METRICS_NAMESPACE env var when present', () => {
    process.env.POWERTOOLS_METRICS_NAMESPACE = 'EnvNamespace'
    createMetrics()

    expect(MockMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'EnvNamespace',
      }),
    )
  })

  it('uses POWERTOOLS_SERVICE_NAME env var when present', () => {
    process.env.POWERTOOLS_SERVICE_NAME = 'EnvService'
    createMetrics()

    expect(MockMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'EnvService',
      }),
    )
  })

  it('re-exports MetricUnit', () => {
    expect(MetricUnit).toBeDefined()
    expect(MetricUnit.Count).toBe('Count')
  })
})
