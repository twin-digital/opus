/** Runtime configuration, all from the environment (12-factor; nothing baked). */
export interface TriggerConfig {
  /** Interface to bind inside the container. LAN-restriction is the consumer's port mapping. */
  host: string
  port: number
  /** Shared bearer secret required on every privileged request. */
  token: string
  /** The credential-shelf sidecar's refresh Unix socket (shared-volume path). */
  upstreamSocket: string
  /** Minimum seconds between accepted triggers (token-bucket refill rate). */
  rateLimitIntervalSec: number
  /** Token-bucket burst size. */
  rateLimitBurst: number
}

const DEFAULT_PORT = 8770
const DEFAULT_UPSTREAM_SOCKET = '/run/credential-shelf/refresh.sock'
const DEFAULT_RATE_INTERVAL_SEC = 30
const DEFAULT_RATE_BURST = 1

const parseListen = (value: string | undefined): { host: string; port: number } => {
  if (value === undefined || value.length === 0) {
    return { host: '0.0.0.0', port: DEFAULT_PORT }
  }
  // host:port, or a bare port, or a bare host.
  const lastColon = value.lastIndexOf(':')
  if (lastColon === -1) {
    const bare = Number(value)
    return Number.isInteger(bare) ? { host: '0.0.0.0', port: bare } : { host: value, port: DEFAULT_PORT }
  }
  const host = value.slice(0, lastColon)
  const port = Number(value.slice(lastColon + 1))
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`TRIGGER_LISTEN has an invalid port: '${value}'`)
  }
  return { host: host.length > 0 ? host : '0.0.0.0', port }
}

const positiveNumber = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw.length === 0) {
    return fallback
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number; got '${raw}'`)
  }
  return n
}

/** Load config from the environment, failing closed if the auth token is missing. */
export const loadTriggerConfig = (env: NodeJS.ProcessEnv = process.env): TriggerConfig => {
  const token = env.TRIGGER_TOKEN
  if (token === undefined || token.length === 0) {
    throw new Error('TRIGGER_TOKEN is required (the shared bearer secret); refusing to start without auth')
  }
  const { host, port } = parseListen(env.TRIGGER_LISTEN)
  return {
    host,
    port,
    token,
    upstreamSocket: env.TRIGGER_UPSTREAM_SOCKET ?? DEFAULT_UPSTREAM_SOCKET,
    rateLimitIntervalSec: positiveNumber(
      env.TRIGGER_RATE_LIMIT_INTERVAL_SEC,
      DEFAULT_RATE_INTERVAL_SEC,
      'TRIGGER_RATE_LIMIT_INTERVAL_SEC',
    ),
    rateLimitBurst: positiveNumber(env.TRIGGER_RATE_LIMIT_BURST, DEFAULT_RATE_BURST, 'TRIGGER_RATE_LIMIT_BURST'),
  }
}
