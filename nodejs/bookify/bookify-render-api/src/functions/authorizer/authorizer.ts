import { createHash } from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayRequestAuthorizerEventV2, APIGatewaySimpleAuthorizerWithContextResult } from 'aws-lambda'
import { withObservability, MetricUnit, type ObservabilityHandler } from '@twin-digital/observability-lib'
import type { AsyncHandler } from '../../utils/types.js'

/**
 * Create a safe, deterministic fingerprint of an API key for logging
 * Never log the full key - use this fingerprint for correlation/debugging
 */
function fingerprintKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

/**
 * API Gateway HTTP API Lambda Authorizer (Simple Response Format)
 *
 * Validates API keys stored in DynamoDB and returns authorization context
 * that downstream Lambdas can access via event.requestContext.authorizer.lambda
 */

export interface AuthorizerContext {
  userId: string
  keyId: string
  scopes: string
  rateLimitTier: string
}

interface ApiKeyRecord {
  keyId: string
  userId: string
  scopes: string[]
  rateLimitTier: string
  revoked: boolean
  createdAt: string
}

/**
 * DynamoDB item structure for API keys
 * All fields are optional since DynamoDB doesn't enforce schema
 */
interface DynamoApiKeyItem {
  keyId?: string
  userId?: string
  scopes?: string[] // Native DynamoDB List
  rateLimitTier?: string
  revoked?: boolean
  createdAt?: string
}

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

/**
 * Extract API key from Authorization header
 * Supports: "Bearer <key>" or just "<key>"
 */
function extractApiKey(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  // Allow raw API key for simpler integrations
  return authHeader
}

/**
 * Look up API key in DynamoDB
 */
async function getApiKey(keyId: string): Promise<ApiKeyRecord | null> {
  // Read table name at runtime to support test env stubbing
  const TABLE_NAME = process.env.API_KEYS_TABLE ?? ''
  const result = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { keyId },
    }),
  )

  const item = result.Item as DynamoApiKeyItem | undefined
  if (!item) {
    return null
  }

  return {
    keyId: item.keyId ?? '',
    userId: item.userId ?? '',
    scopes: item.scopes ?? [],
    rateLimitTier: item.rateLimitTier ?? 'free',
    revoked: item.revoked ?? false,
    createdAt: item.createdAt ?? '',
  }
}

// Export for testing - tests should provide mock observability context
export const rawHandler: ObservabilityHandler<
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>
> = async (event, context) => {
  // Access logger and metrics injected by observability middleware
  const { logger, metrics } = context

  // API Gateway normalizes headers to lowercase
  const authHeader = event.headers?.authorization
  const apiKey = extractApiKey(authHeader)

  if (!apiKey) {
    // Don't log - missing keys are expected from bots/scanners and create noise
    return {
      isAuthorized: false,
      context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
    }
  }

  try {
    const keyRecord = await getApiKey(apiKey)

    if (!keyRecord) {
      // DEBUG: Invalid keys are expected from bad actors/mistakes - log fingerprint only
      logger.debug('API key not found', { keyFingerprint: fingerprintKey(apiKey) })
      return {
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      }
    }

    if (keyRecord.revoked) {
      // WARN: Revoked key usage is a security event worth investigating
      logger.warn('Revoked API key used', { keyFingerprint: fingerprintKey(keyRecord.keyId), userId: keyRecord.userId })
      metrics.addMetric('AuthDeniedRevoked', MetricUnit.Count, 1)
      return {
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      }
    }

    // Return context that downstream Lambdas can access
    // Note: API Gateway context values must be strings, so serialize scopes array
    return {
      isAuthorized: true,
      context: {
        userId: keyRecord.userId,
        keyId: keyRecord.keyId,
        scopes: JSON.stringify(keyRecord.scopes),
        rateLimitTier: keyRecord.rateLimitTier,
      },
    }
  } catch (error) {
    logger.error('Authorizer error', { error })
    metrics.addMetric('AuthError', MetricUnit.Count, 1)
    return {
      isAuthorized: false,
      context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
    }
  }
}

export const handler: AsyncHandler<
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>
> = withObservability(rawHandler, {
  skipTracing: true, // Authorizers are fast, skip X-Ray overhead
})
