import type { DigestDeliveryConfig } from '@grinbox/shared'
import { describe, expect, it } from 'vitest'
import { digestDeliveryType } from './digest-delivery.js'

/**
 * Spec: the digest-delivery registration (digest-delivery.ts module header).
 * The type registers so the save path works (config validation incl. croner
 * schedule/timezone checks, code-version capture, Contract derivation), while
 * its per-Message `run` is a loud guard — the type is schedule-triggered and
 * Triage enqueue must never dispatch it.
 */

const validConfig: DigestDeliveryConfig = {
  schedule: '0 20 * * *',
  sections: [
    {
      category: 'bill',
      title: 'Bills',
      render: 'list',
      item_template: '{{tag.payee}} — {{tag.amount}}',
    },
  ],
  summary_model_id: null,
}

describe('digestDeliveryType', () => {
  it('registers at code_version 1', () => {
    expect(digestDeliveryType.type_key).toBe('digest_delivery')
    expect(digestDeliveryType.code_version).toBe('1')
  })

  describe('configSchema (shared shape + croner validation)', () => {
    it('accepts a valid schedule, with and without a timezone', () => {
      expect(digestDeliveryType.configSchema.safeParse(validConfig).success).toBe(true)
      expect(
        digestDeliveryType.configSchema.safeParse({
          ...validConfig,
          timezone: 'Asia/Tokyo',
        }).success,
      ).toBe(true)
    })

    it('rejects a schedule croner cannot parse, on the schedule path', () => {
      const result = digestDeliveryType.configSchema.safeParse({
        ...validConfig,
        schedule: 'not a cron',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['schedule'])
        expect(result.error.issues[0]?.message).toContain('not a valid cron expression')
      }
    })

    it('rejects an unknown timezone, on the timezone path', () => {
      const result = digestDeliveryType.configSchema.safeParse({
        ...validConfig,
        timezone: 'Mars/Olympus',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['timezone'])
        expect(result.error.issues[0]?.message).toContain('not a valid IANA timezone')
      }
    })
  })

  it('derives the digest Contract: collation inputs, no outputs; LLM + send declared', () => {
    const contract = digestDeliveryType.contractFromConfig(validConfig)
    expect(contract.inputs).toEqual(['digest_category', 'payee', 'amount'])
    expect(contract.outputs).toEqual([])
    expect(contract.resources).toEqual([
      { resource: 'llm_bedrock', operations: ['invoke_model'] },
      { resource: 'mail_sender', operations: ['send_message'] },
    ])
  })

  it('references no Credentials', () => {
    expect(digestDeliveryType.extractCredentialRefsFromOperatorConfig(validConfig)).toEqual([])
  })

  it('the per-Message run throws (schedule-triggered; never dispatched)', async () => {
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: the guard ignores its input
      digestDeliveryType.run(undefined as any),
    ).rejects.toThrow(/schedule-triggered/)
  })
})
