import { formatMoneyDisplay } from '@grinbox/shared'
import { describe, expect, it } from 'vitest'

import { displayTagValue, moneyKeysFromRegistry } from './money'

/**
 * The money display seam (d-u4gpx6ke): which keys render in display form is
 * read off the Pipeline's tag-key registry, and the rendering itself is
 * `@grinbox/shared`'s `formatMoneyDisplay` — the digest's own function — so
 * the interface and the digest cannot disagree on a value's display form.
 */

describe('moneyKeysFromRegistry', () => {
  it('collects exactly the keys typed as extracted money', () => {
    const keys = moneyKeysFromRegistry([
      { key: 'amount', producer_operator_id: 1, value_enum: null, value_type: 'money' },
      { key: 'due_date', producer_operator_id: 1, value_enum: null, value_type: 'date' },
      { key: 'urgency', producer_operator_id: 2, value_enum: ['high', 'low'], value_type: null },
      { key: 'payee', producer_operator_id: 1, value_enum: null, value_type: 'string' },
    ])
    expect(keys).toEqual(new Set(['amount']))
  })
})

describe('displayTagValue', () => {
  const moneyKeys = new Set(['amount'])

  it('renders a money-typed key in display form via the shared formatter', () => {
    expect(displayTagValue('amount', '19503:USD', moneyKeys)).toBe('$195.03')
    // Byte-for-byte the digest's rendering: same input, same shared function.
    expect(displayTagValue('amount', '19503:USD', moneyKeys)).toBe(formatMoneyDisplay('19503:USD'))
  })

  it('renders an unknown-symbol currency as ISO code before the amount', () => {
    expect(displayTagValue('amount', '123456:CHF', moneyKeys)).toBe('CHF 1,234.56')
  })

  // d-m6ingqyv: a Tag under a money-typed key whose stored value is not money
  // renders verbatim — the shared formatter returns null and the caller keeps
  // the stored text.
  it('renders a non-money value under a money-typed key verbatim', () => {
    expect(displayTagValue('amount', 'about twelve dollars', moneyKeys)).toBe('about twelve dollars')
  })

  it('renders every other key verbatim, even money-shaped values', () => {
    expect(displayTagValue('note', '19503:USD', moneyKeys)).toBe('19503:USD')
    expect(displayTagValue('amount', '19503:USD', undefined)).toBe('19503:USD')
  })
})
