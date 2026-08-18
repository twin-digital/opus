/**
 * The live IMAP transport behind the {@link ImapSession} seam, over `imapflow`.
 *
 * `imapflow` is the maintained IMAP client from Postal Systems (the nodemailer
 * author): it speaks IMAP4rev1 and rev2, advertises MOVE and UIDPLUS use, and
 * fetches with `BODY.PEEK` throughout, which is what lets grinbox read a message
 * without marking it seen (d-mtgha4ra).
 *
 * **Certificate verification.** The connection is TLS from the start or upgraded
 * with STARTTLS, never cleartext, and `rejectUnauthorized` is set on both paths.
 * Nothing the user configures waives it (d-lru4i8rp), and a verification failure
 * is raised as {@link ImapCertificateError} so the interface can say the
 * certificate is why rather than reporting an unreachable server.
 *
 * **One connection, held no longer than the work.** A caller opens a session
 * when work comes due and closes it when the work finishes (d-p82gksff);
 * {@link makeImapConnect} serializes sessions per Account so an Account is worked
 * one connection at a time (d-v55lpt3t).
 *
 * **Moving a message.** `messageMove` uses the server's own MOVE where it is
 * advertised, and otherwise copies and expunges the moved UID alone through
 * UIDPLUS (f-yawjn42g, f-np5bnzew). An Account whose server advertises neither
 * declares it can neither archive nor file (d-8am29x25), so the unsafe path is
 * never reached.
 */

import { ImapFlow } from 'imapflow'
import { headerValue } from './imap-message-store.js'
import type { ImapAccountSettings } from './imap-settings.js'
import {
  ImapCredentialRejectedError,
  type ImapFetchedMessage,
  type ImapFolderEntry,
  type ImapFolderListing,
  type ImapFolderState,
  type ImapMoveResult,
  type ImapSession,
} from './imap-client.js'

/**
 * Thrown when the server's certificate could not be verified. Distinct from an
 * unreachable server: the account is refused, and the user is told the
 * certificate is why (d-lru4i8rp).
 */
export class ImapCertificateError extends Error {
  override readonly name = 'ImapCertificateError'
}

/** OpenSSL/Node verification failures, as raised on the TLS socket. */
const CERTIFICATE_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
])

function codeOf(err: unknown): string {
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

/**
 * Classify a connect/login failure. A certificate that would not verify and a
 * credential the server refused are each their own error; everything else
 * propagates as itself, leaving the Account alone and retried at its next poll
 * (d-v4mejzw5).
 *
 * Only an explicit `AUTHENTICATIONFAILED` is read as the credential: a bare NO
 * carries no code and cannot be told apart from a subsystem being down
 * (f-x53bztdj), so it is not worth pausing an account over.
 */
export function classifyConnectError(err: unknown): Error {
  if (CERTIFICATE_ERROR_CODES.has(codeOf(err))) {
    return new ImapCertificateError(`the server's certificate could not be verified (${codeOf(err)})`)
  }
  const failure = err as { authenticationFailed?: unknown; serverResponseCode?: unknown }
  if (failure.authenticationFailed === true && failure.serverResponseCode === 'AUTHENTICATIONFAILED') {
    return new ImapCredentialRejectedError('the server refused the username and password')
  }
  return err instanceof Error ? err : new Error(String(err))
}

/** Headers a metadata fetch reads. */
const METADATA_HEADERS = [
  'message-id',
  'in-reply-to',
  'references',
  'from',
  'to',
  'cc',
  'subject',
  'date',
  'list-id',
  'list-unsubscribe',
  'reply-to',
]

/** Parse a raw header block into a lowercased-name → value map. */
export function parseHeaderBlock(raw: string): Record<string, string> {
  const headers: Record<string, string> = {}
  // Unfold continuation lines before splitting: a folded header is one value.
  for (const line of raw.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at <= 0) {
      continue
    }
    const name = line.slice(0, at).trim().toLowerCase()
    const value = line.slice(at + 1).trim()
    if (name.length > 0 && !(name in headers)) {
      headers[name] = value
    }
  }
  return headers
}

/** The `Message-ID` of a fetched message, angle brackets and all, or null. */
export function messageIdOf(headers: Record<string, string>): string | null {
  const trimmed = headerValue(headers, 'message-id')?.trim()
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : null
}

class ImapFlowSession implements ImapSession {
  constructor(private readonly client: ImapFlow) {}

  capabilities(): Promise<readonly string[]> {
    return Promise.resolve([...this.client.capabilities.keys()])
  }

  async listFolders(): Promise<readonly ImapFolderListing[]> {
    const listed = await this.client.list()
    return listed.map((folder) => ({
      name: folder.path,
      roles: folder.specialUse ? [folder.specialUse] : [],
    }))
  }

