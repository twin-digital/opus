/**
 * `/api/imap` — adding, repairing, and re-pointing an IMAP Account. Every route
 * here is on grinbox's internal interface: a credential the user holds is
 * authorized by logging in, and reaches no public path (d-fuln110d).
 *
 *  - `POST /api/imap/probe` — log in with a connection and a password, and
 *    report the folders the account holds, grinbox's proposal for the four
 *    roles, and what the account can carry. Adding an account is a probe the
 *    user answers, then a create.
 *  - `POST /api/imap/accounts` — the Account exists once the user has accepted
 *    its four folders (d-8jc4taom). Nothing is stored before that, and grinbox
 *    holds the password no longer than the adding takes.
 *  - `PUT /api/imap/accounts/:id/connection` — repair a paused Account by
 *    restating everything an IMAP Account is configured with, not the password
 *    alone (d-r3ogwkv7). The backend still cannot change (d-oevikmal).
 *  - `PATCH /api/imap/accounts/:id/folders` — name a different folder for any
 *    role at any time (d-8pdx8qsd). What grinbox already recorded keeps the
 *    standing it had; the new folders are what the next poll reads.
 *
 * No response carries the password back (r-0kn0oida).
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { ImapCredentialRejectedError } from '../../providers/imap/imap-client.js'
import {
  IMAP_PASSWORD_KIND,
  IMAP_PROVIDER_TYPE,
  imapConnectionSchema,
  imapFoldersSchema,
} from '../../providers/imap/imap-settings.js'
import { type ApiDeps, resolveActingUserId } from './deps.js'

const idParam = z.object({ id: z.coerce.number().int().positive() })

const probeBody = imapConnectionSchema.extend({ password: z.string().min(1) })

const createAccountBody = imapConnectionSchema.extend({
  name: z.string().min(1),
  address: z.string().min(1),
  password: z.string().min(1),
  folders: imapFoldersSchema,
})

const repairConnectionBody = probeBody

const repointFoldersBody = z.object({ folders: imapFoldersSchema })

/** The daemon has no IMAP transport wired; every route here says so plainly. */
function unavailable(): { error: { code: string; message: string } } {
  return {
    error: {
      code: 'imap_unavailable',
      message: 'the IMAP transport is not configured on this deployment',
    },
  }
}

/** A login the server refused as the credential: the user's to fix (d-v4mejzw5). */
function credentialRejected(message: string): { error: { code: string; message: string } } {
  return { error: { code: 'imap_credential_rejected', message } }
}

export function createImapRoutes(deps: ApiDeps) {
  return new Hono()
    .post('/api/imap/probe', zValidator('json', probeBody), async (c) => {
      const { imapProbe } = deps
      if (!imapProbe) {
        return c.json(unavailable(), 503)
      }
      const { password, ...connection } = c.req.valid('json')
      try {
        const result = await imapProbe(connection, password)
        return c.json(result)
      } catch (err) {
        if (err instanceof ImapCredentialRejectedError) {
          return c.json(credentialRejected(err.message), 401)
        }
        throw err
      }
    })
    .post('/api/imap/accounts', zValidator('json', createAccountBody), async (c) => {
      const { imapProbe } = deps
      if (!imapProbe) {
        return c.json(unavailable(), 503)
      }
      const userId = await resolveActingUserId(deps.db)
      if (userId === null) {
        return c.json({ error: { code: 'no_user', message: 'no user is installed' } }, 400)
      }
      return c.json({ error: { code: 'not_implemented', message: 'account creation is not implemented yet' } }, 501)
    })
    .put(
      '/api/imap/accounts/:id/connection',
      zValidator('param', idParam),
      zValidator('json', repairConnectionBody),
      (c) => c.json({ error: { code: 'not_implemented', message: 'connection repair is not implemented yet' } }, 501),
    )
    .patch(
      '/api/imap/accounts/:id/folders',
      zValidator('param', idParam),
      zValidator('json', repointFoldersBody),
      (c) => c.json({ error: { code: 'not_implemented', message: 're-pointing folders is not implemented yet' } }, 501),
    )
}

export { IMAP_PASSWORD_KIND, IMAP_PROVIDER_TYPE }
