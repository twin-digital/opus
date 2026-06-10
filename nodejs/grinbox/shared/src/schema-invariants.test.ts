import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as enumsModule from './enums.js'
import {
  DEFAULT_LIMITS,
  changeLogActionSchema,
  changeLogEntityTypeSchema,
  contractFromConfig,
  credentialKindSchema,
  limitDefinitionSchema,
  limitScopeSchema,
  operatorConfigSchemas,
  operatorRunStatusSchema,
  operatorTypeRegistry,
  providerTypeSchema,
  resourceOperationDeclarationSchema,
  triageEventTypeSchema,
  triageStatusSchema,
  triggeredBySchema,
} from './index.js'
import { operatorTypeKeySchema, tagKeySchema, valueEnumSchema } from './operators.js'

// --- Closed enum closedness ---------------------------------------------
//
// Each closed enum mirrors a State DB CHECK constraint (data-model.md
// "Conventions" + per-table CHECK lists). Asserting `schema.options` equals the
// expected member set catches both an *added* member (Zod would accept a value
// the DB rejects) and a *dropped* member (Zod would reject a value the DB
// accepts) — the explicit invariant enums.ts calls load-bearing.

describe('closed enum closedness', () => {
  const closedEnums: {
    name: string
    schema: z.ZodEnum<Record<string, string>>
    members: string[]
    outOfSet: string
  }[] = [
    {
      name: 'triageStatusSchema',
      schema: triageStatusSchema,
      members: ['running', 'completed', 'partial', 'failed'],
      outOfSet: 'aborted',
    },
    {
      name: 'operatorRunStatusSchema',
      schema: operatorRunStatusSchema,
      members: ['pending', 'running', 'completed', 'failed', 'skipped'],
      outOfSet: 'cancelled',
    },
    {
      name: 'triggeredBySchema',
      schema: triggeredBySchema,
      members: ['message_arrival', 'user_replay', 'user_reset_and_replay', 'pipeline_changed', 'scheduled_replay'],
      outOfSet: 'manual',
    },
    {
      name: 'changeLogActionSchema',
      schema: changeLogActionSchema,
      members: ['created', 'updated', 'deleted', 'enabled', 'disabled'],
      outOfSet: 'archived',
    },
    {
      name: 'triageEventTypeSchema',
      schema: triageEventTypeSchema,
      members: ['tag_set', 'resource_op_succeeded', 'resource_op_limited', 'resource_op_failed'],
      outOfSet: 'tag_cleared',
    },
    {
      name: 'limitScopeSchema',
      schema: limitScopeSchema,
      members: ['per_window', 'per_message'],
      outOfSet: 'per_account',
    },
  ]

  it('covers exactly the closed (z.enum) schemas exported by enums.ts', () => {
    // Derive the set of closed enums from the source module rather than
    // hard-coding a count: every `z.ZodEnum` export of enums.ts must appear in
    // the table above. Adding a 7th closed enum (a new DB CHECK) without a
    // closedness test now fails *here* instead of passing silently — which the
    // prior length-6 literal assertion did not guard against.
    const sourceClosedEnumNames = Object.entries(enumsModule)
      .filter(([, schema]) => schema instanceof z.ZodEnum)
      .map(([name]) => name)
      .sort()
    const coveredNames = closedEnums.map((e) => e.name).sort()
    expect(coveredNames).toEqual(sourceClosedEnumNames)
  })

  for (const { name, schema, members, outOfSet } of closedEnums) {
    it(`${name} has exactly its documented members`, () => {
      expect([...schema.options].sort()).toEqual([...members].sort())
    })

    it(`${name} rejects an out-of-set value`, () => {
      expect(schema.safeParse(outOfSet).success).toBe(false)
    })
  }
})

// --- operatorTypeKeySchema closedness ------------------------------------
//
// `type_key` is validated in app code (not a DB CHECK), but the built-in set is
// closed in code (operators.ts). It's the package's most contract-critical
// code-resident enum — the server's registry, the config-schema map, and
// STATIC_RESOURCES are all keyed on it. Mirror the closed-enum suite's
// `.options` set-equality so adding a 6th member (without the matching registry
// entry) or dropping one is caught here.

