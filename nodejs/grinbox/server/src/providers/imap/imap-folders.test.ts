import { describe, expect, it } from 'vitest'
import type { ImapFolderListing } from './imap-client.js'
import { matchFolder, proposeFolders, standingOfFolder } from './imap-folders.js'
import type { AccountFolders } from './imap-settings.js'

/** A stock dovecot: roles for Drafts, Junk, Sent, Trash, and no archive (f-yj818owe). */
const STOCK_DOVECOT: ImapFolderListing[] = [
  { name: 'INBOX', roles: [] },
  { name: 'Drafts', roles: ['\\Drafts'] },
  { name: 'Junk', roles: ['\\Junk'] },
  { name: 'Sent', roles: ['\\Sent'] },
  { name: 'Trash', roles: ['\\Trash'] },
]

/** A hosted account advertising every role grinbox wants (f-33wb1igd). */
const HOSTED: ImapFolderListing[] = [
  ...STOCK_DOVECOT,
  { name: 'INBOX.Archive', roles: ['\\Archive'] },
  { name: 'INBOX.Receipts', roles: [] },
]

describe('proposeFolders (d-zxvkt95o, r-e40s6olu)', () => {
  it('takes each role from what the server advertises', () => {
    expect(proposeFolders(HOSTED)).toEqual({
      arrival: 'INBOX',
      archived: 'INBOX.Archive',
      trashed: 'Trash',
      spam: 'Junk',
    })
  })

  it('proposes no archive where the server advertises none and no customary name exists', () => {
    expect(proposeFolders(STOCK_DOVECOT)).toEqual({ arrival: 'INBOX', trashed: 'Trash', spam: 'Junk' })
  })

  it('falls back to a customary name where the role is not advertised', () => {
    const listings: ImapFolderListing[] = [...STOCK_DOVECOT, { name: 'Archive', roles: [] }]
    expect(proposeFolders(listings).archived).toBe('Archive')
  })

  it('proposes nothing at all for an account with no INBOX listed', () => {
    expect(proposeFolders([{ name: 'Mail', roles: [] }])).toEqual({})
  })
})

const FOLDERS: AccountFolders = { arrival: 'INBOX', archived: 'Archive', trashed: 'Trash', spam: 'Junk' }

describe('standingOfFolder (d-qstpa7y0)', () => {
  it('reads the arrival folder as present', () => {
    expect(standingOfFolder(FOLDERS, 'INBOX')).toBe('present')
  })

  it('reads the three named folders as their own standing', () => {
    expect(standingOfFolder(FOLDERS, 'Archive')).toBe('archived')
    expect(standingOfFolder(FOLDERS, 'Trash')).toBe('trashed')
    expect(standingOfFolder(FOLDERS, 'Junk')).toBe('spam')
  })

  it('records a message in none of the four as archived, never deleted', () => {
    expect(standingOfFolder(FOLDERS, 'INBOX.Receipts')).toBe('archived')
  })
})

describe('matchFolder (d-k8va629q)', () => {
  it('matches character for character', () => {
    expect(matchFolder(HOSTED, 'INBOX.Receipts')).toBe('INBOX.Receipts')
  })

  it('reads no hierarchy into the name and translates no separator', () => {
    expect(matchFolder(HOSTED, 'INBOX/Receipts')).toBeNull()
    expect(matchFolder(HOSTED, 'Receipts')).toBeNull()
  })

  it('does not match a different case', () => {
    expect(matchFolder(HOSTED, 'inbox.receipts')).toBeNull()
  })
})
