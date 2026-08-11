/**
 * The display form of an extracted money value (r-735kq72h): what a digest —
 * and, by d-u4gpx6ke, the interface — renders where a Tag is typed as an
 * extracted money output. The stored form (`minor:CCY`, d-dmwaark1) stays what
 * grinbox keeps and compares; the display form is rendered, never stored
 * (d-nj43sz9w).
 *
 * The form follows from the ISO currency alone — the machine's locale has no
 * part in it (d-oc073wsp) — with one fixed set of conventions (d-b1ntd8go): a
 * known symbol before the amount, thousands grouped with commas, the decimal
 * marked with a period, a negative amount led by a minus sign, and no decimals
 * where the currency's minor unit is its whole unit.
 */

/** The currencies grinbox knows a symbol for; every other renders its ISO code. */
const CURRENCY_SYMBOLS = new Map([
  ['USD', '$'],
  ['EUR', '€'],
  ['GBP', '£'],
  ['JPY', '¥'],
])

/** ISO 4217 currencies whose minor unit is the whole unit (exponent 0). */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

/** ISO 4217 currencies with a three-decimal minor unit (exponent 3). */
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

/** The normalized stored form: integer minor units, a colon, an ISO 4217 code. */
const STORED_MONEY_PATTERN = /^(-?)(\d+):([A-Z]{3})$/

/**
 * Renders a stored money value (`19503:USD`) in display form (`$195.03`).
 *
 * Returns `null` where `stored` is not the normalized money form — the caller
 * renders the value verbatim instead (d-m6ingqyv: a Tag under a money-typed
 * key whose stored value is not money renders verbatim).
 *
 * Examples: `19503:USD` → `$195.03`; `-1234567:EUR` → `-€12,345.67`;
 * `1234:JPY` → `¥1,234`; `1234:KWD` → `KWD 1.234`; `995:CHF` → `CHF 9.95`.
 */
export function formatMoneyDisplay(stored: string): string | null {
  const match = STORED_MONEY_PATTERN.exec(stored)
  if (match === null) {
    return null
  }
  const [, sign, digits, currency] = match as unknown as [string, string, string, string]

  const exponent =
    ZERO_DECIMAL_CURRENCIES.has(currency) ? 0
    : THREE_DECIMAL_CURRENCIES.has(currency) ? 3
    : 2

  // padStart to exponent+1 digits guarantees at least one whole-unit digit.
  const padded = digits.padStart(exponent + 1, '0')
  const whole = padded.slice(0, padded.length - exponent).replace(/^0+(?=\d)/, '')
  const fraction = exponent > 0 ? padded.slice(-exponent) : ''
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const amount = fraction === '' ? grouped : `${grouped}.${fraction}`

  const symbol = CURRENCY_SYMBOLS.get(currency)
  const unsigned = symbol === undefined ? `${currency} ${amount}` : `${symbol}${amount}`

  const isZero = /^0+$/.test(digits)
  return sign === '-' && !isZero ? `-${unsigned}` : unsigned
}