describe('operatorTypeKeySchema closedness', () => {
  const members = ['llm_tagger', 'rule_based_tagger', 'notify', 'apply_category', 'digest_delivery']

  it('has exactly its five documented members', () => {
    expect([...operatorTypeKeySchema.options].sort()).toEqual([...members].sort())
  })

  it('rejects an unknown type_key', () => {
    expect(operatorTypeKeySchema.safeParse('webhook_tagger').success).toBe(false)
  })
})

// --- Open enum guards ----------------------------------------------------
//
// The three intentionally-open enums must stay free strings: tightening one to
// a z.enum would silently reject values the DB (which has no CHECK) accepts.

describe('open enum guards', () => {
  it('providerTypeSchema stays open (accepts imap)', () => {
    expect(providerTypeSchema.safeParse('imap').success).toBe(true)
    expect(providerTypeSchema.safeParse('gmail').success).toBe(true)
  })

  it('credentialKindSchema stays open (accepts a future kind)', () => {
    expect(credentialKindSchema.safeParse('webhook').success).toBe(true)
    expect(credentialKindSchema.safeParse('pushover').success).toBe(true)
  })

  it('changeLogEntityTypeSchema stays open (accepts a future entity type)', () => {
    expect(changeLogEntityTypeSchema.safeParse('schedule').success).toBe(true)
    expect(changeLogEntityTypeSchema.safeParse('pipeline').success).toBe(true)
  })
})

// --- limitDefinitionSchema scope <-> window correlation ------------------
//
// Mirrors the `limits` table CHECK (data-model.md:550-551): per_window requires
// a positive window_seconds; per_message requires it null.

describe('limitDefinitionSchema scope/window correlation', () => {
  const base = {
    resource: 'pushover_api' as const,
    operation: 'send_notification',
    max_count: 1,
  }

  it('accepts per_window with a positive window_seconds', () => {
    expect(
      limitDefinitionSchema.safeParse({
        ...base,
        scope: 'per_window',
        window_seconds: 600,
      }).success,
    ).toBe(true)
  })

  it('accepts per_message with a null window_seconds', () => {
    expect(
      limitDefinitionSchema.safeParse({
        ...base,
        scope: 'per_message',
        window_seconds: null,
      }).success,
    ).toBe(true)
  })

  it('rejects per_window with a null window_seconds', () => {
    const result = limitDefinitionSchema.safeParse({
      ...base,
      scope: 'per_window',
      window_seconds: null,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['window_seconds'])
    }
  })

  it('rejects per_message with a non-null window_seconds', () => {
    const result = limitDefinitionSchema.safeParse({
      ...base,
      scope: 'per_message',
      window_seconds: 600,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['window_seconds'])
    }
  })

  it('rejects a non-positive max_count', () => {
    // `max_count` is `.int().positive()`: zero (and negatives) are illegal.
    const result = limitDefinitionSchema.safeParse({
      ...base,
      max_count: 0,
      scope: 'per_window',
      window_seconds: 600,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['max_count'])
    }
  })

  it('rejects per_window with a non-positive window_seconds', () => {
    // The `.positive()` edge, distinct from the null case: a windowed limit
    // with window_seconds <= 0 is rejected by the field schema itself.
    const result = limitDefinitionSchema.safeParse({
      ...base,
      scope: 'per_window',
      window_seconds: 0,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['window_seconds'])
    }
  })
})

// --- DEFAULT_LIMITS exact fidelity ---------------------------------------
//
// Pins all six rows against the data-model "Defaults seeded per User" table
// (data-model.md:558-563), closing the silent transcription-drift hole, and
// self-validates each row against limitDefinitionSchema.

