import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Gmail underlying client with `googleapis` mocked (no network). Exercises a
 * representative read op (`fetch_metadata`) and a mutate op (`apply_label`),
 * asserting the injected auth seam is used and the response is mapped.
 */

const messagesGet = vi.fn()
const messagesModify = vi.fn()
const messagesSend = vi.fn()
const messagesList = vi.fn()
const labelsList = vi.fn()
const labelsCreate = vi.fn()
const gmailFactory = vi.fn(() => ({
  users: {
    messages: {
      get: messagesGet,
      modify: messagesModify,
      send: messagesSend,
      list: messagesList,
    },
    labels: {
      list: labelsList,
      create: labelsCreate,
    },
  },
}))

vi.mock('googleapis', () => ({
  google: { gmail: gmailFactory },
}))

const { applyLabel, fetchMetadata, listMessages, sendMessage } = await import('./gmail.js')

describe('gmail underlying client', () => {
  beforeEach(() => {
    messagesGet.mockReset()
    messagesModify.mockReset()
    messagesSend.mockReset()
    messagesList.mockReset()
    labelsList.mockReset()
    labelsCreate.mockReset()
    gmailFactory.mockClear()
  })

  it('fetch_metadata returns a lowercased header map using the injected auth', async () => {
    const authClient = { id: 'auth' }
    const auth = vi.fn(async () => authClient)
    messagesGet.mockResolvedValue({
      data: {
        payload: {
          headers: [
            { name: 'From', value: 'a@b.com' },
            { name: 'Subject', value: 'hi' },
          ],
        },
      },
    })
    const result = await fetchMetadata(
      { auth: auth as never, signal: new AbortController().signal },
      { backendMessageId: 'msg1' },
    )
    expect(result.headers).toEqual({ from: 'a@b.com', subject: 'hi' })
    expect(auth).toHaveBeenCalledTimes(1)
    // The injected auth client is passed to google.gmail(...).
    expect(gmailFactory).toHaveBeenCalledWith(expect.objectContaining({ auth: authClient }))
  })

  it('apply_label resolves an existing label name → id and modifies with the id', async () => {
    labelsList.mockResolvedValue({
      data: {
        labels: [
          { id: 'Label_7', name: 'Lbl' },
          { id: 'X', name: 'Other' },
        ],
      },
    })
    messagesModify.mockResolvedValue({ data: {} })
    const result = await applyLabel(
      {
        auth: (async () => ({})) as never,
        signal: new AbortController().signal,
      },
      { backendMessageId: 'msg1', label: 'Lbl' },
    )
    expect(result).toEqual({ applied: true })
    // Resolved by name to the existing label id — no create.
    expect(labelsCreate).not.toHaveBeenCalled()
    expect(messagesModify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        id: 'msg1',
        requestBody: { addLabelIds: ['Label_7'] },
      }),
      expect.anything(),
    )
  })

  it('apply_label creates the label when absent, then modifies with the new id', async () => {
    labelsList.mockResolvedValue({
      data: { labels: [{ id: 'X', name: 'Other' }] },
    })
    labelsCreate.mockResolvedValue({ data: { id: 'Label_new' } })
    messagesModify.mockResolvedValue({ data: {} })
    const result = await applyLabel(
      {
        auth: (async () => ({})) as never,
        signal: new AbortController().signal,
      },
      { backendMessageId: 'msg1', label: 'Grinbox/Newsletters' },
    )
    expect(result).toEqual({ applied: true })
    expect(labelsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        requestBody: expect.objectContaining({ name: 'Grinbox/Newsletters' }),
      }),
      expect.anything(),
    )
    expect(messagesModify).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg1',
        requestBody: { addLabelIds: ['Label_new'] },
      }),
      expect.anything(),
    )
  })

  it('send_message builds a base64url RFC822 raw body and returns the new id', async () => {
    messagesSend.mockResolvedValue({ data: { id: 'sent42' } })
    const args = {
      to: 'dest@example.com',
      subject: 'hi',
      // A body chosen so its standard base64 contains '+', '/' (rewritten to
      // '-'/'_') AND trailing '=' padding (which must be stripped).
      body: 'subjects??>>>ÿþýX',
    }
    const result = await sendMessage(
      {
        auth: (async () => ({})) as never,
        signal: new AbortController().signal,
      },
      args,
    )
    expect(result).toEqual({ message_id: 'sent42' })

    const sentArg = messagesSend.mock.calls[0]?.[0] as {
      userId: string
      requestBody: { raw: string }
    }
    expect(sentArg.userId).toBe('me')
    const raw = sentArg.requestBody.raw

    // base64url alphabet only: no '+', '/', or '=' padding.
    expect(raw).not.toMatch(/[+/=]/)
    // Decoding the base64url string round-trips to the exact RFC822 message,
    // proving the +/=→-/_ rewrite and padding-strip were lossless.
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    expect(decoded).toBe(
      ['To: dest@example.com', 'Subject: hi', 'Content-Type: text/plain; charset="UTF-8"', '', args.body].join('\r\n'),
    )
  })

  it('send_message returns an empty id when the API omits one', async () => {
    messagesSend.mockResolvedValue({ data: {} })
    const result = await sendMessage(
      {
        auth: (async () => ({})) as never,
        signal: new AbortController().signal,
      },
      { to: 'd@e.com', subject: 's', body: 'b' },
    )
    expect(result).toEqual({ message_id: '' })
  })

  it('list_messages maps response ids and drops non-string/absent ids', async () => {
    const authClient = { id: 'auth' }
    const auth = vi.fn(async () => authClient)
    messagesList.mockResolvedValue({
      data: {
        messages: [{ id: 'a' }, { id: null }, {}, { id: 'b' }],
      },
    })
    const result = await listMessages(
      { auth: auth as never, signal: new AbortController().signal },
      { query: 'is:unread' },
    )
    expect(result).toEqual({ ids: ['a', 'b'] })
    expect(messagesList).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', q: 'is:unread' }),
      expect.anything(),
    )
    expect(auth).toHaveBeenCalledTimes(1)
  })

  it('list_messages returns an empty array when there are no messages', async () => {
    messagesList.mockResolvedValue({ data: {} })
    const result = await listMessages(
      {
        auth: (async () => ({})) as never,
        signal: new AbortController().signal,
      },
      { query: 'x' },
    )
    expect(result).toEqual({ ids: [] })
  })
})
