import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { withObservability, type ObservabilityHandler } from '@twin-digital/observability-lib'
import type { AsyncHandler } from '../../utils/types.js'

// Read version from package.json at module load time
const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJsonPath = join(__dirname, '../../../package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string }

// Get pandoc version at module load time
const getPandocVersion = (): string => {
  try {
    const output = execSync('pandoc --version', { encoding: 'utf-8' })
    // Parse "pandoc 3.8.3" from first line
    const match = /^pandoc\s+(\d+\.\d+\.\d+)/m.exec(output)
    return match?.[1] ?? 'unknown'
  } catch {
    return 'unavailable'
  }
}

const pandocVersion = getPandocVersion()

export const rawHandler: ObservabilityHandler<APIGatewayProxyEventV2, APIGatewayProxyResultV2> = () => {
  return Promise.resolve({
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiVersion: packageJson.version ?? 'unknown',
      pandocVersion,
    }),
  })
}

export const handler: AsyncHandler<APIGatewayProxyEventV2, APIGatewayProxyResultV2> = withObservability(rawHandler, {
  skipTracing: true, // Simple health check, skip X-Ray overhead
})