describe('DEFAULT_LIMITS', () => {
  it('seeds exactly the six documented default limits', () => {
    expect(DEFAULT_LIMITS).toEqual([
      {
        resource: 'pushover_api',
        operation: 'send_notification',
        scope: 'per_window',
        max_count: 10,
        window_seconds: 600,
      },
      {
        resource: 'pushover_api',
        operation: 'send_notification',
        scope: 'per_message',
        max_count: 1,
        window_seconds: null,
      },
      {
        resource: 'gmail_api',
        operation: 'apply_label',
        scope: 'per_window',
        max_count: 100,
        window_seconds: 600,
      },
      {
        resource: 'gmail_api',
        operation: 'send_message',
        scope: 'per_window',
        max_count: 5,
        window_seconds: 86400,
      },
      {
        resource: 'gmail_api',
        operation: 'send_message',
        scope: 'per_message',
        max_count: 1,
        window_seconds: null,
      },
      {
        resource: 'llm_bedrock',
        operation: 'invoke_model',
        scope: 'per_window',
        max_count: 50,
        window_seconds: 600,
      },
    ])
  })

  // Per-row so a failure names the offending default (Q-1), not just "a row".
  it.each(
    DEFAULT_LIMITS.map((limit) => ({
      label: `${limit.resource}.${limit.operation} (${limit.scope})`,
      limit,
    })),
  )('default limit $label satisfies limitDefinitionSchema', ({ limit }) => {
    expect(limitDefinitionSchema.safeParse(limit).success).toBe(true)
  })
})

// --- valueEnumSchema duplicate-free --------------------------------------
//
// Undocumented-in-spec-but-intended invariant (operators.ts:46), confirmed
// intended by the maintainer and now recorded in data-model.md.

describe('valueEnumSchema', () => {
  it('accepts a duplicate-free enum', () => {
    expect(valueEnumSchema.safeParse(['yes', 'no']).success).toBe(true)
  })

  it('rejects an enum containing duplicates', () => {
    expect(valueEnumSchema.safeParse(['yes', 'yes']).success).toBe(false)
  })

  it('rejects an enum containing an empty-string element', () => {
    // Per-element `.min(1)`: a value enum may not declare an empty value.
    const result = valueEnumSchema.safeParse(['yes', ''])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([1])
    }
  })
})

// --- tagKeySchema --------------------------------------------------------

describe('tagKeySchema', () => {
  it('accepts a non-empty key', () => {
    expect(tagKeySchema.safeParse('urgency').success).toBe(true)
  })

  it('rejects an empty key', () => {
    expect(tagKeySchema.safeParse('').success).toBe(false)
  })
})

// --- resourceOperationDeclarationSchema missing branches -----------------

describe('resourceOperationDeclarationSchema additional branches', () => {
  it('rejects a duplicate operation in the list', () => {
    const result = resourceOperationDeclarationSchema.safeParse({
      resource: 'gmail_api',
      operations: ['apply_label', 'apply_label'],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['operations'])
    }
  })

  it('rejects an empty operations array', () => {
    expect(
      resourceOperationDeclarationSchema.safeParse({
        resource: 'gmail_api',
        operations: [],
      }).success,
    ).toBe(false)
  })
})

// --- contractFromConfig: the two uncovered types -------------------------

describe('contractFromConfig — remaining declared types', () => {
  it('derives a Rule-based Tagger output with the empty-resources branch', () => {
    const contract = contractFromConfig('rule_based_tagger', {
      output_tag_key: 'urgency',
      output_value_enum: ['high', 'low'],
      rules: [{ match: "from contains 'boss@'", output: 'high' }],
      fallback: { output: 'low' },
    })
    expect(contract.outputs).toEqual([{ key: 'urgency', valueEnum: ['high', 'low'] }])
    // Rule-based Tagger is the only type with no Resource operations.
    expect(contract.resources).toEqual([])
    expect(contract.inputs).toEqual([])
  })

  it('declares the Apply Category gmail_api.apply_label resource and no outputs', () => {
    const contract = contractFromConfig('apply_category', {
      category_template: 'Grinbox/VIP',
    })
    expect(contract.outputs).toEqual([])
    expect(contract.resources).toEqual([{ resource: 'gmail_api', operations: ['apply_label'] }])
    expect(contract.inputs).toEqual([])
  })
})

// --- Action `when` value-gate schema -------------------------------------
//
// The optional `when` clause on Notify / Apply Category is the operator-level
// firing condition. Absence must stay valid (backward-compatible: existing
// configs without `when` still fire); a present `when` must be well-formed
// (`tag_key` present, `equals` non-empty).

