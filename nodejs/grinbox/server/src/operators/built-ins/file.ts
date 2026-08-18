/**
 * File. An Action that moves the Message into a folder of the user's Account
 * (d-jj2mymbi). The folder is named literally in the Operator's own config
 * rather than composed from the Message, and is matched against the names the
 * server lists character for character (d-k8va629q). Where the Account has no
 * folder of that name the operation fails and grinbox creates none
 * (r-g1iwlbzs).
 *
 * Filing takes the Message out of the arrival folder and puts it where the user
 * named, keeping every other marker and leaving it findable (d-93swk5rr).
 *
 * Two gates decide whether the Message is filed:
 *  1. The operator-level `when` clause (see `action-gate.ts`).
 *  2. The Limit on `mailbox.file`, enforced inside the metered client; a denied
 *     call returns `skipped_by_limit`.
 *
 * An Account that cannot carry the operation is not refused at save
 * (d-qzxvoph1): the dispatch fails the run here, naming what the Account cannot
 * do and why.
 */

import { contractFromConfig, operatorConfigSchemas } from '@grinbox/shared'
import type { MailboxClient, OperatorRunInput, OperatorRunResult, OperatorType } from '../types.js'
import { shouldFire } from './action-gate.js'

/** Thrown when the file call itself failed after the client's retries. */
export class FileError extends Error {
  override readonly name = 'FileError'
}

async function run(input: OperatorRunInput<'file'>): Promise<OperatorRunResult> {
  const { config, message, tags, resources, signal } = input

  if (!shouldFire(config.when, tags)) {
    return { tags: [] }
  }

  const client: MailboxClient | undefined = resources.mailbox
  if (!client) {
    throw new FileError('file requires the mailbox client but it was not provided')
  }

  signal.throwIfAborted()

  const result = await client.file({
    backendMessageId: message.backendMessageId,
    folder: config.folder,
  })

  switch (result.outcome) {
    case 'succeeded':
    case 'skipped_by_limit':
      return { tags: [] }
    case 'failed':
      throw new FileError(`file failed: ${result.error.message}`)
  }
}

/** File uses no Credentials (mailbox auth is account-side). */
function extractCredentialRefsFromOperatorConfig(): number[] {
  return []
}

export const fileType: OperatorType<'file'> = {
  type_key: 'file',
  code_version: '1',
  configSchema: operatorConfigSchemas.file,
  contractFromConfig: (c) => contractFromConfig('file', c),
  run,
  extractCredentialRefsFromOperatorConfig,
}
