import { formatMoneyDisplay } from '@grinbox/shared'
import { describe, expect, it } from 'vitest'
import { moneyTypedTagKeys } from './money-display.js'

// The display form itself is @grinbox/shared's and is specified there; this
// asserts the digest consumes the shared conventions (d-oc073wsp, d-b1ntd8go:
// symbol before the amount, ISO code before the amount space-separated).
describe('formatMoneyDisplay (shared, consumed by the digest)', () => {
  it('renders the shared conventions', () => {
    expect(formatMoneyDisplay('19503:USD')).toBe('$195.03')
    expect(formatMoneyDisplay('123456:CHF')).toBe('CHF 1,234.56')
    expect(formatMoneyDisplay('1000:JPY')).toBe('¥1,000')
  })

  it('returns null for anything not in the stored money form (renders verbatim, d-m6ingqyv)', () => {
    expect(formatMoneyDisplay('195.03 USD')).toBeNull()
    expect(formatMoneyDisplay('19503:usd')).toBeNull()
    expect(formatMoneyDisplay('not money')).toBeNull()
    expect(formatMoneyDisplay('')).toBeNull()
  })
})

describe('moneyTypedTagKeys (d-m6ingqyv)', () => {
  it('collects keys the enabled LLM taggers type as extracted money', () => {
    const keys = moneyTypedTagKeys([
      {
        type_key: 'llm_tagger',
        config_json: JSON.stringify({
          model_id: 'm',
          prompt_template: 'p',
          outputs: [
            { tag_key: 'amount', value_type: 'money' },
            { tag_key: 'vendor', value_type: 'string' },
            { tag_key: 'urgency', value_enum: ['high', 'low'] },
          ],
        }),
      },
      { type_key: 'rule_based_tagger', config_json: '{}' },
    ])
    expect(keys).toEqual(new Set(['amount']))
  })

  it('ignores configs that do not parse', () => {
    expect(moneyTypedTagKeys([{ type_key: 'llm_tagger', config_json: 'not json' }])).toEqual(new Set())
  })
})