  async selectFolder(folder: string): Promise<ImapFolderState> {
    const mailbox = await this.client.mailboxOpen(folder, { readOnly: false })
    return {
      uidValidity: Number(mailbox.uidValidity),
      uidNext: mailbox.uidNext,
      // An absent PERMANENTFLAGS is the server declining to say; that is not an
      // admission, so it reads as no client-defined keywords (f-9z8o6n1l).
      permanentFlags: mailbox.permanentFlags ? [...mailbox.permanentFlags] : [],
    }
  }

  async uidsAbove(folder: string, afterUid: number): Promise<readonly number[]> {
    await this.client.mailboxOpen(folder, { readOnly: true })
    const found = await this.client.search({ uid: `${afterUid + 1}:*` }, { uid: true })
    // The `:*` form always matches the highest UID even when it is below the
    // range, so anything at or below the cursor is dropped here (f-xbec6o46).
    return found === false ? [] : found.filter((uid) => uid > afterUid)
  }

  async fetchHeaders(folder: string, uids: readonly number[]): Promise<readonly ImapFetchedMessage[]> {
    if (uids.length === 0) {
      return []
    }
    await this.client.mailboxOpen(folder, { readOnly: true })
    const fetched = await this.client.fetchAll(
      [...uids],
      { uid: true, flags: true, headers: METADATA_HEADERS },
      { uid: true },
    )
    return fetched.map((message) => ({
      uid: message.uid,
      flags: message.flags ? [...message.flags] : [],
      headers: parseHeaderBlock(message.headers?.toString('utf8') ?? ''),
    }))
  }

  async fetchBody(folder: string, uid: number): Promise<{ bodyText: string | null; bodyHtml: string | null }> {
    await this.client.mailboxOpen(folder, { readOnly: true })
    const message = (await this.client.fetchAll([uid], { uid: true, source: true }, { uid: true })).at(0)
    if (!message?.source) {
      return { bodyText: null, bodyHtml: null }
    }
    return splitMimeBody(message.source.toString('utf8'))
  }

  async enumerate(folder: string): Promise<readonly ImapFolderEntry[]> {
    await this.client.mailboxOpen(folder, { readOnly: true })
    // One fetch enumerates the whole folder with every message's flags
    // (f-q9yoqzit); Message-ID comes along so a row can be matched to it.
    const fetched = await this.client.fetchAll('1:*', { uid: true, flags: true, headers: ['message-id'] })
    return fetched.map((message) => ({
      uid: message.uid,
      flags: message.flags ? [...message.flags] : [],
      messageId: messageIdOf(parseHeaderBlock(message.headers?.toString('utf8') ?? '')),
    }))
  }

  async findByMessageId(folder: string, messageId: string): Promise<readonly number[]> {
    await this.client.mailboxOpen(folder, { readOnly: true })
    const found = await this.client.search({ header: { 'message-id': messageId } }, { uid: true })
    return found === false ? [] : found
  }

  async storeKeyword(folder: string, uid: number, keyword: string): Promise<void> {
    await this.client.mailboxOpen(folder, { readOnly: false })
    await this.client.messageFlagsAdd([uid], [keyword], { uid: true })
  }

  async move(folder: string, uid: number, destination: string): Promise<ImapMoveResult> {
    await this.client.mailboxOpen(folder, { readOnly: false })
    const moved = await this.client.messageMove([uid], destination, { uid: true })
    if (moved === false) {
      throw new Error(`moving message ${uid} from '${folder}' to '${destination}' failed`)
    }
    const landed = moved.uidMap?.get(uid)
    return {
      uidValidity: moved.uidValidity === undefined ? null : Number(moved.uidValidity),
      uid: landed ?? null,
    }
  }

  async close(): Promise<void> {
    await this.client.logout().catch(() => {
      this.client.close()
    })
  }
}

/**
 * The plain-text and HTML parts of a raw RFC 822 message. Deliberately shallow:
 * it walks the top-level multipart boundaries and takes the first `text/plain`
 * and `text/html` part it finds, which covers the shapes mail actually arrives
 * in. A part it cannot decode reads as absent rather than failing the fetch.
 */
