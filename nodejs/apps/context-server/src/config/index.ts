import { config as loadEnv } from 'dotenv'

loadEnv()

const parseIntEnv = (name: string, fallback: number) => {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export const PORT = parseIntEnv('PORT', 3000)
export const MAX_CHUNKS = Math.min(100, Math.max(1, parseIntEnv('MAX_CHUNKS', 100)))
export const MAX_QUERY_LENGTH = Math.max(1, parseIntEnv('MAX_QUERY_LENGTH', 4096))

if (!process.env.JWT_SECRET) {
  // Fail fast — require a secret for auth
  throw new Error('Missing required env var: JWT_SECRET')
}

export const JWT_SECRET = process.env.JWT_SECRET
export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'

export default {
  PORT,
  MAX_CHUNKS,
  MAX_QUERY_LENGTH,
  JWT_SECRET,
  LOG_LEVEL,
}
