import { describe, expect, it } from 'vitest'
import {
  imapAccountCredentialsSchema,
  imapAccountSettingsSchema,
  imapAccountSetupSchema,
  imapConnectionSecuritySchema,
} from './index.js'

const settings = { host: 'imap.example.net', port: 993, security: 'tls', username: 'sean@example.net' }
const folders = { arrival: 'INBOX', archived: 'Archive', trashed: 'Trash', spam: 'Junk' }

// --- what an IMAP Account is configured with (d-ioso3voc) -----------------

describe('imapAccountSettingsSchema', () => {
  it('takes the host, the port, how the connection is protected, and a username', () => {
    expect(imapAccountSettingsSchema.safeParse(settings).success).toBe(true)
  })

  it('offers encrypted-from-the-start and upgraded-after-connecting, and nothing else', () => {
    expect(imapConnectionSecuritySchema.options).toEqual(['tls', 'starttls'])
    expect(imapAccountSettingsSchema.safeParse({ ...settings, security: 'none' }).success).toBe(false)
  })

  it('refuses a port outside the range', () => {
    expect(imapAccountSettingsSchema.safeParse({ ...settings, port: 0 }).success).toBe(false)
    expect(imapAccountSettingsSchema.safeParse({ ...settings, port: 70000 }).success).toBe(false)
  })

  it('holds no password — the password is a stored credential', () => {
    const parsed = imapAccountSettingsSchema.parse({ ...settings, password: 'hunter2' })
    expect(parsed).not.toHaveProperty('password')
  })
})

// --- logging in is the authorization (d-fuln110d, d-r3ogwkv7) -------------

describe('imapAccountCredentialsSchema', () => {
  it('carries everything the login needs', () => {
    expect(imapAccountCredentialsSchema.safeParse({ ...settings, password: 'hunter2' }).success).toBe(true)
  })

  it('refuses a repair that restates the password alone', () => {
    expect(imapAccountCredentialsSchema.safeParse({ password: 'hunter2' }).success).toBe(false)
  })
})

// --- an Account begins when its folders are accepted (d-8jc4taom) ---------

describe('imapAccountSetupSchema', () => {
  it('creates an Account from the credentials and the accepted folders', () => {
    expect(imapAccountSetupSchema.safeParse({ ...settings, password: 'hunter2', folders }).success).toBe(true)
  })

  it('refuses a setup with no folders accepted', () => {
    expect(imapAccountSetupSchema.safeParse({ ...settings, password: 'hunter2' }).success).toBe(false)
  })
})
