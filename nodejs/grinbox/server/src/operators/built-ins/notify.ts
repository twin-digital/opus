/**
 * O4 — Notify. An Action that sends an out-of-band push to the user (Pushover
 * today) when the current Triage warrants it (glossary "Notify",
 * architecture.md "Operator model" → Actions). It declares no output Tags;
 * its effect is the side effect on `pushover_api.send_notification`.
 *
 * Two gates decide whether the push fires:
 *  1. The operator-level `when` clause (see `action-gate.ts`) — a clean no-op
 *     when the Triage's gated Tag doesn't match, so an always-eligible Action
 *     can still pick the Triages it cares about (e.g. urgency ∈ [high]).
 *  2. The per-Message Limit on the operation (glossary "Notify": default 1),
 *     enforced inside the metered client. A replay of the same Message returns
 *     `skipped_by_limit`, which is the documented dedupe path — NOT a failure.
 *
 * Declares `pushover_api.send_notification` (the static Contract for `notify`).
 * The **real** Pushover client (a later task) owns auth via the referenced
 * Credential, retries, metering, and the per-Message Limit; this operator only
 * renders the message, calls `send_notification`, and reacts to the
 * {@link ResourceOpResult}.
 */

import { contractFromConfig, gmailMessageUrl, operatorConfigSchemas } from '@twin-digital/grinbox-shared'
import type { OperatorRunInput, OperatorRunResult, OperatorType, PushoverClient } from '../types.js'
import { shouldFire } from './action-gate.js'
import { renderTemplate } from './template.js'

/** Thrown when the Pushover call itself failed after the client's retries. */
export class NotifyError extends Error {
  override readonly name = 'NotifyError'
}

/**
 * Evaluates the `when` gate, and if it fires renders `message_template` and
 * sends one Pushover notification. Reacts to each {@link ResourceOpResult}:
 *  - `succeeded`: done.
 *  - `skipped_by_limit`: clean no-op. An Action's external effect is optional —
 *    the per-Message Limit is exactly how a replayed Triage avoids re-notifying
 *    (glossary "Notify"), so a Limit skip is the expected dedupe outcome, not a
 *    failed run. (Contrast the LLM Tagger, whose Tags are required.)
 *  - `failed`: throw (the worker marks the run failed).
 *
 * Returns no Tags in every case (Actions produce no output Tags).
 */
async function run(input: OperatorRunInput<'notify'>): Promise<OperatorRunResult> {
  const { config, message, tags, resources, signal } = input

  if (!shouldFire(config.when, tags)) {
    // Gate didn't match: clean no-op, no Resource call.
    return { tags: [] }
  }

  const client: PushoverClient | undefined = resources.pushover_api
  if (!client) {
    throw new NotifyError('notify requires the pushover_api client but it was not provided')
  }

  const rendered = renderTemplate(config.message_template, message, tags)

  signal.throwIfAborted()

  // Deep-link the push back to the Message that triggered it. The id is the
  // Gmail API message id (`backend_message_id`), which opens in Gmail web.
  const result = await client.send_notification({
    message: rendered,
    url: gmailMessageUrl(message.backendMessageId),
    url_title: 'Open in Gmail',
  })

  switch (result.outcome) {
    case 'succeeded':
    case 'skipped_by_limit':
      // Sent, or de-duped by the per-Message Limit — both are clean no-ops for
      // an Action (no Tags either way).
      return { tags: [] }
    case 'failed':
      throw new NotifyError(`notify send_notification failed: ${result.error.message}`)
  }
}

/** Notify references its Pushover Credential by `credentials_id`. */
function extractCredentialRefsFromOperatorConfig(config: OperatorRunInput<'notify'>['config']): number[] {
  return [config.credentials_id]
}

export const notifyType: OperatorType<'notify'> = {
  type_key: 'notify',
  code_version: '1',
  configSchema: operatorConfigSchemas.notify,
  contractFromConfig: (c) => contractFromConfig('notify', c),
  run,
  extractCredentialRefsFromOperatorConfig,
}
