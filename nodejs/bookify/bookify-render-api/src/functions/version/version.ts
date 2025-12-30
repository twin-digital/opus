import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda'

// Read version from package.json at module load time
const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJsonPath = join(__dirname, '../../package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string }

export const handler = (_event: APIGatewayProxyEventV2, _context: Context): Promise<APIGatewayProxyResultV2> => {
  return Promise.resolve({
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiVersion: packageJson.version ?? 'unknown',
    }),
  })
}
