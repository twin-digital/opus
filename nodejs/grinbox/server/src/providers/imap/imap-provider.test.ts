import type { AccountFolders } from '@grinbox/shared'
import { describe, expect, it } from 'vitest'
import type { ProviderAccount } from '../provider.js'
import type { ImapLocation, ImapMessageStore, UnidentifiedMessage } from './imap-message-store.js'
import { headerValue } from './imap-message-store.js'
import {
  DEFAULT_FIRST_POLL_WINDOW,
  ImapMessageNotFoundError,
  ImapProvider,
  cursorAppliesTo,
  parseHeaderDate,
  parseImapCursor,
  serializeImapCursor,
} from './imap-provider.js'
import { FakeSession, type FakeServer, fakeMessage, fakeServer } from './test-support.js'

const FOLDERS: AccountFolders = { arrival: 'INBOX', archived: 'Archive', trashed: 'Trash', spam: 'Junk' }

function account(cursorless = true): ProviderAccount {
  return {
    id: 1,
    settingsJson: JSON.stringify({
      host: 'mail.example.com',
      port: 993,
      security: 'tls',
      username: 'u',
      folders: FOLDERS,
    }),
    lastPolledAt: cursorless ? null : 1000,
  }
}

/** A store with nothing held, unless a test says otherwise. */
function store(overrides: Partial<ImapMessageStore> = {}): ImapMessageStore {
  return {
    locationOf: () => Promise.resolve(null),
    unidentified: () => Promise.resolve([]),
    placeInThread: () => Promise.resolve({ backendThreadId: null, isReply: false, messageCount: 1 }),
    ...overrides,
  }
}

function providerOver(server: FakeServer, overrides: Partial<ImapMessageStore> = {}, firstPollWindow?: number) {
  const sessions: FakeSession[] = []
  const provider = new ImapProvider({
    openSession: () => {
      const session = new FakeSession(server)
      sessions.push(session)
      return Promise.resolve(session)
    },
    store: store(overrides),
    now: () => 5000,
    firstPollWindow,
  })
  return { provider, sessions }
}

describe('the IMAP cursor (d-cepkyeoa)', () => {
  it('round-trips through its stored form', () => {
    expect(parseImapCursor(serializeImapCursor({ uidValidity: 12, highestUid: 34 }))).toEqual({
      uidValidity: 12,
      highestUid: 34,
    })
  })

  it('names nothing when absent or malformed', () => {
    expect(parseImapCursor(null)).toBeNull()
    expect(parseImapCursor('not-a-cursor')).toBeNull()
  })

  it('applies only under the UIDVALIDITY it was taken with (f-4i4xtwwj)', () => {
    const cursor = { uidValidity: 12, highestUid: 34 }
    expect(cursorAppliesTo(cursor, 12)).toBe(true)
    expect(cursorAppliesTo(cursor, 13)).toBe(false)
    expect(cursorAppliesTo(null, 12)).toBe(false)
  })
})

