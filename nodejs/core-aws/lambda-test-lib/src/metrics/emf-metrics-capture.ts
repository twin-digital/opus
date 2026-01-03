import type { MockInstance } from 'vitest'
import { vi } from 'vitest'

/**
 * Helper class for capturing and asserting EMF (Embedded Metric Format) metrics in tests
 *
 * AWS Lambda Powertools Metrics writes EMF logs to process.stdout. This helper
 * intercepts those writes, parses the JSON logs, and provides convenient assertion methods.
 *
 * @example
 * ```typescript
 * describe('my handler', () => {
 *   const metricsCapture = new EmfMetricsCapture()
 *
 *   beforeEach(() => {
 *     metricsCapture.start()
 *   })
 *
 *   afterEach(() => {
 *     metricsCapture.stop()
 *   })
 *
 *   it('emits correct metrics', async () => {
 *     await handler(event, context)
 *
 *     metricsCapture.expectMetric('OrderProcessed', 1)
 *     metricsCapture.expectDimension('OrderType', 'standard')
 *   })
 * })
 * ```
 */
export class EmfMetricsCapture {
  private stdoutSpy: MockInstance | null = null
  private capturedStdout: string[] = []
  private originalWrite: typeof process.stdout.write
  private suppressStdout: boolean

  /**
   * @param suppressStdout If true, EMF logs will not be printed to stdout (default: true)
   */
  constructor(suppressStdout = true) {
    this.originalWrite = process.stdout.write.bind(process.stdout)
    this.suppressStdout = suppressStdout
  }

  /**
   * Start capturing stdout to intercept EMF metrics
   * Call this in beforeEach()
   */
  start(): void {
    this.capturedStdout = []
    this.stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString()
      this.capturedStdout.push(str)
      if (!this.suppressStdout) {
        // Still write to actual stdout so we can see it in test output
        return this.originalWrite(chunk)
      }
      // Suppress output
      return true
    })
  }

  /**
   * Stop capturing and restore original stdout
   * Call this in afterEach()
   */
  stop(): void {
    this.stdoutSpy?.mockRestore()
    this.stdoutSpy = null
  }

  /**
   * Get all captured EMF logs as parsed objects
   */
  getEmfLogs(): Record<string, unknown>[] {
    return this.capturedStdout
      .map((str) => {
        try {
          const parsed = JSON.parse(str) as Record<string, unknown>
          // EMF logs have a special _aws field
          return parsed._aws !== undefined ? parsed : null
        } catch {
          return null
        }
      })
      .filter((log): log is Record<string, unknown> => log !== null)
  }

  /**
   * Get EMF logs that contain a specific metric name
   */
  getLogsWithMetric(metricName: string): Record<string, unknown>[] {
    return this.getEmfLogs().filter((log) => metricName in log)
  }

  /**
   * Assert that a metric with the given name and value was emitted
   *
   * @example
   * ```typescript
   * metricsCapture.expectMetric('OrderProcessed', 1)
   * metricsCapture.expectMetric('OrderValue', 99.99)
   * ```
   */
  expectMetric(metricName: string, expectedValue: number): void {
    const logs = this.getLogsWithMetric(metricName)

    if (logs.length === 0) {
      const allMetrics = this.getEmfLogs().map((log) => Object.keys(log).filter((k) => k !== '_aws'))
      throw new Error(
        `Expected to find metric "${metricName}" but found none. ` + `Available metrics: ${JSON.stringify(allMetrics)}`,
      )
    }

    const matchingLog = logs.find((log) => log[metricName] === expectedValue)

    if (!matchingLog) {
      const actualValues = logs.map((log) => log[metricName])
      throw new Error(
        `Expected metric "${metricName}" to have value ${expectedValue}, ` +
          `but found values: ${JSON.stringify(actualValues)}`,
      )
    }
  }

  /**
   * Assert that a dimension with the given name and value exists in at least one EMF log
   *
   * @example
   * ```typescript
   * metricsCapture.expectDimension('OrderType', 'standard')
   * metricsCapture.expectDimension('Region', 'us-east-1')
   * ```
   */
  expectDimension(dimensionName: string, expectedValue: string): void {
    const logs = this.getEmfLogs()

    const matchingLog = logs.find((log) => log[dimensionName] === expectedValue)

    if (!matchingLog) {
      const allDimensions = logs.map((log) =>
        Object.entries(log)
          .filter(([key]) => key !== '_aws' && typeof log[key] === 'string')
          .map(([key, value]) => `${key}=${String(value)}`),
      )
      throw new Error(
        `Expected to find dimension "${dimensionName}=${expectedValue}" ` +
          `but found: ${JSON.stringify(allDimensions)}`,
      )
    }
  }

  /**
   * Assert that a metric was emitted with specific dimensions
   *
   * @example
   * ```typescript
   * metricsCapture.expectMetricWithDimensions(
   *   'OrderProcessed',
   *   1,
   *   { OrderType: 'standard', Region: 'us-east-1' }
   * )
   * ```
   */
  expectMetricWithDimensions(metricName: string, expectedValue: number, dimensions: Record<string, string>): void {
    const logs = this.getLogsWithMetric(metricName)

    const matchingLog = logs.find((log) => {
      const hasMetric = log[metricName] === expectedValue
      const hasDimensions = Object.entries(dimensions).every(([key, value]) => log[key] === value)
      return hasMetric && hasDimensions
    })

    if (!matchingLog) {
      throw new Error(
        `Expected to find metric "${metricName}=${expectedValue}" with dimensions ${JSON.stringify(dimensions)}, ` +
          `but no matching log found. Captured ${logs.length} logs with this metric.`,
      )
    }
  }

  /**
   * Assert that at least one EMF log was captured
   */
  expectEmfLogsEmitted(): void {
    const logs = this.getEmfLogs()
    if (logs.length === 0) {
      throw new Error('Expected EMF logs to be emitted but none were captured')
    }
  }

  /**
   * Get the count of EMF logs captured
   */
  getLogCount(): number {
    return this.getEmfLogs().length
  }

  /**
   * Clear captured logs (useful between test cases if not using start/stop)
   */
  clear(): void {
    this.capturedStdout = []
  }
}
