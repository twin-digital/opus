import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { BookifyEngine, resolveConfig, validateConfig } from '@twin-digital/bookify'
import yaml from 'yaml'
import AdmZip from 'adm-zip'
import { withObservability, MetricUnit, type ObservabilityHandler, type Metrics } from '@twin-digital/observability-lib'
import {
  InvalidRequestReason,
  RenderErrorReason,
  getSizeCategory,
  type InvalidRequestReasonType,
} from './metrics-constants.js'
import {
  MAX_ZIP_SIZE,
  badRequest,
  serverError,
  formatSizeExceededMessage,
  checkContentLengthSize,
  checkBase64Size,
  checkBufferSize,
  validateRelativePaths,
  extractInvalidPath,
  extractConfigMetadata,
  getErrorMessage,
  type SizeCheckResult,
} from './render-utils.js'
import type { AsyncHandler } from '../../utils/types.js'

/**
 * Authorizer context passed by the Lambda authorizer
 */
interface AuthorizerContext {
  userId?: string
  keyId?: string
  scopes?: string
  rateLimitTier?: string
}

type RenderEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>

/**
 * Helper to record invalid request metric with appropriate dimensions
 */
function recordInvalidRequest(metrics: Metrics, reason: InvalidRequestReasonType, sizeBytes?: number): void {
  if (reason === InvalidRequestReason.SIZE_EXCEEDED && sizeBytes !== undefined) {
    metrics.addDimension('sizeCategory', getSizeCategory(sizeBytes))
  }
  metrics.addDimension('reason', reason)
  metrics.addMetric('RenderInvalidRequest', MetricUnit.Count, 1)
}

/**
 * Helper to record render error metric
 */
function recordRenderError(metrics: Metrics, reason: string): void {
  metrics.addDimension('reason', reason)
  metrics.addMetric('RenderError', MetricUnit.Count, 1)
}

/**
 * Handle size limit exceeded - logs warning and records metrics
 */
function handleSizeExceeded(
  logger: { warn: (message: string, context: Record<string, unknown>) => void },
  metrics: Metrics,
  result: Extract<SizeCheckResult, { exceeded: true }>,
): ReturnType<typeof badRequest> {
  logger.warn('Size limit exceeded', {
    sizeBytes: result.sizeBytes,
    limitBytes: MAX_ZIP_SIZE,
    method: result.method,
  })
  recordInvalidRequest(metrics, InvalidRequestReason.SIZE_EXCEEDED, result.sizeBytes)
  return badRequest(formatSizeExceededMessage(result.sizeBytes, result.method === 'base64-estimate'))
}

