/**
 * Set Aside. One thing the user configures to mark a Message for later on every
 * Account they have, carried out the best way each Account's backend allows
 * (r-blqzjemx, d-hj9nac5f): on an Account that can apply Categories it applies
 * `category_template`; on one that cannot but can file, it files into `folder`;
 * on an Account that can do neither it fails.
 *
 * Which branch runs is read from the Account's own stored declaration
 * (d-bzw8qoiy) — the same declaration the resource dispatch checks. An Account
 * that has never polled has no declaration and is not gated (d-p9q9dxqn): the
 * Category branch is attempted, and the backend's own refusal is what fails the
 * run.
 */

import { contractFromConfig, operatorConfigSchemas } from '@grinbox/shared'
import { supports } from '../../providers/account-capabilities.js'
import type { MailboxClient, OperatorRunInput, OperatorRunResult, OperatorType } from '../types.js'
import { shouldFire } from './action-gate.js'
import { applyRenderedCategory } from './category-apply.js'

/** Thrown when neither half of a Set Aside can run on this Account. */
export class SetAsideUnsupportedError extends Error {
  override readonly name = 'SetAsideUnsupportedError'
}

/** Thrown when the file call itself failed after the client's retries. */
export class SetAsideFileError extends Error {
  override readonly name = 'SetAsideFileError'
}

async function run(input: OperatorRunInput<'set_aside'>): Promise<OperatorRunResult> {
  const { config, message, tags, resources, signal, account } = input

  if (!shouldFire(config.when, tags)) {
    return { tags: [] }
  }

  const client: MailboxClient | undefined = resources.mailbox
  if (!client) {
    throw new SetAsideUnsupportedError('set_aside requires the mailbox client but it was not provided')
  }

  const declaration = account?.capabilities ?? null
  const canFile = supports(declaration, 'file')
  // No declaration means never polled: attempt the Category and let the
  // backend refuse it, rather than treating silence as inability.
  const canCategorize = declaration === null || supports(declaration, 'apply_category')

  signal.throwIfAborted()

  if (canCategorize) {
    await applyRenderedCategory(client, config.category_template, message, tags)
    return { tags: [] }
  }

  if (canFile) {
    const result = await client.file({ backendMessageId: message.backendMessageId, folder: config.folder })
    switch (result.outcome) {
      case 'succeeded':
      case 'skipped_by_limit':
        return { tags: [] }
      case 'failed':
        throw new SetAsideFileError(`file failed: ${result.error.message}`)
    }
  }

  throw new SetAsideUnsupportedError(
    'this account can neither apply a category nor file, so a message cannot be set aside on it',
  )
}

/** Set Aside uses no Credentials (mailbox auth is account-side). */
function extractCredentialRefsFromOperatorConfig(): number[] {
  return []
}

export const setAsideType: OperatorType<'set_aside'> = {
  type_key: 'set_aside',
  code_version: '1',
  configSchema: operatorConfigSchemas.set_aside,
  contractFromConfig: (c) => contractFromConfig('set_aside', c),
  run,
  extractCredentialRefsFromOperatorConfig,
}
