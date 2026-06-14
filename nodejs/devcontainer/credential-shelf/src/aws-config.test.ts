import { describe, expect, it } from 'vitest'

import { renderAwsConfig } from './aws-config.js'
import { parseConfig } from './config.js'

const render = (yaml: string) => renderAwsConfig(parseConfig(yaml))

describe('renderAwsConfig', () => {
  it('renders sessions, grant profiles, and vends only aws-sso grants', () => {
    const { config, vendProfiles } = render(`
providers:
  - kind: aws-sso
    options:
      start_url: https://d-9067.awsapps.com/start/
    grants:
      - account_id: "0848"
        role: developer-ai-agent
  - kind: github-app
    options:
      app_id: "3967552"
      kms_key_id: alias/k
      signer:
        account_id: "2534"
        role: developer-tool-user
    grants:
      - name: twin-digital
        installation_id: "139"
`)
    expect(config).toContain('[sso-session sso]')
    expect(config).toContain('[profile 0848-developer-ai-agent]')
    // signer profile is in the config (for kms:Sign) ...
    expect(config).toContain('[profile 2534-developer-tool-user]')
    // ... but NOT on the shelf vend list (no kms:Sign leak).
    expect(vendProfiles).toEqual(['0848-developer-ai-agent'])
  })

  it('deduplicates a signer shared across multiple github-app providers', () => {
    const { config } = render(`
providers:
  - kind: aws-sso
    options: { start_url: https://x/ }
    grants: [ { account_id: "0848", role: agent } ]
  - kind: github-app
    options: { app_id: "1", kms_key_id: k, signer: { account_id: "2534", role: tool } }
    grants: [ { name: a, installation_id: "1" } ]
  - kind: github-app
    options: { app_id: "1", kms_key_id: k, signer: { account_id: "2534", role: tool } }
    grants: [ { name: b, installation_id: "2" } ]
`)
    expect(config.match(/\[profile 2534-tool\]/g)).toHaveLength(1)
  })

  it('throws when a github-app signer has no session and there is no aws-sso provider', () => {
    expect(() =>
      render(`
providers:
  - kind: github-app
    options: { app_id: "1", kms_key_id: k, signer: { account_id: "2", role: r } }
    grants: [ { name: a, installation_id: "1" } ]
`),
    ).toThrow(/needs an SSO session/)
  })
})
