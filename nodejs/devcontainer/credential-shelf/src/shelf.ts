import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Root of the credentials shelf (overridable for tests). */
export const shelfDir = (): string => process.env.VEND_SHELF_DIR ?? '/creds'

/** The nodejs/devcontainer/docs/SECRETS.md token payload. */
export interface ShelfPayload {
  value: string
  expires_at: number | null
}

export const payload = (value: string, expiresAt: number | null): ShelfPayload => ({
  value,
  expires_at: expiresAt,
})

/** `ok expires=<iso|unknown>` health line. Accepts an epoch (seconds), ISO string, or undefined. */
export const statusOkLine = (expires?: number | string): string => {
  let iso = 'unknown'
  if (typeof expires === 'number') {
    iso = new Date(expires * 1000).toISOString()
  } else if (typeof expires === 'string' && expires.length > 0) {
    iso = expires
  }
  return `ok expires=${iso}\n`
}

export const statusStalledLine = (fix: string, since: string): string => `stalled since=${since} fix="${fix}"\n`

const timestamp = (): string => new Date().toISOString()

export const log = (prefix: string, ...msg: unknown[]): void => {
  process.stdout.write(`${timestamp()} ${prefix}: ${msg.join(' ')}\n`)
}

/** Write to a temp file in the destination's dir (mode 0600), then rename into place. */
export const atomicWrite = (dest: string, content: string): void => {
  const dir = dirname(dest)
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `.tmp.${process.pid.toString()}.${Math.trunc(performance.now()).toString()}`)
  writeFileSync(tmp, content, { mode: 0o600 })
  renameSync(tmp, dest)
}

/** Write the `{value, expires_at}` payload JSON atomically. */
export const writePayload = (dest: string, value: string, expiresAt: number | null): void => {
  atomicWrite(dest, JSON.stringify(payload(value, expiresAt)))
}

export const statusOk = (name: string, expires?: number | string): void => {
  atomicWrite(join(shelfDir(), 'status', name), statusOkLine(expires))
}

export const statusStalled = (name: string, fix: string, since: string): void => {
  atomicWrite(join(shelfDir(), 'status', name), statusStalledLine(fix, since))
}
