/**
 * Normalization of extracted LLM Tagger output values (d-dmwaark1). The model
 * produces values freely; this module reduces
 * them to canonical stored forms in code, after the call. A value that fails
 * normalization returns `null` — the caller drops the Tag (absent, not an
 * error), which is the designed degradation for extraction.
 *
 * Stored forms:
 *  - `string` — trimmed, capped at {@link EXTRACTED_STRING_MAX_CHARS}.
 *  - `money`  — `<integer minor units>:<ISO currency>` (`195.03 USD` →
 *    `19503:USD`). Integer minor units + ISO dates are what make the typed
 *    comparisons (digest `highlight`) and the reserved future aggregations
 *    well-defined.
 *  - `date`   — ISO 8601 date (`YYYY-MM-DD`).
 */

import type { ExtractedValueType } from '@grinbox/shared'

/** Cap applied to normalized `string` extractions (single-line metadata, not prose). */
export const EXTRACTED_STRING_MAX_CHARS = 500

/**
 * Currency symbols accepted in money values, mapped to ISO codes. Deliberately
 * tiny — a symbol outside this set (or a missing currency entirely) fails
 * normalization rather than guessing.
 */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
}

/**
 * ISO currencies whose minor unit is the whole unit (no decimal subdivision).
 * `¥1000` stores as `1000:JPY`, not `100000:JPY`. Everything else uses two
 * decimal places, the overwhelmingly common case.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW'])

/**
 * Normalize one extracted value per its declared type. Returns the canonical
 * stored form, or `null` when the value doesn't normalize (drop the Tag).
 */
export function normalizeExtractedValue(type: ExtractedValueType, raw: string): string | null {
  switch (type) {
    case 'string':
      return normalizeString(raw)
    case 'money':
      return normalizeMoney(raw)
    case 'date':
      return normalizeDate(raw)
  }
}

function normalizeString(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  return trimmed.length <= EXTRACTED_STRING_MAX_CHARS ? trimmed : trimmed.slice(0, EXTRACTED_STRING_MAX_CHARS)
}

/**
 * Accepted money spellings: an amount with an ISO code before or after
 * (`195.03 USD`, `USD 195.03`) or a known symbol prefix (`$195.03`), with
 * optional thousands separators. Anything without a recognizable currency
 * fails — an amount with no currency can't be stored canonically.
 */
function normalizeMoney(raw: string): string | null {
  const trimmed = raw.trim()

  // Pull the ISO code (word) or symbol out; what remains must be the amount.
  let currency: string | null = null
  let amountText = trimmed
  const isoMatch = /(?:^|\s)([A-Za-z]{3})(?:\s|$)/.exec(trimmed)
  if (isoMatch?.[1]) {
    currency = isoMatch[1].toUpperCase()
    amountText = trimmed.replace(isoMatch[0], ' ')
  } else {
    for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
      if (trimmed.includes(symbol)) {
        currency = code
        amountText = trimmed.replaceAll(symbol, ' ')
        break
      }
    }
  }
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    return null
  }

  const amountMatch = /^-?\d+(\.\d+)?$/.exec(amountText.replaceAll(',', '').trim())
  if (!amountMatch) {
    return null
  }
  const amount = Number(amountMatch[0])
  if (!Number.isFinite(amount)) {
    return null
  }

  const minorFactor = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100
  const minor = Math.round(amount * minorFactor)
  if (!Number.isSafeInteger(minor)) {
    return null
  }
  return `${minor}:${currency}`
}

/** `YYYY-MM-DD`, optionally followed by a time suffix that gets stripped. */
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/

/**
 * Normalize a date to `YYYY-MM-DD`. An ISO date (or datetime) passes through
 * by its date part; any other spelling is parsed via `Date.parse` and, when
 * valid, formatted from its **local** date parts (parsing `Aug 10, 2026`
 * yields local midnight; reading UTC parts could shift the calendar day).
 */
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim()
  const iso = ISO_DATE_PREFIX.exec(trimmed)
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`
    // Reject impossible dates like 2026-13-40 that match the shape.
    return Number.isNaN(Date.parse(candidate)) ? null : candidate
  }
  const parsedMs = Date.parse(trimmed)
  if (Number.isNaN(parsedMs)) {
    return null
  }
  // Guard against Date.parse's creative interpretations of non-date text: the
  // input must at least carry a 4-digit year to be treated as a date.
  if (!/\d{4}/.test(trimmed)) {
    return null
  }
  const d = new Date(parsedMs)
  const y = String(d.getFullYear()).padStart(4, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Typed strictly-greater comparison over normalized stored forms, used by the
 * digest `highlight`. Money compares as integer minor units when both sides
 * share a currency; ISO dates compare lexicographically. Returns `false` (not
 * highlighted) when the two values aren't comparable.
 */
export function comparesOver(value: string, over: string): boolean {
  const moneyA = parseStoredMoney(value)
  const moneyB = parseStoredMoney(over)
  if (moneyA && moneyB) {
    return moneyA.currency === moneyB.currency && moneyA.minor > moneyB.minor
  }
  if (ISO_DATE_PREFIX.test(value) && ISO_DATE_PREFIX.test(over)) {
    return value > over
  }
  return false
}

function parseStoredMoney(stored: string): { minor: number; currency: string } | null {
  const m = /^(-?\d+):([A-Z]{3})$/.exec(stored)
  if (!m) {
    return null
  }
  return { minor: Number(m[1]), currency: m[2] }
}
