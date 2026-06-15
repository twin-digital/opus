import { describe, expect, it } from 'vitest'

import { parseExportedCreds, renderCredentialsFile } from './aws.js'

describe('renderCredentialsFile', () => {
  it('makes the first entry the [default] and writes a section per profile', () => {
    const out = renderCredentialsFile([
      { name: 'agent', creds: { accessKeyId: 'AK1', secretAccessKey: 'S1', sessionToken: 'T1' } },
      { name: 'readonly', creds: { accessKeyId: 'AK2', secretAccessKey: 'S2', sessionToken: 'T2' } },
    ])
    expect(out).toContain('[default]\naws_access_key_id = AK1\naws_secret_access_key = S1\naws_session_token = T1\n')
    expect(out).toContain('[agent]\naws_access_key_id = AK1')
    expect(out).toContain('[readonly]\naws_access_key_id = AK2')
    // exactly one [default]
    expect(out.match(/\[default\]/g)).toHaveLength(1)
  })

  it('omits the session token line for long-term creds', () => {
    const out = renderCredentialsFile([{ name: 'p', creds: { accessKeyId: 'AK', secretAccessKey: 'S' } }])
    expect(out).not.toContain('aws_session_token')
  })
})

describe('parseExportedCreds', () => {
  it('maps the export-credentials JSON (PascalCase) to our model', () => {
    const json = JSON.stringify({
      Version: 1,
      AccessKeyId: 'AK',
      SecretAccessKey: 'S',
      SessionToken: 'T',
      Expiration: '2026-06-14T16:00:00Z',
    })
    expect(parseExportedCreds(json)).toEqual({
      accessKeyId: 'AK',
      secretAccessKey: 'S',
      sessionToken: 'T',
      expiration: '2026-06-14T16:00:00Z',
    })
  })

  it('throws when the keys are missing', () => {
    expect(() => parseExportedCreds('{"Version":1}')).toThrow(/AccessKeyId/)
  })
})
