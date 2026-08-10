import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The live {@link GmailProviderClient} adapter with `googleapis` mocked (no
 * network), mirroring `resources/gmail.test.ts`. Asserts the History/Profile/
 * Thread reads hit the mocked googleapis with the *resolved* access token, and
 * that the 404-on-history mapping triggers the expired-history error.
 *
 * The OAuth token resolution is mocked at `resolveGmailAccessToken` so the test
 * exercises only the adapter's googleapis wiring; the resolve/refresh lifecycle
 * is covered in `oauth/token-store.test.ts`.
 */

// --- googleapis mock --------------------------------------------------------

const getProfile = vi.fn()
const historyList = vi.fn()
const messagesGet = vi.fn()
const threadsGet = vi.fn()
const messagesList = vi.fn()
const messagesModify = vi.fn()
const labelsList = vi.fn()
const labelsCreate = vi.fn()
const setCredentials = vi.fn()

const gmailFactory = vi.fn(() => ({
  users: {
    getProfile,
    history: { list: historyList },
    messages: { get: messagesGet, list: messagesList, modify: messagesModify },
    labels: { list: labelsList, create: labelsCreate },
    threads: { get: threadsGet },
  },
}))

class FakeOAuth2 {
  setCredentials = setCredentials
}

vi.mock('googleapis', () => ({
  google: {
    gmail: gmailFactory,
    auth: { OAuth2: FakeOAuth2 },
  },
}))

// --- token-store mock -------------------------------------------------------

const resolveGmailAccessToken = vi.fn()
vi.mock('../oauth/token-store.js', () => ({ resolveGmailAccessToken }))

const { makeLiveGmailClient } = await import('./live-gmail-client.js')
const { HistoryIdExpiredError } = await import('./gmail-provider.js')

function makeClient() {
  return makeLiveGmailClient({
    db: {} as never,
    encryptor: {} as never,
    googleClient: {} as never,
    accountId: 7,
  })
}

describe('live GmailProviderClient adapter', () => {
  beforeEach(() => {
    getProfile.mockReset()
    historyList.mockReset()
    messagesGet.mockReset()
    threadsGet.mockReset()
    messagesList.mockReset()
    messagesModify.mockReset()
    labelsList.mockReset()
    labelsCreate.mockReset()
    setCredentials.mockReset()
    gmailFactory.mockClear()
    resolveGmailAccessToken.mockReset()
    resolveGmailAccessToken.mockResolvedValue('access-tok-123')
  })

  it('getLatestHistoryId resolves the token and returns the profile historyId', async () => {
    getProfile.mockResolvedValue({ data: { historyId: 'H42' } })
    const client = makeClient()

    const id = await client.getLatestHistoryId()

    expect(id).toBe('H42')
    // The resolved access token was set on the OAuth2 client passed to gmail().
    expect(resolveGmailAccessToken).toHaveBeenCalledWith(expect.anything(), expect.anything(), 7, expect.anything())
    expect(setCredentials).toHaveBeenCalledWith({
      access_token: 'access-tok-123',
    })
    expect(getProfile).toHaveBeenCalledWith({ userId: 'me' })
  })

  it('listHistory flattens messagesAdded ids and advances the cursor', async () => {
    historyList.mockResolvedValue({
      data: {
        history: [
          { messagesAdded: [{ message: { id: 'm1' } }, { message: {} }] },
          { messagesAdded: [{ message: { id: 'm2' } }] },
        ],
        historyId: 'H200',
        nextPageToken: 'next',
      },
    })
    const client = makeClient()

    const page = await client.listHistory('H100', 'tok')

    expect(page).toEqual({
      addedMessageIds: ['m1', 'm2'],
      labelEvents: [],
      historyId: 'H200',
      nextPageToken: 'next',
    })
    expect(historyList).toHaveBeenCalledWith({
      userId: 'me',
      startHistoryId: 'H100',
      historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved', 'messageDeleted'],
      pageToken: 'tok',
    })
    expect(setCredentials).toHaveBeenCalledWith({
      access_token: 'access-tok-123',
    })
  })

  it('listHistory merges a Message label add/remove into one event and flags deletes', async () => {
    historyList.mockResolvedValue({
      data: {
        history: [
          // Trash: Gmail pairs +TRASH with -INBOX on the same Message in one record.
          {
            labelsAdded: [{ message: { id: 'm1' }, labelIds: ['TRASH'] }],
            labelsRemoved: [{ message: { id: 'm1' }, labelIds: ['INBOX'] }],
          },
          { messagesDeleted: [{ message: { id: 'm2' } }] },
        ],
        historyId: 'H300',
      },
    })
    const client = makeClient()

    const page = await client.listHistory('H200')

    expect(page.labelEvents).toEqual([
      {
        backendMessageId: 'm1',
        addedLabelIds: ['TRASH'],
        removedLabelIds: ['INBOX'],
        deleted: false,
      },
      {
        backendMessageId: 'm2',
        addedLabelIds: [],
        removedLabelIds: [],
        deleted: true,
      },
    ])
  })

  it('listHistory maps a 404 onto HistoryIdExpiredError', async () => {
    historyList.mockRejectedValue({ code: 404 })
    const client = makeClient()
    await expect(client.listHistory('H1')).rejects.toBeInstanceOf(HistoryIdExpiredError)
  })

  it('getMessage normalizes headers/threadId/snippet/internalDate', async () => {
    messagesGet.mockResolvedValue({
      data: {
        id: 'm9',
        threadId: 't9',
        snippet: 'hello',
        internalDate: '1700000000000',
        payload: {
          headers: [
            { name: 'From', value: 'a@b.com' },
            { name: 'Subject', value: 'hi' },
          ],
        },
      },
    })
    const client = makeClient()

    const payload = await client.getMessage('m9')

    expect(payload).toEqual({
      id: 'm9',
      threadId: 't9',
      snippet: 'hello',
      internalDate: '1700000000000',
      headers: { from: 'a@b.com', subject: 'hi' },
    })
    expect(messagesGet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', id: 'm9', format: 'metadata' }),
      expect.anything(),
    )
  })

  it('getThread reduces the thread to its message ids', async () => {
    threadsGet.mockResolvedValue({
      data: { id: 't1', messages: [{ id: 'a' }, {}, { id: 'b' }] },
    })
    const client = makeClient()

    const thread = await client.getThread('t1')

    expect(thread).toEqual({ id: 't1', messageIds: ['a', 'b'] })
  })

  it('listMessages and applyLabel reuse the resources-layer ops with the resolved auth', async () => {
    messagesList.mockResolvedValue({ data: { messages: [{ id: 'x' }] } })
    messagesModify.mockResolvedValue({ data: {} })
    const client = makeClient()

    const listed = await client.listMessages('is:unread')
    expect(listed).toEqual({ ids: ['x'] })

    // applyLabel resolves the label name → id (list, here a hit) before modify.
    labelsList.mockResolvedValue({
      data: { labels: [{ id: 'Label_9', name: 'Lbl' }] },
    })
    await client.applyLabel('x', 'Lbl')
    expect(messagesModify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        id: 'x',
        requestBody: { addLabelIds: ['Label_9'] },
      }),
      expect.anything(),
    )
    // Both ops resolved the per-Account token before calling googleapis.
    expect(resolveGmailAccessToken).toHaveBeenCalled()
  })
})
