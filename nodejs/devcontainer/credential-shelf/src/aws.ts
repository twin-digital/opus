import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { run, sleep, stderrOf } from './exec.js'
import { atomicWrite, log, shelfDir, statusOk, statusStalled } from './shelf.js'

const PREFIX = 'vend-aws'
const FIX = "run 'refresh-credentials' in this sidecar"
const REFRESH_BEFORE = Number(process.env.VEND_REFRESH_BEFORE ?? '900') // re-vend when < 15 min remain
const CHECK_INTERVAL = Number(process.env.VEND_CHECK_INTERVAL ?? '60')

export interface ExportedCreds {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  /** ISO 8601 expiry, if the credentials are temporary. */
  expiration?: string
}

export interface NamedCreds {
  name: string
  creds: ExportedCreds
}

const section = (name: string, c: ExportedCreds): string => {
  let s = `[${name}]\naws_access_key_id = ${c.accessKeyId}\naws_secret_access_key = ${c.secretAccessKey}\n`
  if (c.sessionToken !== undefined) {
    s += `aws_session_token = ${c.sessionToken}\n`
  }
  return `${s}\n`
}

/** Render the native shared-credentials file: `[default]` (the first entry) plus a section each. */
export const renderCredentialsFile = (entries: NamedCreds[]): string => {
  let out = ''
  entries.forEach((e, i) => {
    if (i === 0) {
      out += section('default', e.creds)
    }
    out += section(e.name, e.creds)
  })
  return out
}

/** Map `aws configure export-credentials` JSON (PascalCase) to our model. */
export const parseExportedCreds = (stdout: string): ExportedCreds => {
  const raw = JSON.parse(stdout) as Record<string, unknown>
  const accessKeyId = raw.AccessKeyId
  const secretAccessKey = raw.SecretAccessKey
  if (typeof accessKeyId !== 'string' || typeof secretAccessKey !== 'string') {
    throw new Error('export-credentials returned no AccessKeyId/SecretAccessKey')
  }
  return {
    accessKeyId,
    secretAccessKey,
    ...(typeof raw.SessionToken === 'string' ? { sessionToken: raw.SessionToken } : {}),
    ...(typeof raw.Expiration === 'string' ? { expiration: raw.Expiration } : {}),
  }
}

/** Earliest expiry across entries (ISO), or undefined if none are temporary. */
const earliestExpiry = (entries: NamedCreds[]): string | undefined => {
  const exps = entries.map((e) => e.creds.expiration).filter((x): x is string => x !== undefined)
  if (exps.length === 0) {
    return undefined
  }
  return exps.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b))
}

const awsDir = (): string => join(shelfDir(), 'aws')

const needsVend = (): boolean => {
  const expFile = join(awsDir(), 'expiration')
  if (!existsSync(expFile)) {
    return true
  }
  const exp = Date.parse(readFileSync(expFile, 'utf8').trim())
  if (Number.isNaN(exp)) {
    return true
  }
  return exp - Date.now() < REFRESH_BEFORE * 1000
}

/** Export each profile's STS creds and atomically write the shelf credentials file. */
export const vendAwsOnce = async (profiles: string[]): Promise<string | undefined> => {
  const entries: NamedCreds[] = []
  for (const name of profiles) {
    entries.push({
      name,
      creds: parseExportedCreds(await run('aws', ['configure', 'export-credentials', '--profile', name])),
    })
  }
  atomicWrite(join(awsDir(), 'credentials'), renderCredentialsFile(entries))
  const earliest = earliestExpiry(entries)
  atomicWrite(join(awsDir(), 'expiration'), `${earliest ?? 'unknown'}\n`)
  log(PREFIX, `vended ${profiles.length.toString()} profile(s) (earliest expiry ${earliest ?? 'unknown'})`)
  return earliest
}

/** Long-running AWS vend loop: re-vend as expiry nears; stamp health each tick. */
export const runAwsLoop = async (profiles: string[]): Promise<never> => {
  let stalledSince = ''
  log(
    PREFIX,
    `starting; vending [${profiles.join(' ')}] (refresh <${REFRESH_BEFORE.toString()}s, every ${CHECK_INTERVAL.toString()}s)`,
  )
  for (;;) {
    if (needsVend()) {
      try {
        const earliest = await vendAwsOnce(profiles)
        stalledSince = ''
        statusOk('aws', earliest)
      } catch (err) {
        log(PREFIX, `vend failed: ${stderrOf(err)}`)
        if (stalledSince === '') {
          stalledSince = new Date().toISOString()
        }
        statusStalled('aws', FIX, stalledSince)
      }
    } else {
      statusOk('aws', readFileSync(join(awsDir(), 'expiration'), 'utf8').trim())
    }
    await sleep(CHECK_INTERVAL * 1000)
  }
}
