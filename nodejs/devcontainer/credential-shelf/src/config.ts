import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'

import type { AwsGrant, AwsSsoProvider, GithubAppProvider, GithubGrant, Provider, VendConfig } from './types.js'

const DEFAULT_REGION = 'us-east-1'
const DEFAULT_SESSION = 'sso'

/** Narrow `unknown` to a plain object, or throw with the offending path. */
const asObject = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be a mapping`)
  }
  return value as Record<string, unknown>
}

/** Require a non-empty string at `path`. */
const requireString = (obj: Record<string, unknown>, key: string, path: string): string => {
  const value = obj[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path}.${key} is required and must be a non-empty string`)
  }
  return value
}

/** Optional string (absent → undefined). */
const optionalString = (obj: Record<string, unknown>, key: string, path: string): string | undefined => {
  const value = obj[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new Error(`${path}.${key} must be a string`)
  }
  return value
}

const parseAwsGrant = (raw: unknown, region: string, path: string): AwsGrant => {
  const obj = asObject(raw, path)
  const accountId = requireString(obj, 'account_id', path)
  const role = requireString(obj, 'role', path)
  return {
    accountId,
    role,
    name: optionalString(obj, 'name', path) ?? `${accountId}-${role}`,
    region: optionalString(obj, 'region', path) ?? region,
  }
}

const parseAwsProvider = (obj: Record<string, unknown>, path: string): AwsSsoProvider => {
  const options = asObject(obj.options, `${path}.options`)
  const region = optionalString(options, 'region', `${path}.options`) ?? DEFAULT_REGION
  const grantsRaw = obj.grants
  if (!Array.isArray(grantsRaw) || grantsRaw.length === 0) {
    throw new Error(`${path}.grants must be a non-empty list`)
  }
  return {
    kind: 'aws-sso',
    startUrl: requireString(options, 'start_url', `${path}.options`),
    region,
    session: optionalString(options, 'session', `${path}.options`) ?? DEFAULT_SESSION,
    grants: grantsRaw.map((g, i) => parseAwsGrant(g, region, `${path}.grants[${i}]`)),
  }
}

const parseGithubGrant = (raw: unknown, path: string): GithubGrant => {
  const obj = asObject(raw, path)
  const grant: GithubGrant = {
    name: requireString(obj, 'name', path),
    installationId: requireString(obj, 'installation_id', path),
  }
  if (obj.repos !== undefined) {
    if (!Array.isArray(obj.repos) || !obj.repos.every((r) => typeof r === 'string')) {
      throw new Error(`${path}.repos must be a list of strings`)
    }
    grant.repos = obj.repos
  }
  if (obj.perms !== undefined) {
    const permsObj = asObject(obj.perms, `${path}.perms`)
    const perms: Record<string, string> = {}
    for (const [key, value] of Object.entries(permsObj)) {
      if (typeof value !== 'string') {
        throw new Error(`${path}.perms.${key} must be a string`)
      }
      perms[key] = value
    }
    grant.perms = perms
  }
  return grant
}

const parseGithubProvider = (obj: Record<string, unknown>, path: string): GithubAppProvider => {
  const options = asObject(obj.options, `${path}.options`)
  const signer = asObject(options.signer, `${path}.options.signer`)
  const grantsRaw = obj.grants
  if (!Array.isArray(grantsRaw) || grantsRaw.length === 0) {
    throw new Error(`${path}.grants must be a non-empty list`)
  }
  return {
    kind: 'github-app',
    appId: requireString(options, 'app_id', `${path}.options`),
    kmsKeyId: requireString(options, 'kms_key_id', `${path}.options`),
    region: optionalString(options, 'region', `${path}.options`) ?? DEFAULT_REGION,
    signer: {
      accountId: requireString(signer, 'account_id', `${path}.options.signer`),
      role: requireString(signer, 'role', `${path}.options.signer`),
      ...(optionalString(signer, 'session', `${path}.options.signer`) !== undefined ?
        { session: optionalString(signer, 'session', `${path}.options.signer`) }
      : {}),
    },
    grants: grantsRaw.map((g, i) => parseGithubGrant(g, `${path}.grants[${i}]`)),
  }
}

const parseProvider = (raw: unknown, index: number): Provider => {
  const path = `providers[${index}]`
  const obj = asObject(raw, path)
  const kind = requireString(obj, 'kind', path)
  switch (kind) {
    case 'aws-sso':
      return parseAwsProvider(obj, path)
    case 'github-app':
      return parseGithubProvider(obj, path)
    default:
      throw new Error(`${path}.kind '${kind}' is not a known provider (expected aws-sso | github-app)`)
  }
}

/** Parse and validate `vend.yaml` text into a normalized config (pure; no I/O). */
export const parseConfig = (text: string): VendConfig => {
  const doc: unknown = parseYaml(text) ?? {}
  const root = asObject(doc, 'config')
  const providersRaw = root.providers ?? []
  if (!Array.isArray(providersRaw)) {
    throw new Error('providers must be a list')
  }
  return { providers: providersRaw.map(parseProvider) }
}

/** Read and parse the config file (default `/etc/credential-shelf/vend.yaml`). */
export const loadConfig = (path = process.env.VEND_CONFIG_FILE ?? '/etc/credential-shelf/vend.yaml'): VendConfig =>
  parseConfig(readFileSync(path, 'utf8'))
