/**
 * Apply Category. An Action that adds a Grinbox-owned Category to the Message on
 * its backend (Gmail label today) when the current Triage warrants it (glossary
 * "Apply Category", architecture.md "Operator model" → Actions). It declares no
 * output Tags; its effect is the side effect on `gmail_api.apply_label`.
 *
 * Two gates decide whether the label is applied:
 *  1. The operator-level `when` clause (see `action-gate.ts`). Apply Category
 *     typically categorizes every Message, so `when` is usually absent (always
 *     fires); when present it restricts firing the same way Notify's does.
 *  2. The Limit on the operation, enforced inside the metered client; a denied
 *     call returns `skipped_by_limit`.
 *
 * Declares `gmail_api.apply_label` (the static Contract for `apply_category`).
 * The **real** Gmail client (a later task) owns auth, retries, metering, and
 * Limit enforcement; this operator only renders the label name, calls
 * `apply_label`, and reacts to the {@link ResourceOpResult}.
 */

import { contractFromConfig, operatorConfigSchemas } from '@twin-digital/grinbox-shared'
import type { GmailClient, OperatorRunInput, OperatorRunResult, OperatorType } from '../types.js'
import { shouldFire } from './action-gate.js'
import { renderTemplate } from './template.js'

/** Thrown when the Gmail label call itself failed after the client's retries. */
export class ApplyCategoryError extends Error {
  override readonly name = 'ApplyCategoryError'
}

/**
 * Evaluates the `when` gate, and if it fires renders `category_template` to a
 * label name and applies it. Reacts to each {@link ResourceOpResult}:
 *  - `succeeded`: done.
 *  - `skipped_by_limit`: clean no-op. An Action's external effect is optional,
 *    so a Limit denial is an expected outcome, not a failed run (contrast the
 *    LLM Tagger, whose Tags are required).
 *  - `failed`: throw (the worker marks the run failed).
 *
 * Returns no Tags in every case (Actions produce no output Tags).
 */
async function run(input: OperatorRunInput<'apply_category'>): Promise<OperatorRunResult> {
  const { config, message, tags, resources, signal } = input

  if (!shouldFire(config.when, tags)) {
    // Gate didn't match: clean no-op, no Resource call.
    return { tags: [] }
  }

  const client: GmailClient | undefined = resources.gmail_api
  if (!client) {
    throw new ApplyCategoryError('apply_category requires the gmail_api client but it was not provided')
  }

  const label = renderTemplate(config.category_template, message, tags)

  signal.throwIfAborted()

  const result = await client.apply_label({
    backendMessageId: message.backendMessageId,
    label,
  })

  switch (result.outcome) {
    case 'succeeded':
    case 'skipped_by_limit':
      return { tags: [] }
    case 'failed':
      throw new ApplyCategoryError(`apply_category apply_label failed: ${result.error.message}`)
  }
}

/** Apply Category uses no Credentials (Gmail auth is account-side). */
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
