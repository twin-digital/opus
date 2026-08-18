/**
 * Apply Category. An Action that adds a Grinbox-owned Category to the Message on
 * its backend (Gmail: a label of the same name) when the current Triage
 * warrants it (d-bnw0na3n, d-hv2uue12). It declares no output Tags; its effect
 * is the side effect on
 * `mailbox.apply_category`.
 *
 * Two gates decide whether the Category is applied:
 *  1. The operator-level `when` clause (see `action-gate.ts`). Apply Category
 *     typically categorizes every Message, so `when` is usually absent (always
 *     fires); when present it restricts firing the same way Notify's does.
 *  2. The Limit on the operation, enforced inside the metered client; a denied
 *     call returns `skipped_by_limit`.
 *
 * Declares `mailbox.apply_category` (the static Contract for `apply_category`).
 * The metered mailbox client owns auth, retries, metering, and Limit
 * enforcement; this operator only renders the Category name, calls
 * `apply_category`, and reacts to the {@link ResourceOpResult}.
 */

import { contractFromConfig, operatorConfigSchemas } from '@grinbox/shared'
import type { MailboxClient, OperatorRunInput, OperatorRunResult, OperatorType } from '../types.js'
import { shouldFire } from './action-gate.js'
import { applyRenderedCategory } from './category-apply.js'

export { CategoryApplyError as ApplyCategoryError, EmptyCategoryError } from './category-apply.js'

/**
 * Evaluates the `when` gate, and if it fires renders `category_template`, makes
 * the result carriable, and applies it (see `category-apply.ts`). A Limit denial
 * is a clean no-op — an Action's outside effect is optional, unlike the LLM
 * Tagger's Tags. A failed call throws and the worker marks the run failed.
 *
 * Returns no Tags in every case (Actions produce no output Tags).
 */
async function run(input: OperatorRunInput<'apply_category'>): Promise<OperatorRunResult> {
  const { config, message, tags, resources, signal } = input

  if (!shouldFire(config.when, tags)) {
    // Gate didn't match: clean no-op, no Resource call.
    return { tags: [] }
  }

  const client: MailboxClient | undefined = resources.mailbox
  if (!client) {
    throw new Error('apply_category requires the mailbox client but it was not provided')
  }

  signal.throwIfAborted()

  await applyRenderedCategory(client, config.category_template, message, tags)
  return { tags: [] }
}

/** Apply Category uses no Credentials (mailbox auth is account-side). */
function extractCredentialRefsFromOperatorConfig(): number[] {
  return []
}

export const applyCategoryType: OperatorType<'apply_category'> = {
  type_key: 'apply_category',
  code_version: '1',
  configSchema: operatorConfigSchemas.apply_category,
  contractFromConfig: (c) => contractFromConfig('apply_category', c),
  run,
  extractCredentialRefsFromOperatorConfig,
}
