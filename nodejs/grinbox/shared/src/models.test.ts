import { describe, expect, it } from 'vitest'

import { MODEL_IDS, MODELS, modelIdSchema, modelLabel } from './models.js'
import { operatorConfigSchemas } from './operators.js'

// d-kv9ipb56 — a user picks the model, from a closed set grinbox ships. The set
// is declared here so an operator naming anything else is refused when it is
// saved, rather than failing at the model service.

describe('the offered model set', () => {
  it('is closed', () => {
    expect(modelIdSchema.safeParse(MODEL_IDS[0]).success).toBe(true)
    expect(modelIdSchema.safeParse('anthropic.claude-opus-9').success).toBe(false)
    expect(modelIdSchema.safeParse('').success).toBe(false)
  })

  it('offers every identifier the schema admits, once each', () => {
    expect([...modelIdSchema.options].sort()).toEqual([...MODEL_IDS].sort())
    expect(new Set(MODEL_IDS).size).toBe(MODEL_IDS.length)
  })

  it('carries a display label for every identifier', () => {
    for (const { id, label } of MODELS) {
      expect(label.length).toBeGreaterThan(0)
      expect(modelLabel(id)).toBe(label)
    }
  })

  it('gates both configuration fields that name a model', () => {
    const outside = 'anthropic.claude-opus-9'

    const tagger = operatorConfigSchemas.llm_tagger.safeParse({
      model_id: outside,
      prompt_template: 'classify {{subject}}',
      outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
    })
    expect(tagger.success).toBe(false)

    const digest = operatorConfigSchemas.digest_delivery.safeParse({
      schedule: '0 8 * * *',
      sections: [
        {
          category: 'newsletters',
          title: 'Newsletters',
          item_template: '{{subject}}',
        },
      ],
      summary_model_id: outside,
    })
    expect(digest.success).toBe(false)
  })
})
