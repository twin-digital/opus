/**
 * Consolidated reason codes for invalid render requests
 * Used as dimension values for RenderInvalidRequest metric
 */
export const InvalidRequestReason = {
  INVALID_CONFIG_SCHEMA: 'InvalidConfigSchema',
  INVALID_METHOD: 'InvalidMethod',
  INVALID_PATH: 'InvalidPath', // Security-critical
  MISSING_BODY: 'MissingBody',
  MISSING_CONFIG: 'MissingConfig',
  SIZE_EXCEEDED: 'SizeExceeded',
} as const

export type InvalidRequestReasonType = (typeof InvalidRequestReason)[keyof typeof InvalidRequestReason]

/**
 * Size category buckets for oversized uploads
 * Used as optional dimension when reason=SizeExceeded
 */
export const SizeCategory = {
  FIVE_TO_TEN: '5-10MB',
  TEN_TO_TWENTY: '10-20MB',
  TWENTY_TO_FIFTY: '20-50MB',
  FIFTY_PLUS: '50MB+',
} as const

export type SizeCategoryType = (typeof SizeCategory)[keyof typeof SizeCategory]

/**
 * Consolidated reason codes for render errors (after validation passes)
 * Used as dimension values for RenderError metric
 */
export const RenderErrorReason = {
  // Service errors (bookify engine itself)
  ENGINE_ERROR: 'EngineError', // pandoc crashes, rendering failures
  // Infrastructure errors (our Lambda/AWS environment)
  INFRASTRUCTURE_ERROR: 'InfrastructureError', // disk, memory, /tmp issues
  // User errors (bad input that passed initial validation)
  MALFORMED_INPUT: 'MalformedInput', // zip or yaml parse failed
  // Timeout (separate because remediation is different)
  TIMEOUT: 'Timeout',
} as const

export type RenderErrorReasonType = (typeof RenderErrorReason)[keyof typeof RenderErrorReason]

/**
 * Determine size category bucket for a given size in bytes
 */
export function getSizeCategory(sizeBytes: number): SizeCategoryType {
  const sizeMB = sizeBytes / (1024 * 1024)
  if (sizeMB <= 10) {
    return SizeCategory.FIVE_TO_TEN
  }
  if (sizeMB <= 20) {
    return SizeCategory.TEN_TO_TWENTY
  }
  if (sizeMB <= 50) {
    return SizeCategory.TWENTY_TO_FIFTY
  }
  return SizeCategory.FIFTY_PLUS
}
