/**
 * Pure utility functions for the render-html Lambda handler.
 * These functions have no side effects and can be easily tested in isolation.
 */

import { isRelativePath } from '../../utils/path-validation.js'

/** Maximum allowed zip file size in bytes (5 MB) */
export const MAX_ZIP_SIZE = 5 * 1024 * 1024

/**
 * Standard JSON error response structure
 */
export interface ErrorResponse {
  statusCode: number
  body: string
  headers: { 'Content-Type': string }
}

/**
 * Create a 400 Bad Request response
 */
export const badRequest = (message: string): ErrorResponse => ({
  statusCode: 400,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: message }),
})

/**
 * Create a 500 Server Error response
 */
export const serverError = (message: string): ErrorResponse => ({
  statusCode: 500,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: message }),
})

/**
 * Format a size-exceeded error message
 */
export function formatSizeExceededMessage(sizeBytes: number, estimated = false): string {
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2)
  return estimated ?
      `Zip file exceeds maximum size of 5MB (estimated ${sizeMB}MB)`
    : `Zip file exceeds maximum size of 5MB (received ${sizeMB}MB)`
}

/**
 * Result of checking request body size
 */
export type SizeCheckResult =
  | { exceeded: true; sizeBytes: number; method: 'content-length' | 'base64-estimate' | 'decoded-buffer' }
  | { exceeded: false }

/**
 * Check if request size exceeds the maximum from Content-Length header
 */
export function checkContentLengthSize(contentLength: string | undefined): SizeCheckResult {
  if (!contentLength) {
    return { exceeded: false }
  }
  const size = parseInt(contentLength, 10)
  if (size > MAX_ZIP_SIZE) {
    return { exceeded: true, sizeBytes: size, method: 'content-length' }
  }
  return { exceeded: false }
}

/**
 * Estimate decoded size from base64 string length
 */
export function estimateBase64Size(base64Body: string): number {
  // Base64 encodes 3 bytes as 4 characters
  // Remove padding chars to get more accurate estimate
  const base64Length = base64Body.replace(/=/g, '').length
  return (base64Length * 3) / 4
}

/**
 * Check if estimated base64 size exceeds the maximum
 */
export function checkBase64Size(body: string): SizeCheckResult {
  const estimatedSize = estimateBase64Size(body)
  if (estimatedSize > MAX_ZIP_SIZE) {
    return { exceeded: true, sizeBytes: estimatedSize, method: 'base64-estimate' }
  }
  return { exceeded: false }
}

/**
 * Check if decoded buffer size exceeds the maximum
 */
export function checkBufferSize(buffer: Buffer): SizeCheckResult {
  if (buffer.length > MAX_ZIP_SIZE) {
    return { exceeded: true, sizeBytes: buffer.length, method: 'decoded-buffer' }
  }
  return { exceeded: false }
}

/**
 * Validates that all paths in the bookify config are relative.
 *
 * This is a security check to prevent path traversal attacks where
 * a malicious config could reference files outside the project directory.
 *
 * @param config - The parsed bookify configuration object
 * @returns An error message if validation fails, null if valid
 */
export function validateRelativePaths(config: unknown): string | null {
  if (typeof config !== 'object' || config === null) {
    return 'Config must be an object'
  }

  const cfg = config as Record<string, unknown>

  // Check assetPaths
  if (cfg.assetPaths !== undefined) {
    const paths = Array.isArray(cfg.assetPaths) ? cfg.assetPaths : [cfg.assetPaths]
    for (const p of paths) {
      if (typeof p === 'string' && !isRelativePath(p)) {
        return `assetPaths contains non-relative path: ${p}`
      }
    }
  }

  // Check css (allow pkg:// protocol for built-in styles)
  if (Array.isArray(cfg.css)) {
    for (const p of cfg.css) {
      if (typeof p === 'string' && !p.startsWith('pkg://') && !isRelativePath(p)) {
        return `css contains non-relative path: ${p}`
      }
    }
  }

  // Check inputs
  if (Array.isArray(cfg.inputs)) {
    for (const p of cfg.inputs) {
      if (typeof p === 'string' && !isRelativePath(p)) {
        return `inputs contains non-relative path: ${p}`
      }
    }
  }

  return null
}

/**
 * Extract the invalid path from a validation error message.
 * Used for security logging when path traversal is detected.
 */
export function extractInvalidPath(errorMessage: string): string {
  const pathMatch = /path: (.+)$/.exec(errorMessage)
  return pathMatch?.[1] ?? 'unknown'
}

/**
 * Extract config metadata for logging purposes
 */
export function extractConfigMetadata(config: unknown): { inputCount: number; hasCustomCss: boolean } {
  if (typeof config !== 'object' || config === null) {
    return { inputCount: 0, hasCustomCss: false }
  }

  const cfg = config as Record<string, unknown>
  const inputCount = Array.isArray(cfg.inputs) ? cfg.inputs.length : 0
  const hasCustomCss = Array.isArray(cfg.css) && cfg.css.length > 0

  return { inputCount, hasCustomCss }
}

/**
 * Safely extract an error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
