/**
 * Archive. An Action that removes the Message from its backend inbox (Gmail:
 * `users.messages.modify` removing the `INBOX` label) when the current Triage
 * warrants it. The Message itself is untouched — it keeps its other labels and
 * stays in "All Mail". It declares no output Tags; its effect is the side
 * effect on `mailbox.archive`.
 *
 * Two gates decide whether the Message is archived:
 *  1. The operator-level `when` clause (see `action-gate.ts`). An Archive with
 *     no `when` archives every Message, so the gate is usually present.
 *  2. The Limit on the operation, enforced inside the metered client; a denied
 *     call returns `skipped_by_limit`.
 *
 * Declares `mailbox.archive` (the static Contract for `archive`). The
 * metered mailbox client owns auth, retries, metering, and Limit enforcement;
 * this operator only evaluates the gate, calls `archive`, and reacts to the
 * {@link ResourceOpResult}.
 *
 * The poller's source-state tracking absorbs the effect without re-triaging:
 * the Message row is kept, the next History delta / reconcile pass flips its
 * `source_state` to `archived`, and the `isNew` upsert gate means no new
 * Triage is enqueued for a state change.
 */

import { contractFromConfig, operatorConfigSchemas } from '@grinbox/shared'
import type { MailboxClient, OperatorRunInput, OperatorRunResult, OperatorType } from '../types.js'
import { shouldFire } from './action-gate.js'

/** Thrown when the archive call itself failed after the client's retries. */
export class ArchiveError extends Error {
  override readonly name = 'ArchiveError'
}

/**
 * Evaluates the `when` gate, and if it fires archives the Message. Reacts to
 * each {@link ResourceOpResult}:
 *  - `succeeded`: done.
 *  - `skipped_by_limit`: clean no-op. An Action's external effect is optional,
 *    so a Limit denial is an expected outcome, not a failed run.
 *  - `failed`: throw (the worker marks the run failed).
 *
 * Returns no Tags in every case (Actions produce no output Tags).
 */
async function run(input: OperatorRunInput<'archive'>): Promise<OperatorRunResult> {
  const { config, message, tags, resources, signal } = input

  if (!shouldFire(config.when, tags)) {
    // Gate didn't match: clean no-op, no Resource call.
    return { tags: [] }
  }

  const client: MailboxClient | undefined = resources.mailbox
  if (!client) {
    throw new ArchiveError('archive requires the mailbox client but it was not provided')
  }

  signal.throwIfAborted()

  const result = await client.archive({
    backendMessageId: message.backendMessageId,
  })

  switch (result.outcome) {
    case 'succeeded':
    case 'skipped_by_limit':
      return { tags: [] }
    case 'failed':
      throw new ArchiveError(`archive failed: ${result.error.message}`)
  }
}

/** Archive uses no Credentials (mailbox auth is account-side). */
function extractCredentialRefsFromOperatorConfig(): number[] {
  return []
}

export const archiveType: OperatorType<'archive'> = {
  type_key: 'archive',
  code_version: '1',
  configSchema: operatorConfigSchemas.archive,
  contractFromConfig: (c) => contractFromConfig('archive', c),
  run,
  extractCredentialRefsFromOperatorConfig,
}
