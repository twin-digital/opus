import { describe, expect, it } from 'vitest'

import { parseConfig } from './config.js'
import type { AwsSsoProvider, GithubAppProvider } from './types.js'

describe('parseConfig', () => {
  it('returns no providers for empty config', () => {
    expect(parseConfig('providers: []')).toEqual({ providers: [] })
    expect(parseConfig('')).toEqual({ providers: [] })
  })

  it('parses an aws-sso provider and defaults name/region/session', () => {
    const cfg = parseConfig(`
providers:
  - kind: aws-sso
    options:
      start_url: https://d-x.awsapps.com/start/
    grants:
      - account_id: "0848"
        role: developer-ai-agent
      - account_id: "0848"
        role: view-only
        name: readonly
        region: us-west-2
`)
    const p = cfg.providers[0] as AwsSsoProvider
    expect(p.region).toBe('us-east-1')
    expect(p.session).toBe('sso')
    expect(p.grants[0]).toEqual({
      accountId: '0848',
      role: 'developer-ai-agent',
      name: '0848-developer-ai-agent',
      region: 'us-east-1',
    })
    expect(p.grants[1]).toMatchObject({ name: 'readonly', region: 'us-west-2' })
  })

  it('parses a github-app provider with installation_id per grant', () => {
    const cfg = parseConfig(`
providers:
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
        repos: [aws, opus]
        perms: { contents: read }
      - name: skleinjung
        installation_id: "140"
`)
    const p = cfg.providers[0] as GithubAppProvider
    expect(p.region).toBe('us-east-1')
    expect(p.signer).toEqual({ accountId: '2534', role: 'developer-tool-user' })
    expect(p.grants[0]).toEqual({
      name: 'twin-digital',
      installationId: '139',
      repos: ['aws', 'opus'],
      perms: { contents: 'read' },
    })
    expect(p.grants[1]).toEqual({ name: 'skleinjung', installationId: '140' })
  })

  it('rejects an unknown kind', () => {
    expect(() => parseConfig('providers:\n  - kind: gitlab\n    options: {}\n    grants: []')).toThrow(
      /not a known provider/,
    )
  })

  it('rejects a missing required field with a path', () => {
    expect(() =>
      parseConfig(
        'providers:\n  - kind: aws-sso\n    options: {}\n    grants:\n      - account_id: "1"\n        role: r',
      ),
    ).toThrow(/providers\[0\]\.options\.start_url is required/)
  })

  it('rejects a github grant missing installation_id', () => {
    expect(() =>
      parseConfig(`
providers:
  - kind: github-app
    options: { app_id: "1", kms_key_id: k, signer: { account_id: "2", role: r } }
    grants:
      - name: org-without-install
`),
    ).toThrow(/installation_id is required/)
  })
})
