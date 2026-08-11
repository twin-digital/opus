/**
 * O4 — Notify. An Action that sends an out-of-band push to the user (Pushover
 * today) when the current Triage warrants it (d-oectpw7n). It declares no
 * output Tags;
 * its effect is the side effect on `pushover_api.send_notification`.
 *
 * Three gates decide whether the push fires:
 *  1. The operator-level `when` clause (see `action-gate.ts`) — a clean no-op
 *     when the Triage's gated Tag doesn't match, so an always-eligible Action
 *     can still pick the Triages it cares about (e.g. urgency ∈ [high]).
 *  2. The notification cooldown, when the config names a `notification_kind`
 *     (d-vn2jdxbs): a push whose kind was delivered inside the user's interval
 *     sends nothing and completes (d-5amonj40). Checked BEFORE any Resource is
 *     reached, so a suppressed push counts against no Limit (d-6ptxams7).
 *  3. The per-Message Limit on the operation (default 1), enforced inside the
 *     metered client. A replay of the same Message returns `skipped_by_limit`,
 *     which is the dedupe path (d-isyan49o) — NOT a failure.
 *
 * Declares `pushover_api.send_notification` (the static Contract for `notify`).
 * The **real** Pushover client (a later task) owns auth via the referenced
 * Credential, retries, metering, and the per-Message Limit; this operator only
 * renders the message, calls `send_notification`, and reacts to the
 * {@link ResourceOpResult}.
 */

import { contractFromConfig, operatorConfigSchemas } from '@grinbox/shared'
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
 *    (r-zagpfz75), so a Limit skip is the expected dedupe outcome, not a
 *    failed run. (Contrast the LLM Tagger, whose Tags are required.)
 *  - `failed`: throw (the worker marks the run failed).
 *
 * Returns no Tags in every case (Actions produce no output Tags).
 */
async function run(input: OperatorRunInput<'notify'>): Promise<OperatorRunResult> {
  const { config, message, tags, resources, signal, notifications } = input

  if (!shouldFire(config.when, tags)) {
    // Gate didn't match: clean no-op, no Resource call.
    return { tags: [] }
  }

  // Cooldown check before any Resource is reached (d-6ptxams7). Only a config
  // naming a kind has one (d-k3wq81vn); the gate records the suppression event
  // against this run itself (d-e9jslw4x).
  const kind = config.notification_kind
  if (kind !== undefined && notifications !== undefined) {
    const verdict = await notifications.checkCooldown(kind)
    if (verdict.suppressed) {
      // Send nothing, complete: a suppressed push is an outcome, not a failure
      // (d-5amonj40); the triage settles as it would have.
      return { tags: [] }
    }
  }

  const client: PushoverClient | undefined = resources.pushover_api
  if (!client) {
    throw new NotifyError('notify requires the pushover_api client but it was not provided')
  }

  const rendered = renderTemplate(config.message_template, message, tags)

  signal.throwIfAborted()

  // The push carries the rendered text and nothing else: r-etj0gluz confines
  // naming a mail backend to the account the message arrived on, and a link back
  // into a backend's own web client names one everywhere the push goes.
  const result = await client.send_notification({ message: rendered })

  switch (result.outcome) {
    case 'succeeded':
      // A delivered kind-named push is recorded so later runs of the kind can
      // defer to it (r-lph86tsg); a kind-less push is grouped with nothing.
      if (kind !== undefined && notifications !== undefined) {
        await notifications.recordPush(kind)
      }
      return { tags: [] }
    case 'skipped_by_limit':
      // De-duped by the per-Message Limit — a clean no-op for an Action, and
      // not a delivered push, so nothing is recorded for later runs to defer to.
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
