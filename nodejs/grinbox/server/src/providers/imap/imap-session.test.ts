import { describe, expect, it, vi } from 'vitest'
import { ImapCredentialRejectedError, type ImapSession } from './imap-client.js'
import {
  ImapCertificateError,
  classifyConnectError,
  makeSerializedConnect,
  messageIdOf,
  parseHeaderBlock,
  splitMimeBody,
} from './imap-session.js'

describe('classifyConnectError', () => {
  it('reads a verification failure as its own error, distinguishable from an unreachable server (d-lru4i8rp)', () => {
    for (const code of ['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'SELF_SIGNED_CERT_IN_CHAIN']) {
      expect(classifyConnectError(Object.assign(new Error('tls'), { code }))).toBeInstanceOf(ImapCertificateError)
    }
    expect(classifyConnectError(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }))).not.toBeInstanceOf(
      ImapCertificateError,
    )
  })

  it('reads AUTHENTICATIONFAILED as the credential being refused (f-x53bztdj)', () => {
    const err = Object.assign(new Error('no'), {
      authenticationFailed: true,
      serverResponseCode: 'AUTHENTICATIONFAILED',
    })
    expect(classifyConnectError(err)).toBeInstanceOf(ImapCredentialRejectedError)
  })

  it('does not read a bare refusal as the credential', () => {
    const bare = Object.assign(new Error('NO'), { authenticationFailed: true })
    expect(classifyConnectError(bare)).not.toBeInstanceOf(ImapCredentialRejectedError)
    const unavailable = Object.assign(new Error('NO'), {
      authenticationFailed: true,
      serverResponseCode: 'UNAVAILABLE',
    })
    expect(classifyConnectError(unavailable)).not.toBeInstanceOf(ImapCredentialRejectedError)
  })
})

describe('parseHeaderBlock', () => {
  it('lowercases names and keeps the first of a repeated header', () => {
    expect(parseHeaderBlock('Subject: hi\r\nFrom: a@x\r\nSubject: again')).toEqual({ subject: 'hi', from: 'a@x' })
  })

  it('unfolds a continuation line into one value', () => {
    expect(parseHeaderBlock('References: <a@x>\r\n <b@x>')).toEqual({ references: '<a@x> <b@x>' })
  })

  it('ignores a line that is not a header', () => {
    expect(parseHeaderBlock('not a header\r\nSubject: hi')).toEqual({ subject: 'hi' })
  })
})

describe('messageIdOf', () => {
  it('keeps the angle brackets the header carries', () => {
    expect(messageIdOf({ 'message-id': ' <one@x> ' })).toBe('<one@x>')
  })

  it('reads an absent or empty header as none', () => {
    expect(messageIdOf({})).toBeNull()
    expect(messageIdOf({ 'message-id': '  ' })).toBeNull()
  })
})

describe('splitMimeBody', () => {
  it('reads a plain-text message', () => {
    expect(splitMimeBody('Content-Type: text/plain\r\n\r\nhello there')).toEqual({
      bodyText: 'hello there',
      bodyHtml: null,
    })
  })

  it('reads both parts of a multipart/alternative', () => {
    const raw = [
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain',
      '',
      'plain body',
      '--b1',
      'Content-Type: text/html',
      '',
      '<p>rich body</p>',
      '--b1--',
    ].join('\r\n')
    expect(splitMimeBody(raw)).toEqual({ bodyText: 'plain body', bodyHtml: '<p>rich body</p>' })
  })

  it('decodes a base64 part', () => {
    const raw = [
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('encoded body').toString('base64'),
      '--b1--',
    ].join('\r\n')
    expect(splitMimeBody(raw).bodyText).toBe('encoded body')
  })

  it('decodes a quoted-printable part', () => {
    const raw = 'Content-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nca=C3=A9 au lait'
    expect(splitMimeBody(raw).bodyText).toBe('caé au lait')
  })

  it('reads a message with no header break as no body', () => {
    expect(splitMimeBody('garbage')).toEqual({ bodyText: null, bodyHtml: null })
  })
})

describe('makeSerializedConnect (d-v55lpt3t)', () => {
  function fakeSession(): ImapSession {
    return {
      capabilities: () => Promise.resolve([]),
      listFolders: () => Promise.resolve([]),
      selectFolder: () => Promise.resolve({ uidValidity: 1, uidNext: 1, permanentFlags: [] }),
      uidsAbove: () => Promise.resolve([]),
      fetchHeaders: () => Promise.resolve([]),
      fetchBody: () => Promise.resolve({ bodyText: null, bodyHtml: null }),
      enumerate: () => Promise.resolve([]),
      findByMessageId: () => Promise.resolve([]),
      storeKeyword: () => Promise.resolve(),
      move: () => Promise.resolve({ uidValidity: null, uid: null }),
      close: () => Promise.resolve(),
    }
  }

  it('opens the second connection to one account only after the first is closed', async () => {
    let open = 0
    let peak = 0
    const connect = makeSerializedConnect((_key: number) => {
      open += 1
      peak = Math.max(peak, open)
      const session = fakeSession()
      return Promise.resolve({
        ...session,
        close: () => {
          open -= 1
          return Promise.resolve()
        },
      })
    })

    const first = await connect(1)
    const second = connect(1)
    const third = connect(1)
    expect(peak).toBe(1)

    await first.close()
    await (await second).close()
    await (await third).close()
    expect(peak).toBe(1)
    expect(open).toBe(0)
  })

  it('works two accounts at once', async () => {
    let open = 0
    let peak = 0
    const connect = makeSerializedConnect((_key: number) => {
      open += 1
      peak = Math.max(peak, open)
      return Promise.resolve({
        ...fakeSession(),
        close: () => {
          open -= 1
          return Promise.resolve()
        },
      })
    })

    const a = await connect(1)
    const b = await connect(2)
    expect(peak).toBe(2)
    await a.close()
    await b.close()
  })

  it('releases the account when opening the connection failed', async () => {
    const attempts = vi.fn()
    let fail = true
    const connect = makeSerializedConnect((_key: number) => {
      attempts()
      if (fail) {
        fail = false
        return Promise.reject(new Error('refused'))
      }
      return Promise.resolve(fakeSession())
    })

    await expect(connect(1)).rejects.toThrow('refused')
    await expect(connect(1)).resolves.toBeDefined()
    expect(attempts).toHaveBeenCalledTimes(2)
  })
})