export const rawHandler: ObservabilityHandler<RenderEvent, APIGatewayProxyStructuredResultV2> = async (
  event,
  context,
) => {
  const { logger, metrics } = context
  const startTime = Date.now()

  // Extract userId from authorizer context for logging
  const userId = event.requestContext.authorizer.lambda.userId ?? 'anonymous'
  logger.appendKeys({ userId })

  // Check request method
  if (event.requestContext.http.method !== 'POST') {
    recordInvalidRequest(metrics, InvalidRequestReason.INVALID_METHOD)
    return badRequest('Method must be POST')
  }

  // Get the body
  if (!event.body) {
    recordInvalidRequest(metrics, InvalidRequestReason.MISSING_BODY)
    return badRequest('Request body is required')
  }

  // Fast fail: Check size from Content-Length header
  const contentLength = event.headers['content-length'] ?? event.headers['Content-Length']
  const contentLengthCheck = checkContentLengthSize(contentLength)
  if (contentLengthCheck.exceeded) {
    return handleSizeExceeded(logger, metrics, contentLengthCheck)
  }

  // Estimate from base64 string length if header not available
  if (!contentLength && event.isBase64Encoded) {
    const base64Check = checkBase64Size(event.body)
    if (base64Check.exceeded) {
      return handleSizeExceeded(logger, metrics, base64Check)
    }
  }

  // Decode body (may be base64 encoded)
  let bodyBuffer: Buffer
  try {
    bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'binary')
  } catch (error) {
    logger.error('Failed to decode request body', { error, isBase64Encoded: event.isBase64Encoded })
    recordRenderError(metrics, RenderErrorReason.MALFORMED_INPUT)
    return serverError('Failed to decode request body')
  }

  // Final verification (should rarely trigger due to checks above)
  const bufferCheck = checkBufferSize(bodyBuffer)
  if (bufferCheck.exceeded) {
    return handleSizeExceeded(logger, metrics, bufferCheck)
  }

  logger.debug('Received render request', {
    sizeBytes: bodyBuffer.length,
    contentLength: contentLength ?? 'unknown',
  })

  let tempDir: string | null = null

  try {
    // Parse zip file
    let zip: AdmZip
    try {
      zip = new AdmZip(bodyBuffer)
    } catch (error) {
      logger.debug('Failed to parse zip file', { error })
      recordRenderError(metrics, RenderErrorReason.MALFORMED_INPUT)
      return badRequest('Invalid zip file format')
    }

    // Check for .bookify.yml at root
    const configEntry = zip.getEntries().find((e) => e.entryName === '.bookify.yml')
    if (!configEntry) {
      recordInvalidRequest(metrics, InvalidRequestReason.MISSING_CONFIG)
      return badRequest('Zip file must contain a .bookify.yml file at the root')
    }

    // Parse YAML config
    let rawConfig: unknown
    try {
      rawConfig = yaml.parse(configEntry.getData().toString('utf-8')) as unknown
    } catch (error) {
      logger.debug('Failed to parse YAML config', { error })
      recordRenderError(metrics, RenderErrorReason.MALFORMED_INPUT)
      return badRequest('Invalid YAML in .bookify.yml')
    }

    // Validate paths are relative (security check)
    const pathError = validateRelativePaths(rawConfig)
    if (pathError) {
      const invalidPath = extractInvalidPath(pathError)
      logger.warn('Path traversal attempt detected', { invalidPath, userId })
      metrics.addMetric('RenderPathTraversalAttempt', MetricUnit.Count, 1)
      recordInvalidRequest(metrics, InvalidRequestReason.INVALID_PATH)
      return badRequest(pathError)
    }

    // Validate against schema
    if (!validateConfig(rawConfig)) {
      const errors = validateConfig.errors?.map((e) => `${e.instancePath} ${e.message}`).join(', ')
      logger.debug('Config validation failed', { errors })
      recordInvalidRequest(metrics, InvalidRequestReason.INVALID_CONFIG_SCHEMA)
      return badRequest(`Invalid .bookify.yml: ${errors}`)
    }

    const { inputCount, hasCustomCss } = extractConfigMetadata(rawConfig)
    logger.debug('Extracted config from zip', { inputCount, hasCustomCss })

    // Extract to temp directory
    try {
      tempDir = await mkdtemp(join(tmpdir(), 'bookify-'))
      zip.extractAllTo(tempDir, true)
    } catch (error) {
      logger.error('Failed to extract zip to temp directory', { error })
      recordRenderError(metrics, RenderErrorReason.INFRASTRUCTURE_ERROR)
      return serverError('Failed to process upload')
    }

    // Resolve config and render HTML
    const project = resolveConfig(rawConfig, tempDir)
    let html: string
    try {
      const engine = new BookifyEngine()
      html = await engine.renderHtml(project)
    } catch (error) {
      logger.error('Render failed', { error, stage: 'engine' })
      recordRenderError(metrics, RenderErrorReason.ENGINE_ERROR)
      return serverError(`Failed to render: ${getErrorMessage(error)}`)
    }

    // Success response
    const htmlBase64 = Buffer.from(html, 'utf-8').toString('base64')
    const durationMs = Date.now() - startTime
    const outputSizeKB = Math.round(html.length / 1024)

    logger.info('Render completed successfully', { inputCount, outputSizeKB, durationMs })

    metrics.addMetric('RenderSuccess', MetricUnit.Count, 1)
    metrics.addMetric('RenderDuration', MetricUnit.Milliseconds, durationMs)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: htmlBase64,
        requestId: context.awsRequestId,
      }),
    }
  } catch (error: unknown) {
    logger.error('Unexpected render error', { error, stage: 'unknown' })
    recordRenderError(metrics, RenderErrorReason.ENGINE_ERROR)
    return serverError(`Failed to render: ${getErrorMessage(error)}`)
  } finally {
    // Clean up temp directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch((err: unknown) => {
        logger.warn('Failed to clean up temp directory', { error: err, tempDir })
      })
    }
  }
}

export const handler: AsyncHandler<RenderEvent, APIGatewayProxyStructuredResultV2> = withObservability(rawHandler)