describe('listCandidates', () => {
  it('takes everything above the cursor UID and advances to the highest taken in', async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [
      fakeMessage(1, { 'message-id': '<one@x>' }),
      fakeMessage(2, { 'message-id': '<two@x>' }),
      fakeMessage(3, { 'message-id': '<three@x>' }),
    ]
    const { provider } = providerOver(server)

    const listing = await provider.listCandidates(account(), serializeImapCursor({ uidValidity: 100, highestUid: 1 }))
    expect(listing.backendMessageIds).toEqual(['<two@x>', '<three@x>'])
    expect(parseImapCursor(listing.newCursor)).toEqual({ uidValidity: 100, highestUid: 3 })
  })

  it('holds the cursor where nothing new arrived', async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]
    const { provider } = providerOver(server)

    const listing = await provider.listCandidates(account(), serializeImapCursor({ uidValidity: 100, highestUid: 1 }))
    expect(listing.backendMessageIds).toEqual([])
    expect(parseImapCursor(listing.newCursor)).toEqual({ uidValidity: 100, highestUid: 1 })
  })

  it('takes the bounded recent window when the folder reports another UIDVALIDITY (f-4i4xtwwj)', async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [1, 2, 3, 4, 5].map((uid) => fakeMessage(uid, { 'message-id': `<${uid}@x>` }))
    const { provider } = providerOver(server, {}, 2)

    // The stored cursor was taken under a UIDVALIDITY the folder no longer
    // reports, so it names nothing.
    const listing = await provider.listCandidates(account(), serializeImapCursor({ uidValidity: 99, highestUid: 4 }))
    expect(listing.backendMessageIds).toEqual(['<4@x>', '<5@x>'])
    expect(parseImapCursor(listing.newCursor)).toEqual({ uidValidity: 100, highestUid: 5 })
  })

  it('bounds a first poll at two hundred of the most recent, and takes the bound injected (d-ti1jnva6)', async () => {
    expect(DEFAULT_FIRST_POLL_WINDOW).toBe(200)

    const server = fakeServer()
    server.folders.INBOX.messages = [1, 2, 3, 4, 5].map((uid) => fakeMessage(uid, { 'message-id': `<${uid}@x>` }))
    const { provider } = providerOver(server, {}, 3)

    const listing = await provider.listCandidates(account(), null)
    expect(listing.backendMessageIds).toEqual(['<3@x>', '<4@x>', '<5@x>'])
  })

  it('keys a message carrying no Message-ID by where it was found (d-00smatg0, d-m6bufvwy)', async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [fakeMessage(7)]
    const { provider } = providerOver(server)

    const listing = await provider.listCandidates(account(), null)
    expect(listing.backendMessageIds).toEqual(['imap-loc:100:7:INBOX'])
  })

  it('closes the connection it opened (d-p82gksff)', async () => {
    const { provider, sessions } = providerOver(fakeServer())
    await provider.listCandidates(account(), null)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.closed).toBe(true)
  })
})

describe('snapshot (d-cd0jnrdj, d-qstpa7y0)', () => {
  it('reports each message with the standing its folder gives it', async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<in@x>' })]
    server.folders.Archive.messages = [fakeMessage(1, { 'message-id': '<arch@x>' })]
    server.folders.Trash.messages = [fakeMessage(1, { 'message-id': '<trash@x>' })]
    server.folders.Junk.messages = [fakeMessage(1, { 'message-id': '<junk@x>' })]
    const { provider } = providerOver(server)

    const { entries } = await provider.snapshot(account())
    expect(entries).toEqual([
      { backendMessageId: '<in@x>', state: 'present' },
      { backendMessageId: '<arch@x>', state: 'archived' },
      { backendMessageId: '<trash@x>', state: 'trashed' },
      { backendMessageId: '<junk@x>', state: 'spam' },
    ])
  })

  it('keeps the standing recorded for a message it cannot identify again (d-00smatg0)', async () => {
    const server = fakeServer()
    const held: UnidentifiedMessage[] = [{ backendMessageId: 'imap-loc:100:9:INBOX', location: null, state: 'present' }]
    const { provider } = providerOver(server, { unidentified: () => Promise.resolve(held) })

    const { entries } = await provider.snapshot(account())
    expect(entries).toEqual([{ backendMessageId: 'imap-loc:100:9:INBOX', state: 'present' }])
  })

  it('reports an unidentified message it did find under its own key', async () => {
    const server = fakeServer()
    server.folders.Archive.messages = [fakeMessage(9)]
    const held: UnidentifiedMessage[] = [
      { backendMessageId: 'imap-loc:200:9:Archive', location: null, state: 'present' },
    ]
    const { provider } = providerOver(server, { unidentified: () => Promise.resolve(held) })

    const { entries } = await provider.snapshot(account())
    expect(entries).toEqual([{ backendMessageId: 'imap-loc:200:9:Archive', state: 'archived' }])
  })
})