export function splitMimeBody(raw: string): { bodyText: string | null; bodyHtml: string | null } {
  const headerEnd = raw.search(/\r?\n\r?\n/)
  if (headerEnd < 0) {
    return { bodyText: null, bodyHtml: null }
  }
  const headers = parseHeaderBlock(raw.slice(0, headerEnd))
  const body = raw.slice(headerEnd).replace(/^\r?\n\r?\n/, '')
  const contentType = headerValue(headers, 'content-type') ?? 'text/plain'

  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1]
  if (!boundary) {
    const decoded = decodePart(body, headerValue(headers, 'content-transfer-encoding'))
    return contentType.toLowerCase().startsWith('text/html') ?
        { bodyText: null, bodyHtml: decoded }
      : { bodyText: decoded, bodyHtml: null }
  }

  let bodyText: string | null = null
  let bodyHtml: string | null = null
  for (const part of body.split(`--${boundary}`)) {
    const partHeaderEnd = part.search(/\r?\n\r?\n/)
    if (partHeaderEnd < 0) {
      continue
    }
    const partHeaders = parseHeaderBlock(part.slice(0, partHeaderEnd))
    const partType = (headerValue(partHeaders, 'content-type') ?? '').toLowerCase()
    const content = decodePart(
      part.slice(partHeaderEnd).replace(/^\r?\n\r?\n/, ''),
      headerValue(partHeaders, 'content-transfer-encoding'),
    )
    if (bodyText === null && partType.startsWith('text/plain')) {
      bodyText = content
    }
    if (bodyHtml === null && partType.startsWith('text/html')) {
      bodyHtml = content
    }
    if (bodyHtml === null && partType.startsWith('multipart/')) {
      const nested = splitMimeBody(part.slice(part.search(/\r?\n/) + 1))
      bodyText ??= nested.bodyText
      bodyHtml ??= nested.bodyHtml
    }
  }
  return { bodyText, bodyHtml }
}

/** Decode a part's content for the transfer encodings mail actually uses. */
function decodePart(content: string, encoding: string | undefined): string {
  const trimmed = content.replace(/\r?\n$/, '')
  switch ((encoding ?? '').trim().toLowerCase()) {
    case 'base64':
      try {
        return Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf8')
      } catch {
        return trimmed
      }
    case 'quoted-printable': {
      // Decode to bytes first: a multi-byte character arrives as several `=XX`
      // escapes, and reading each as a code point would mangle it.
      const unfolded = trimmed.replace(/=\r?\n/g, '')
      const bytes: number[] = []
      for (let i = 0; i < unfolded.length; i++) {
        const escape = unfolded.startsWith('=', i) ? /^=([0-9A-Fa-f]{2})/.exec(unfolded.slice(i, i + 3)) : null
        if (escape?.[1] !== undefined) {
          bytes.push(Number.parseInt(escape[1], 16))
          i += 2
          continue
        }
        bytes.push(unfolded.charCodeAt(i))
      }
      return Buffer.from(bytes).toString('utf8')
    }
    default:
      return trimmed
  }
}

/** Open one logged-in session against `connection`, verifying the certificate. */
export async function openImapSession(connection: ImapAccountSettings, password: string): Promise<ImapSession> {
  const client = new ImapFlow({
    host: connection.host,
    port: connection.port,
    secure: connection.security === 'tls',
    // `false` would leave a cleartext connection standing where the server
    // declines to upgrade; `true` requires the upgrade (d-lru4i8rp).
    doSTARTTLS: connection.security === 'starttls' ? true : undefined,
    tls: { rejectUnauthorized: true, servername: connection.host },
    auth: { user: connection.username, pass: password },
    // Grinbox polls; it does not wait on the server to announce an arrival
    // (d-p82gksff), and the connection is closed as soon as the poll finishes.
    disableAutoIdle: true,
    logger: false,
  })

  try {
    await client.connect()
  } catch (err) {
    client.close()
    throw classifyConnectError(err)
  }
  return new ImapFlowSession(client)
}

/**
 * Serialize sessions per key so an Account is worked one connection at a time
 * (d-v55lpt3t). Work for an Account that arrives while its connection is busy
 * waits for it rather than opening a second.
 */
export function makeSerializedConnect<K>(open: (key: K) => Promise<ImapSession>): (key: K) => Promise<ImapSession> {
  const queues = new Map<K, Promise<unknown>>()

  return async (key: K) => {
    const waitFor = queues.get(key) ?? Promise.resolve()
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    queues.set(
      key,
      waitFor.then(() => held),
    )

    await waitFor.catch(() => undefined)

    let session: ImapSession
    try {
      session = await open(key)
    } catch (err) {
      release()
      throw err
    }

    return {
      ...sessionMethods(session),
      close: async () => {
        try {
          await session.close()
        } finally {
          release()
        }
      },
    }
  }
}

/** Bind a session's methods so the wrapper can override `close` alone. */
function sessionMethods(session: ImapSession): ImapSession {
  return {
    capabilities: session.capabilities.bind(session),
    listFolders: session.listFolders.bind(session),
    selectFolder: session.selectFolder.bind(session),
    uidsAbove: session.uidsAbove.bind(session),
    fetchHeaders: session.fetchHeaders.bind(session),
    fetchBody: session.fetchBody.bind(session),
    enumerate: session.enumerate.bind(session),
    findByMessageId: session.findByMessageId.bind(session),
    storeKeyword: session.storeKeyword.bind(session),
    move: session.move.bind(session),
    close: session.close.bind(session),
  }
}
