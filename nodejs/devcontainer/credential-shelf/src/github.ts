import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run, sleep, stderrOf } from './exec.js'
import { log, shelfDir, statusOk, statusStalled, writePayload } from './shelf.js'
import type { GithubGrant } from './types.js'

const PREFIX = 'vend-github'
const FIX = "run 'refresh-credentials' in this sidecar"
const REFRESH_BEFORE = Number(process.env.VEND_GH_REFRESH_BEFORE ?? '600') // re-mint when < 10 min remain
const CHECK_INTERVAL = Number(process.env.VEND_CHECK_INTERVAL ?? '60')

/** What a single github-app grant needs to mint, resolved from its provider. */
export interface GithubVendTarget {
  appId: string
  kmsKeyId: string
  region: string
  /** `~/.aws/config` profile holding kms:Sign (the signer). */
  signerProfile: string
  grant: GithubGrant
}

export interface TokenRequest {
  repositories?: string[]
  permissions?: Record<string, string>
}

/** The `header.payload` half of an RS256 App JWT (base64url), before the KMS signature. */
export const jwtSigningInput = (appId: string, nowSec: number): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 480, iss: appId })).toString('base64url')
  return `${header}.${payload}`
}

/** Installation-token request body — only the fields that narrow scope (omitted → full grant). */
export const tokenRequestBody = (grant: GithubGrant): TokenRequest => {
  const body: TokenRequest = {}
  if (grant.repos !== undefined) {
    body.repositories = grant.repos
  }
  if (grant.perms !== undefined) {
    body.permissions = grant.perms
  }
  return body
}

/** Sign the JWT input with the App's KMS key (key never leaves KMS) and assemble the JWT. */
const signJwt = async (signingInput: string, target: GithubVendTarget): Promise<string> => {
  const tmp = join(tmpdir(), `cs-jwt-${process.pid.toString()}-${Math.trunc(performance.now()).toString()}`)
  writeFileSync(tmp, signingInput)
  try {
    const sigB64 = (
      await run('aws', [
        'kms',
        'sign',
        '--profile',
        target.signerProfile,
        '--region',
        target.region,
        '--key-id',
        target.kmsKeyId,
        '--message',
        `fileb://${tmp}`,
        '--message-type',
        'RAW',
        '--signing-algorithm',
        'RSASSA_PKCS1_V1_5_SHA_256',
        '--query',
        'Signature',
        '--output',
        'text',
      ])
    ).trim()
    const sig = Buffer.from(sigB64, 'base64').toString('base64url')
    return `${signingInput}.${sig}`
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* temp file already gone */
    }
  }
}

interface AccessTokenResponse {
  token?: string
  expires_at?: string
  message?: string
}

const exchangeToken = async (
  jwt: string,
  installationId: string,
  body: TokenRequest,
): Promise<{ token: string; expiresAt?: string }> => {
  const resp = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  })
  // Only ever read .message on failure — never echo a success body (it holds the token).
  const json = (await resp.json()) as AccessTokenResponse
  if (resp.status !== 201) {
    throw new Error(`GitHub ${resp.status.toString()}: ${json.message ?? 'unknown error'}`)
  }
  if (json.token === undefined) {
    throw new Error('no token in response')
  }
  return { token: json.token, ...(json.expires_at !== undefined ? { expiresAt: json.expires_at } : {}) }
}

/** Mint one scoped installation token and write it to `/creds/github/<name>`. Returns expiry epoch. */
export const vendGithubOnce = async (target: GithubVendTarget): Promise<number> => {
  const now = Math.floor(Date.now() / 1000)
  const jwt = await signJwt(jwtSigningInput(target.appId, now), target)
  const { token, expiresAt } = await exchangeToken(jwt, target.grant.installationId, tokenRequestBody(target.grant))
  const expEpoch = expiresAt !== undefined ? Math.floor(Date.parse(expiresAt) / 1000) : now + 3600
  writePayload(join(shelfDir(), 'github', target.grant.name), token, expEpoch)
  log(`${PREFIX}[${target.grant.name}]`, `vended (expires ${expiresAt ?? 'in ~1h'})`)
  return expEpoch
}

const needsVend = (name: string): boolean => {
  const file = join(shelfDir(), 'github', name)
  if (!existsSync(file)) {
    return true
  }
  try {
    const { expires_at: exp } = JSON.parse(readFileSync(file, 'utf8')) as { expires_at?: number }
    if (typeof exp !== 'number' || exp <= 0) {
      return true
    }
    return exp - Math.floor(Date.now() / 1000) < REFRESH_BEFORE
  } catch {
    return true
  }
}

/** Long-running vend loop for one grant. */
export const runGithubLoop = async (target: GithubVendTarget): Promise<never> => {
  const { name } = target.grant
  const statusName = `github-${name}`
  let stalledSince = ''
  log(`${PREFIX}[${name}]`, `starting (refresh <${REFRESH_BEFORE.toString()}s, every ${CHECK_INTERVAL.toString()}s)`)
  for (;;) {
    if (needsVend(name)) {
      try {
        const exp = await vendGithubOnce(target)
        stalledSince = ''
        statusOk(statusName, exp)
      } catch (err) {
        log(`${PREFIX}[${name}]`, `vend failed: ${stderrOf(err)}`)
        if (stalledSince === '') {
          stalledSince = new Date().toISOString()
        }
        statusStalled(statusName, FIX, stalledSince)
      }
    }
    await sleep(CHECK_INTERVAL * 1000)
  }
}
