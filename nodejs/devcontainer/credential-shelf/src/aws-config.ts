import type { VendConfig } from './types.js'

export interface RenderedAwsConfig {
  /** The `~/.aws/config` file contents. */
  config: string
  /** Profile names to vend onto the shelf (aws-sso grants only — never signers). */
  vendProfiles: string[]
}

const ssoSessionBlock = (name: string, startUrl: string, region: string): string =>
  `[sso-session ${name}]\n` +
  `sso_start_url = ${startUrl}\n` +
  `sso_region = ${region}\n` +
  `sso_registration_scopes = sso:account:access\n\n`

const profileBlock = (name: string, session: string, accountId: string, role: string, region: string): string =>
  `[profile ${name}]\n` +
  `sso_session = ${session}\n` +
  `sso_account_id = ${accountId}\n` +
  `sso_role_name = ${role}\n` +
  `region = ${region}\n\n`

/**
 * Render `~/.aws/config` from the config: one `[sso-session]` per distinct aws-sso session,
 * one `[profile]` per aws-sso grant, and one config-only `[profile]` per github-app signer.
 * The vend list is the aws-sso grants ONLY — signer profiles are written for `kms:Sign` but
 * never vended, so a `kms:Sign` credential never reaches the shelf.
 */
export const renderAwsConfig = (cfg: VendConfig): RenderedAwsConfig => {
  const sessionsSeen = new Set<string>()
  const profilesSeen = new Set<string>()
  const blocks: string[] = []
  const vendProfiles: string[] = []

  const firstSession = cfg.providers.find((p) => p.kind === 'aws-sso')?.session

  const emitProfile = (name: string, session: string, accountId: string, role: string, region: string): void => {
    if (profilesSeen.has(name)) {
      return
    }
    profilesSeen.add(name)
    blocks.push(profileBlock(name, session, accountId, role, region))
  }

  // Pass 1 — aws-sso sessions, grant profiles, and the shelf vend list.
  for (const p of cfg.providers) {
    if (p.kind !== 'aws-sso') {
      continue
    }
    if (!sessionsSeen.has(p.session)) {
      sessionsSeen.add(p.session)
      blocks.push(ssoSessionBlock(p.session, p.startUrl, p.region))
    }
    for (const g of p.grants) {
      emitProfile(g.name, p.session, g.accountId, g.role, g.region)
      vendProfiles.push(g.name)
    }
  }

  // Pass 2 — github-app signers: config-only profiles, never vended.
  for (const p of cfg.providers) {
    if (p.kind !== 'github-app') {
      continue
    }
    const session = p.signer.session ?? firstSession
    if (session === undefined) {
      throw new Error(
        'a github-app signer needs an SSO session — add an aws-sso provider or set options.signer.session',
      )
    }
    emitProfile(`${p.signer.accountId}-${p.signer.role}`, session, p.signer.accountId, p.signer.role, p.region)
  }

  return { config: blocks.join(''), vendProfiles }
}

/** The signer profile name for a github-app provider (must match what renderAwsConfig writes). */
export const signerProfileName = (accountId: string, role: string): string => `${accountId}-${role}`
