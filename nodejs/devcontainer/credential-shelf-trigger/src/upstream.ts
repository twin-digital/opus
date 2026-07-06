import { request } from 'node:http'

export interface UpstreamResponse {
  status: number
  body: unknown
}

/**
 * Speak HTTP to the credential-shelf sidecar over its refresh Unix socket. The sidecar's
 * `POST /refresh` resolves as soon as the device-code prompt is parsed (a couple seconds),
 * so a generous timeout covers the sidecar's own prompt-parse window without hanging forever.
 */
export type UpstreamClient = (method: string, path: string) => Promise<UpstreamResponse>

const DEFAULT_TIMEOUT_MS = 45_000

export const createUpstreamClient =
  (socketPath: string, timeoutMs = DEFAULT_TIMEOUT_MS): UpstreamClient =>
  (method, path) =>
    new Promise<UpstreamResponse>((resolve, reject) => {
      const req = request({ socketPath, method, path, timeout: timeoutMs }, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on('end', () => {
          let body: unknown
          try {
            body = data.length > 0 ? JSON.parse(data) : undefined
          } catch {
            body = undefined
          }
          resolve({ status: res.statusCode ?? 0, body })
        })
      })
      req.on('timeout', () => {
        req.destroy(new Error('credential-shelf refresh socket timed out'))
      })
      req.on('error', reject)
      req.end()
    })
