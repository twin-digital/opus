import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EmfMetricsCapture } from './emf-metrics-capture.js'
import { MetricUnit, Metrics } from '@aws-lambda-powertools/metrics'
import type { MetricsOptions } from '@aws-lambda-powertools/metrics/types'

export const createMetrics = (options: MetricsOptions = {}): Metrics => {
  return new Metrics({
    namespace: 'TestNamespace',
    serviceName: 'test-service',
    defaultDimensions: options.defaultDimensions,
  })
}

describe('EmfMetricsCapture', () => {
  const metricsCapture = new EmfMetricsCapture()

  beforeEach(() => {
    metricsCapture.start()
  })

  afterEach(() => {
    metricsCapture.stop()
  })

  it('captures and asserts on simple metrics', () => {
    const metrics = createMetrics({ serviceName: 'test-service' })

    metrics.addMetric('TestMetric', MetricUnit.Count, 1)
    metrics.publishStoredMetrics()

    metricsCapture.expectMetric('TestMetric', 1)
  })

  it('captures and asserts on metrics with dimensions', () => {
    const metrics = createMetrics({ serviceName: 'test-service' })

    metrics.addDimension('Environment', 'test')
    metrics.addMetric('RequestCount', MetricUnit.Count, 5)
    metrics.publishStoredMetrics()

    metricsCapture.expectMetricWithDimensions('RequestCount', 5, { Environment: 'test' })
  })

  it('can assert on dimensions separately', () => {
    const metrics = createMetrics({ serviceName: 'test-service' })

    metrics.addDimension('Region', 'us-east-1')
    metrics.addMetric('DataProcessed', MetricUnit.Bytes, 1024)
    metrics.publishStoredMetrics()

    metricsCapture.expectDimension('Region', 'us-east-1')
    metricsCapture.expectMetric('DataProcessed', 1024)
  })

  it('can check if any EMF logs were emitted', () => {
    const metrics = createMetrics({ serviceName: 'test-service' })

    metrics.addMetric('SomeMetric', MetricUnit.Count, 1)
    metrics.publishStoredMetrics()

    metricsCapture.expectEmfLogsEmitted()
    expect(metricsCapture.getLogCount()).toBeGreaterThan(0)
  })

  it('provides helpful error messages when metrics not found', () => {
    const metrics = createMetrics({ serviceName: 'test-service' })

    metrics.addMetric('ActualMetric', MetricUnit.Count, 1)
    metrics.publishStoredMetrics()

    expect(() => {
      metricsCapture.expectMetric('NonExistentMetric', 1)
    }).toThrow('Expected to find metric "NonExistentMetric"')
  })
})
