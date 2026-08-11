/**
 * The display form of an extracted money value (r-735kq72h). Rendered at
 * composition time, never stored (d-nj43sz9w): the normalized stored form
 * (`<integer minor units>:<ISO currency>`, d-dmwaark1) stays what grinbox
 * keeps and what a section's threshold compares.
 *
 * The form follows from the ISO currency alone — the machine's locale plays no
 * part (d-oc073wsp) — under conventions fixed once (d-b1ntd8go): a known
 * symbol before the amount, comma thousands, period decimal, a leading minus
 * sign, and no decimals where the currency's minor unit is its whole unit.
 * Where grinbox knows no symbol, the ISO code renders after the amount.
 *
 * The interface shows money by the same rules (d-u4gpx6ke) — this
 * implementation is a candidate to move to `@grinbox/shared` so both tiers
 * share one; reported to the dispatcher as a cross-package need.
 */

/** ISO code → symbol, for the currencies grinbox knows a symbol for. Mirrors
 * the symbol set money normalization accepts (normalize-extracted.ts). */
const CURRENCY_DISPLAY_SYMBOLS: Readonly<Partial<Record<string, string>>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

/** Currencies whose minor unit is the whole unit — no decimals in display.
 * Mirrors normalization's zero-decimal set. */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW'])

/**
 * Format a stored money value (`19503:USD`) into its display form
 * (`$195.03`). Returns `null` when the input is not the stored money form —
 * the caller renders the value verbatim instead (d-m6ingqyv).
 */
export function formatMoneyDisplay(stored: string): string | null {
  const m = /^(-?\d+):([A-Z]{3})$/.exec(stored)
  if (!m) {
    return null
  }
  const minor = BigInt(m[1])
  const currency = m[2]
  const negative = minor < 0n
  const abs = negative ? -minor : minor

  let digits: string
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) {
    digits = groupThousands(abs.toString())
  } else {
    const whole = abs / 100n
    const cents = (abs % 100n).toString().padStart(2, '0')
    digits = `${groupThousands(whole.toString())}.${cents}`
  }

  const symbol = CURRENCY_DISPLAY_SYMBOLS[currency]
  const unsigned = symbol !== undefined ? `${symbol}${digits}` : `${digits} ${currency}`
  return negative ? `-${unsigned}` : unsigned
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * The Tag keys the pipeline's enabled operators type as extracted money
 * (d-m6ingqyv): what renders in display form. Derived from stored
 * `config_json` rows; a config that doesn't parse contributes nothing.
 */
export function moneyTypedTagKeys(operators: readonly { type_key: string; config_json: string }[]): Set<string> {
  const keys = new Set<string>()
  for (const row of operators) {
    if (row.type_key !== 'llm_tagger') {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(row.config_json)
    } catch {
      continue
    }
    const outputs = (parsed as { outputs?: unknown }).outputs
    if (!Array.isArray(outputs)) {
      continue
    }
    for (const output of outputs) {
      const o = output as { tag_key?: unknown; value_type?: unknown }
      if (typeof o.tag_key === 'string' && o.value_type === 'money') {
        keys.add(o.tag_key)
      }
    }
  }
  return keys
}
