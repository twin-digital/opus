/**
 * `/api/imap` — adding, repairing, and re-pointing an IMAP Account. Every route
 * here is on grinbox's internal interface: a credential the user holds is
 * authorized by logging in, and reaches no public path (d-fuln110d).
 *
 *  - `POST /api/imap/probe` — log in with a connection and a password, and
 *    report the folders the account holds with the role grinbox proposes for
 *    each, plus what the account can carry. Adding is a probe the user answers
 *    and then a create; a probe that is abandoned leaves nothing behind
 *    (d-8jc4taom).
 *  - `POST /api/imap/accounts` — create the Account once the user has accepted
 *    its four folders. Grinbox holds the password no longer than the adding
 *    takes, and stores it as the Account's Credential.
 *  - `PUT /api/imap/accounts/:id/connection` — repair a paused Account by
 *    restating everything an IMAP Account is configured with, not the password
 *    alone (d-r3ogwkv7). The backend still cannot change (d-oevikmal). The
 *    connection is proved by logging in before anything is stored.
 *  - `PATCH /api/imap/accounts/:id/folders` — name a different folder for any
 *    role at any time (d-8pdx8qsd). What grinbox already recorded keeps the
 *    standing it had; the new folders are what the next poll reads.
 *
 * No response carries the password back, in any encoding (r-0kn0oida).
 *
 * A refusal names which failure it was (d-oaaz2fwk): `account_login_failed` for
 * a credential the server refused, `certificate_unverified` for a certificate
 * that would not verify — the two a user acts on differently — and
 * `duplicate_folder_role` for two roles naming one folder.
 */

import {
  type ApiErrorBody,
  imapAccountCredentialsSchema,
  imapAccountSetupSchema,
  accountFoldersSchema,
} from '@grinbox/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { createImapAccount, repairImapAccount, repointImapFolders } from '../../config/imap-account.js'
import { ImapCredentialRejectedError } from '../../providers/imap/imap-client.js'
import { ImapCertificateError } from '../../providers/imap/imap-session.js'
import { type ApiDeps, resolveActingUserId } from './deps.js'

const idParam = z.object({ id: z.coerce.number().int().positive() })

const createAccountBody = imapAccountSetupSchema.extend({
  name: z.string().min(1),
  address: z.string().min(1),
})

const repointFoldersBody = z.object({ folders: accountFoldersSchema })

function refusal(code: string, message: string): ApiErrorBody {
  return { error: { code, message } }
}

/** The daemon has no IMAP transport wired; every route here says so plainly. */
const UNAVAILABLE = refusal('imap_unavailable', 'the IMAP transport is not configured on this deployment')

/**
 * Map a login failure onto the refusal the interface branches on. A certificate
 * that would not verify is its own code so the user is told the certificate is
 * why rather than that the server was unreachable (d-lru4i8rp).
 */
function loginRefusal(err: unknown): { body: ApiErrorBody; status: 401 | 502 } | null {
  if (err instanceof ImapCredentialRejectedError) {
    return { body: refusal('account_login_failed', err.message), status: 401 }
  }
  if (err instanceof ImapCertificateError) {
    return { body: refusal('certificate_unverified', err.message), status: 502 }
  }
  return null
}

export function createImapRoutes(deps: ApiDeps) {
  return new Hono()
    .post('/api/imap/probe', zValidator('json', imapAccountCredentialsSchema), async (c) => {
      const { imapProbe } = deps
      if (!imapProbe) {
        return c.json(UNAVAILABLE, 503)
      }
      const { password, ...connection } = c.req.valid('json')
      try {
        return c.json(await imapProbe(connection, password))
      } catch (err) {
        const mapped = loginRefusal(err)
        if (mapped) {
          return c.json(mapped.body, mapped.status)
        }
        throw err
      }
    })

    .post('/api/imap/accounts', zValidator('json', createAccountBody), async (c) => {
      const { imapProbe, encryptor } = deps
      if (!imapProbe) {
        return c.json(UNAVAILABLE, 503)
      }
      if (!encryptor) {
        return c.json(refusal('encryption_unavailable', 'no encryption key is configured'), 503)
      }
      const userId = await resolveActingUserId(deps.db)
      if (userId === null) {
        return c.json(refusal('not_found', 'no user is installed'), 400)
      }

      const { password, name, address, folders, ...connection } = c.req.valid('json')

      // Prove the login and the folders before anything is stored: an Account
      // exists once its folders are accepted, and not before (d-8jc4taom).
      let listed: readonly { name: string }[]
      try {
        listed = (await imapProbe(connection, password)).folders
      } catch (err) {
        const mapped = loginRefusal(err)
        if (mapped) {
          return c.json(mapped.body, mapped.status)
        }
        throw err
      }

      const missing = Object.values(folders).filter((folder) => !listed.some((f) => f.name === folder))
      if (missing.length > 0) {
        return c.json(
          refusal('not_found', `the account has no folder named ${missing.map((f) => `'${f}'`).join(', ')}`),
          400,
        )
      }

      const id = await createImapAccount(deps.db, encryptor, {
        userId,
        actorUserId: userId,
        name,
        settings: { ...connection, address, folders },
        password,
      })
      return c.json({ account_id: id }, 201)
    })

    .put(
      '/api/imap/accounts/:id/connection',
      zValidator('param', idParam),
      zValidator('json', imapAccountCredentialsSchema),
      async (c) => {
        const { imapProbe, encryptor } = deps
        if (!imapProbe) {
          return c.json(UNAVAILABLE, 503)
        }
        if (!encryptor) {
          return c.json(refusal('encryption_unavailable', 'no encryption key is configured'), 503)
        }
        const { id } = c.req.valid('param')
        const { password, ...connection } = c.req.valid('json')

        try {
          await imapProbe(connection, password)
        } catch (err) {
          const mapped = loginRefusal(err)
          if (mapped) {
            return c.json(mapped.body, mapped.status)
          }
          throw err
        }

        const userId = await resolveActingUserId(deps.db)
        await repairImapAccount(deps.db, encryptor, { accountId: id, actorUserId: userId, connection, password })
        return c.json({ account_id: id })
      },
    )

    .patch(
      '/api/imap/accounts/:id/folders',
      zValidator('param', idParam),
      zValidator('json', repointFoldersBody),
      async (c) => {
        const { id } = c.req.valid('param')
        const { folders } = c.req.valid('json')
        const userId = await resolveActingUserId(deps.db)
        await repointImapFolders(deps.db, { accountId: id, actorUserId: userId, folders })
        return c.json({ account_id: id })
      },
    )
}
