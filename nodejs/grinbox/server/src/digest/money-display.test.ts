import { describe, expect, it } from 'vitest'
import { formatMoneyDisplay, moneyTypedTagKeys } from './money-display.js'

describe('formatMoneyDisplay (r-735kq72h, d-oc073wsp, d-b1ntd8go)', () => {
  it('renders a known symbol before the amount', () => {
    expect(formatMoneyDisplay('19503:USD')).toBe('$195.03')
    expect(formatMoneyDisplay('100:EUR')).toBe('€1.00')
    expect(formatMoneyDisplay('99:GBP')).toBe('£0.99')
  })

  it('groups thousands with commas and marks the decimal with a period', () => {
    expect(formatMoneyDisplay('123456789:USD')).toBe('$1,234,567.89')
  })

  it('leads a negative amount with a minus sign', () => {
    expect(formatMoneyDisplay('-19503:USD')).toBe('-$195.03')
  })

  it('carries no decimals where the minor unit is the whole unit', () => {
    expect(formatMoneyDisplay('1000:JPY')).toBe('¥1,000')
    expect(formatMoneyDisplay('2500000:KRW')).toBe('2,500,000 KRW')
  })

  it('renders the ISO code beside the amount where no symbol is known', () => {
    expect(formatMoneyDisplay('123456:CHF')).toBe('1,234.56 CHF')
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