describe('Action `when` gate schema', () => {
  const notify = operatorConfigSchemas.notify
  const applyCategory = operatorConfigSchemas.apply_category

  it('notify accepts a config without `when` (backward-compatible)', () => {
    const parsed = notify.safeParse({
      message_template: 'hi',
      credentials_id: 1,
    })
    expect(parsed.success).toBe(true)
  })

  it('notify accepts a well-formed `when`', () => {
    const parsed = notify.safeParse({
      message_template: 'hi',
      credentials_id: 1,
      when: { tag_key: 'urgency', equals: ['high', 'critical'] },
    })
    expect(parsed.success).toBe(true)
  })

  it('apply_category accepts a config with and without `when`', () => {
    expect(applyCategory.safeParse({ category_template: 'A' }).success).toBe(true)
    expect(
      applyCategory.safeParse({
        category_template: 'A',
        when: { tag_key: 'topic', equals: ['Travel'] },
      }).success,
    ).toBe(true)
  })

  it('rejects a `when` with an empty `equals`', () => {
    const parsed = notify.safeParse({
      message_template: 'hi',
      credentials_id: 1,
      when: { tag_key: 'urgency', equals: [] },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a `when` missing `tag_key`', () => {
    const parsed = applyCategory.safeParse({
      category_template: 'A',
      when: { equals: ['high'] },
    })
    expect(parsed.success).toBe(false)
  })
})

// --- contract.inputs is always [] in MVP ---------------------------------

describe('contract.inputs', () => {
  const configs: Record<string, unknown> = {
    llm_tagger: {
      model_id: 'm',
      prompt_template: 'p',
      outputs: [{ tag_key: 'is_vip', value_enum: ['yes', 'no'] }],
    },
    rule_based_tagger: {
      output_tag_key: 'urgency',
      output_value_enum: ['high', 'low'],
      rules: [],
      fallback: { output: 'low' },
    },
    notify: { message_template: 'x', credentials_id: 1 },
    apply_category: { category_template: 'Grinbox/VIP' },
    digest_delivery: {
      schedule: '0 8 * * *',
      model_id: 'm',
      prompt_template: 'p',
    },
  }

  // Per-type so a failure names the offending operator type (Q-1).
  it.each(Object.entries(configs))('is empty for %s', (typeKey, config) => {
    const contract = contractFromConfig(typeKey as Parameters<typeof contractFromConfig>[0], config as never)
    expect(contract.inputs).toEqual([])
  })
})

// --- operatorTypeRegistry smoke test -------------------------------------

describe('operatorTypeRegistry', () => {
  const keys = ['llm_tagger', 'rule_based_tagger', 'notify', 'apply_category', 'digest_delivery'] as const

  it('has all five declared type keys', () => {
    expect(Object.keys(operatorTypeRegistry).sort()).toEqual([...keys].sort())
  })

  it('each entry.configSchema is the matching operatorConfigSchemas member', () => {
    for (const key of keys) {
      expect(operatorTypeRegistry[key].configSchema).toBe(operatorConfigSchemas[key])
    }
  })

  // The registry's per-type `contractFromConfig` wrapper closures are the
  // integration seam the server consumes; assert each one actually derives the
  // same Contract as the top-level `contractFromConfig` (Finding C — the
  // wrappers were never invoked before).
  const registryConfigs: Record<(typeof keys)[number], unknown> = {
    llm_tagger: {
      model_id: 'm',
      prompt_template: 'p',
      outputs: [{ tag_key: 'is_vip', value_enum: ['yes', 'no'] }],
    },
    rule_based_tagger: {
      output_tag_key: 'urgency',
      output_value_enum: ['high', 'low'],
      rules: [{ match: "from contains 'boss@'", output: 'high' }],
      fallback: { output: 'low' },
    },
    notify: { message_template: 'x', credentials_id: 1 },
    apply_category: { category_template: 'Grinbox/VIP' },
    digest_delivery: {
      schedule: '0 8 * * *',
      model_id: 'm',
      prompt_template: 'p',
    },
  }

  it.each(keys)('%s registry wrapper derives the same Contract as contractFromConfig', (key) => {
    const config = registryConfigs[key]
    const viaRegistry = operatorTypeRegistry[key].contractFromConfig(config as never)
    const viaTopLevel = contractFromConfig(key, config as never)
    expect(viaRegistry).toEqual(viaTopLevel)
  })
})
