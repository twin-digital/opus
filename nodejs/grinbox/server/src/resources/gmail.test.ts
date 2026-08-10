import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Gmail underlying client with `googleapis` mocked (no network). Exercises a
 * representative read op (`fetchMetadata`) and a mutate op (`applyLabel`),
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

const { applyLabel, archiveMessage, extractBody, fetchBody, fetchMetadata, htmlToText, listMessages, sendMessage } =
  await import('./gmail.js')

/** Encode a part body the way Gmail does: URL-safe base64. */
function b64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

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

  it('applyLabel resolves an existing label name → id and modifies with the id', async () => {
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

  it('applyLabel creates the label when absent, then modifies with the new id', async () => {
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

  it('archive removes the INBOX label via messages.modify using the injected auth', async () => {
    const authClient = { id: 'auth' }
    const auth = vi.fn(async () => authClient)
    messagesModify.mockResolvedValue({ data: {} })
    const result = await archiveMessage(
      { auth: auth as never, signal: new AbortController().signal },
      { backendMessageId: 'msg1' },
    )
    expect(result).toEqual({ archived: true })
    expect(auth).toHaveBeenCalledTimes(1)
    expect(gmailFactory).toHaveBeenCalledWith(expect.objectContaining({ auth: authClient }))
    // Only the INBOX membership changes — no labels are added.
    expect(messagesModify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        id: 'msg1',
        requestBody: { removeLabelIds: ['INBOX'] },
      }),
      expect.anything(),
    )
    // Unlike applyLabel there is no label name to resolve.
    expect(labelsList).not.toHaveBeenCalled()
    expect(labelsCreate).not.toHaveBeenCalled()
  })

  it('archive propagates a modify failure', async () => {
    messagesModify.mockRejectedValue(new Error('gmail 500'))
    await expect(
      archiveMessage(
        {
          auth: (async () => ({})) as never,
          signal: new AbortController().signal,
        },
        { backendMessageId: 'msg1' },
      ),
    ).rejects.toThrow('gmail 500')
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
      [
        'To: dest@example.com',
        'Subject: hi',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(args.body, 'utf8').toString('base64'),
      ].join('\r\n'),
    )
  })

  it('send_message RFC-2047-encodes a non-ASCII subject; ASCII passes through', async () => {
    messagesSend.mockResolvedValue({ data: { id: 'sent43' } })
    const subject = 'daily-digest \u2014 2026-07-20'
    await sendMessage(
      {
        auth: (async () => ({})) as never,
        signal: new AbortController().signal,
      },
      { to: 'dest@example.com', subject, body: 'x' },
    )
    const sentArg = messagesSend.mock.calls[0]?.[0] as {
      requestBody: { raw: string }
    }
    const decoded = Buffer.from(sentArg.requestBody.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    )
    const subjectLine = decoded.split('\r\n').find((l) => l.startsWith('Subject: '))
    expect(subjectLine).toBe(`Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`)
    // The encoded-word itself is pure ASCII — no raw non-ASCII header bytes.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range check
    expect(/^[\x20-\x7e]*$/.test(subjectLine ?? '')).toBe(true)
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

/**
 * `fetch_body` walks the full-format payload for the first non-attachment
 * text/plain + text/html parts; `bodyText` prefers plain and falls back to
 * stripped HTML; a body-less Message yields nulls.
 */
describe('gmail fetch_body', () => {
  const deps = {
    auth: (async () => ({})) as never,
    signal: new AbortController().signal,
  }

  it('requests format=full and prefers the text/plain part', async () => {
    messagesGet.mockResolvedValue({
      data: {
        payload: {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64url('plain body') } },
            {
              mimeType: 'text/html',
              body: { data: b64url('<p>html body</p>') },
            },
          ],
        },
      },
    })
    const result = await fetchBody(deps, { backendMessageId: 'msg1' })
    expect(result).toEqual({
      bodyText: 'plain body',
      bodyHtml: '<p>html body</p>',
    })
    expect(messagesGet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', id: 'msg1', format: 'full' }),
      expect.anything(),
    )
  })

  it('falls back to the stripped text/html part when no text/plain exists', async () => {
    messagesGet.mockResolvedValue({
      data: {
        payload: {
          mimeType: 'text/html',
          body: { data: b64url('<p>Hello &amp; goodbye</p>') },
        },
      },
    })
    const result = await fetchBody(deps, { backendMessageId: 'msg1' })
    expect(result.bodyText).toBe('Hello & goodbye')
    expect(result.bodyHtml).toBe('<p>Hello &amp; goodbye</p>')
  })

  it('returns nulls for a Message with no body parts', async () => {
    messagesGet.mockResolvedValue({
      data: { payload: { mimeType: 'multipart/mixed', parts: [] } },
    })
    const result = await fetchBody(deps, { backendMessageId: 'msg1' })
    expect(result).toEqual({ bodyText: null, bodyHtml: null })
  })
})

