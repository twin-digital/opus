/** Normalized configuration model (defaults applied) parsed from `vend.yaml`. */

/** One AWS role to vend, rendered as a `[profile]` and (unless config-only) onto the shelf. */
export interface AwsGrant {
  /** Shelf profile name; defaults to `<accountId>-<role>`. */
  name: string
  accountId: string
  role: string
  /** Profile region; defaults to the provider's region. */
  region: string
}

/** An IAM Identity Center instance and the roles it vends. */
export interface AwsSsoProvider {
  kind: 'aws-sso'
  startUrl: string
  /** SSO region; defaults to `us-east-1`. */
  region: string
  /** `[sso-session]` name; defaults to `sso`. */
  session: string
  grants: AwsGrant[]
}

/** One scoped installation token to mint → `/creds/github/<name>`. */
export interface GithubGrant {
  /** Shelf filename (conventionally the org). */
  name: string
  installationId: string
  /** Narrow to these repos; omit for all installed. */
  repos?: string[]
  /** Narrow these permissions; omit for the App's full grant. */
  perms?: Record<string, string>
}

/** The AWS identity holding `kms:Sign` on the App key (config-only, never shelved). */
export interface GithubSigner {
  accountId: string
  role: string
  /** SSO session backing the signer profile; defaults to the first aws-sso session. */
  session?: string
}

/** A GitHub App installation set — one App, N per-installation grants. */
export interface GithubAppProvider {
  kind: 'github-app'
  appId: string
  kmsKeyId: string
  /** KMS region; defaults to `us-east-1`. */
  region: string
  signer: GithubSigner
  grants: GithubGrant[]
}

export type Provider = AwsSsoProvider | GithubAppProvider

export interface VendConfig {
  providers: Provider[]
}