describe('fetchMetadata', () => {
  const stored: ImapLocation = { folder: 'INBOX', uidValidity: 100, uid: 4 }

  it('reads the message at its stored location, with an empty snippet (d-y3uh9ofx)', async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [
      fakeMessage(4, { 'message-id': '<four@x>', date: 'Tue, 18 Aug 2026 09:00:00 +0000', to: 'me@x.com' }),
    ]
    const { provider } = providerOver(server, { locationOf: () => Promise.resolve(stored) })

    const fetched = await provider.fetchMetadata(account(), '<four@x>')
    expect(fetched).toMatchObject({
      backendMessageId: '<four@x>',
      subject: 'subject 4',
      to: 'me@x.com',
      snippet: null,
      bodyFetched: false,
      imapLocation: stored,
    })
    expect(fetched.receivedAt).toBe(Math.floor(Date.parse('Tue, 18 Aug 2026 09:00:00 +0000') / 1000))
  })

  it('looks the message up by Message-ID where its stored location resolves to nothing (d-k4nt8zbu)', async () => {
    const server = fakeServer()
    server.folders.Archive.messages = [fakeMessage(2, { 'message-id': '<moved@x>' })]
    const { provider } = providerOver(server, { locationOf: () => Promise.resolve(stored) })

    const fetched = await provider.fetchMetadata(account(), '<moved@x>')
    expect(fetched.imapLocation).toEqual({ folder: 'Archive', uidValidity: 200, uid: 2 })
  })

  it('refuses where two messages carry the Message-ID', async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<dup@x>' })]
    server.folders.Archive.messages = [fakeMessage(1, { 'message-id': '<dup@x>' })]
    const { provider } = providerOver(server)

    await expect(provider.fetchMetadata(account(), '<dup@x>')).rejects.toBeInstanceOf(ImapMessageNotFoundError)
  })

  it('cannot find a message with no Message-ID once it has moved (d-00smatg0)', async () => {
    const server = fakeServer()
    server.folders.Archive.messages = [fakeMessage(1)]
    const { provider } = providerOver(server, {
      locationOf: () => Promise.resolve({ folder: 'INBOX', uidValidity: 100, uid: 1 }),
    })

    await expect(provider.fetchMetadata(account(), 'imap-loc:100:1:INBOX')).rejects.toThrow(/carries no Message-ID/)
  })
})

describe('applyCategory (d-bl5oamiz)', () => {
  it('stores the category as a keyword on the message', async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]
    const { provider, sessions } = providerOver(server, {
      locationOf: () => Promise.resolve({ folder: 'INBOX', uidValidity: 100, uid: 1 }),
    })

    await provider.applyCategory(account(), '<one@x>', { name: 'grinbox/finance' })
    expect(sessions[0]?.keywords).toEqual([{ folder: 'INBOX', uid: 1, keyword: 'grinbox/finance' }])
    expect(server.folders.INBOX.messages[0]?.flags).toContain('grinbox/finance')
  })
})

describe('threadMembership (d-q96iw28w)', () => {
  it("reports what the store derived from the message's own headers", async () => {
    const server = fakeServer()
    server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<reply@x>', 'in-reply-to': '<root@x>' })]
    const { provider } = providerOver(server, {
      locationOf: () => Promise.resolve({ folder: 'INBOX', uidValidity: 100, uid: 1 }),
      placeInThread: (_accountId, headers) =>
        Promise.resolve({
          backendThreadId: headerValue(headers, 'in-reply-to') ?? null,
          isReply: headerValue(headers, 'in-reply-to') !== undefined,
          messageCount: 2,
        }),
    })

    expect(await provider.threadMembership(account(), '<reply@x>')).toEqual({
      backendThreadId: '<root@x>',
      isReply: true,
      messageCount: 2,
    })
  })
})

describe('parseHeaderDate', () => {
  it('reads an RFC 822 date as unix seconds', () => {
    expect(parseHeaderDate('Tue, 18 Aug 2026 09:00:00 +0000')).toBe(Date.UTC(2026, 7, 18, 9) / 1000)
  })

  it('reads an absent or unreadable date as none', () => {
    expect(parseHeaderDate(undefined)).toBeNull()
    expect(parseHeaderDate('not a date')).toBeNull()
  })
})