describe('extractBody', () => {
  it('reads a single-part text/plain payload directly', () => {
    expect(extractBody({ mimeType: 'text/plain', body: { data: b64url('hi') } })).toEqual({
      bodyText: 'hi',
      bodyHtml: null,
    })
  })

  it('recurses into nested multiparts (mixed > alternative)', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64url('nested plain') } },
            { mimeType: 'text/html', body: { data: b64url('<b>h</b>') } },
          ],
        },
      ],
    }
    expect(extractBody(payload)).toEqual({
      bodyText: 'nested plain',
      bodyHtml: '<b>h</b>',
    })
  })

  it('skips attachment parts (filename present) even with text mime types', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'text/plain',
          filename: 'notes.txt',
          body: { data: b64url('attachment content') },
        },
        { mimeType: 'text/plain', body: { data: b64url('inline body') } },
      ],
    }
    expect(extractBody(payload)).toEqual({
      bodyText: 'inline body',
      bodyHtml: null,
    })
  })

  it('takes the FIRST part of each type (canonical multipart/alternative rendition)', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64url('first') } },
        { mimeType: 'text/plain', body: { data: b64url('second') } },
      ],
    }
    expect(extractBody(payload)).toEqual({ bodyText: 'first', bodyHtml: null })
  })

  it("decodes Gmail's URL-safe base64 (- and _ alphabet)", () => {
    // '>>>???' encodes to 'Pj4+Pz8/' in standard base64 → 'Pj4-Pz8_' URL-safe.
    expect(extractBody({ mimeType: 'text/plain', body: { data: 'Pj4-Pz8_' } })).toEqual({
      bodyText: '>>>???',
      bodyHtml: null,
    })
  })

  it('returns nulls for a null payload', () => {
    expect(extractBody(null)).toEqual({ bodyText: null, bodyHtml: null })
  })
})

describe('htmlToText', () => {
  it('drops style/script/comment blocks and strips tags', () => {
    const html =
      '<html><head><style>p{color:red}</style></head>' +
      '<body><!-- hidden --><script>alert(1)</script><p>Visible</p></body></html>'
    expect(htmlToText(html)).toBe('Visible')
  })

  it('turns <br> and closing block tags into newlines', () => {
    expect(htmlToText('<p>one</p><p>two<br>three</p>')).toBe('one\ntwo\nthree')
  })

  it('decodes named and numeric entities', () => {
    expect(htmlToText('a &lt;b&gt; &amp; &#65; &#x42; &nbsp;c')).toBe('a <b> & A B c')
  })

  it('collapses runs of spaces/tabs and squeezes blank-line runs', () => {
    expect(htmlToText('<div>a \t  b</div><div>c</div>')).toBe('a b\nc')
    expect(htmlToText('one<br><br><br><br>two')).toBe('one\n\ntwo')
  })
})
