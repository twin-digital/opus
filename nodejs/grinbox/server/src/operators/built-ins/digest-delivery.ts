/**
 * Digest delivery. The schedule-triggered Action — an **edition**: on its cron
 * `schedule`, it collates the Messages ingested since the previous successful
 * digest into its configured sections by their `digest_category` Tag
 * (deterministic rendering; docs/digest-design.md) and emails the result via
 * `mail_sender.send_message` to the Account owner's own address.
 * `llm_bedrock.invoke_model` is declared for the optional per-section `llm`
 * prose blocks — item composition itself makes no model calls.
 *
 * Unlike every other built-in, its runs are **not** per-Message: shared's
 * `OPERATOR_TYPE_TRIGGERS` marks the type `schedule`, Triage enqueue skips it,
 * and the digest scheduler (`digest/digest-scheduler.ts`) drives its runs from
 * `digest_runs` rows instead of `triage_operator_runs`. The runtime lives in
 * `digest/digest-runner.ts` — the per-Message `run` below exists only to
 * satisfy the registry tuple and throws if anything dispatches it.
 *
 * This registration is what makes the type saveable: the save path resolves
 * `type_code_version` from the behavioral registry, and the config schema here
 * layers croner-backed `schedule`/`timezone` validation over shared's
 * declarative shape (shared stays free of the scheduler dependency), so an
 * unschedulable cron expression is rejected at Operator save rather than
 * discovered by the scheduler.
 */

import { type DigestDeliveryConfig, contractFromConfig, operatorConfigSchemas } from '@grinbox/shared'
import type { z } from 'zod'
import { validateDigestSchedule } from '../../digest/schedule.js'
import type { OperatorRunResult, OperatorType } from '../types.js'

/**
 * Shared's digest config schema plus server-side schedule validation: croner
 * must accept the `schedule` pattern, and — separately, so the error lands on
 * the field the user actually got wrong — the (optional) `timezone`.
 */
const configSchema: z.ZodType<DigestDeliveryConfig> = operatorConfigSchemas.digest_delivery.superRefine((cfg, ctx) => {
  const scheduleError = validateDigestSchedule(cfg.schedule)
  if (scheduleError !== null) {
    ctx.addIssue({
      code: 'custom',
      message: `schedule is not a valid cron expression: ${scheduleError}`,
      path: ['schedule'],
    })
    return
  }
  if (cfg.timezone !== undefined) {
    const timezoneError = validateDigestSchedule(cfg.schedule, cfg.timezone)
    if (timezoneError !== null) {
      ctx.addIssue({
        code: 'custom',
        message: `timezone is not a valid IANA timezone: ${timezoneError}`,
        path: ['timezone'],
      })
    }
  }
})

/**
 * Never dispatched: the type is schedule-triggered, so Triage enqueue creates
 * no run rows for it. Throwing (rather than a silent no-op) makes any future
 * bypass of that exclusion loud.
 */
async function run(): Promise<OperatorRunResult> {
  throw new Error(
    'digest_delivery is schedule-triggered and cannot run inside a Triage; its runs are driven by the digest scheduler',
  )
}

/** Digest delivery uses no Credentials (Gmail auth is account-side). */
function extractCredentialRefsFromOperatorConfig(): number[] {
  return []
}

export const digestDeliveryType: OperatorType<'digest_delivery'> = {
  type_key: 'digest_delivery',
  code_version: '1',
  configSchema,
  contractFromConfig: (c) => contractFromConfig('digest_delivery', c),
  run,
  extractCredentialRefsFromOperatorConfig,
}
