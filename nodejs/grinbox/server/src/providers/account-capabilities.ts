/**
 * What one Account can carry (d-bzw8qoiy, d-f9tj4wnr).
 *
 * The declaration is per Account, not per backend: two IMAP accounts of one
 * server differ by what their arrival folder admits and what the server
 * advertises. The poll loop reads it from the backend each poll
 * (`Provider.declareCapabilities`) and stores it on the Account; every other
 * path — the resource dispatch, the pipeline save warning, the interface —
 * reads what was stored.
 *
 * A capability is named for the resource operation it gates, so the gap the
 * user meets is the gap the configuration names (d-qzxvoph1).
 */

/** The operations an Account's backend may or may not be able to carry. */
export const ACCOUNT_CAPABILITIES = ['apply_category', 'archive', 'file', 'send_message'] as const

export type AccountCapability = (typeof ACCOUNT_CAPABILITIES)[number]

/**
 * The stored declaration. `supported` is what the Account can carry;
 * `unsupported` explains each gap in the user's terms, so the interface can say
 * which accounts cannot carry an operation and why (d-5h66e3zl, r-x3jb6wlq).
 */
export interface AccountCapabilities {
  readonly supported: readonly AccountCapability[]
  readonly unsupported: Readonly<Partial<Record<AccountCapability, string>>>
  /** Unix seconds the declaration was last read from the backend. */
  readonly readAt: number
}

/** Every capability supported, with nothing to explain — the Gmail case. */
export function allCapabilities(readAt: number): AccountCapabilities {
  return { supported: [...ACCOUNT_CAPABILITIES], unsupported: {}, readAt }
}

/** Build a declaration from the supported set, explaining every other capability. */
export function capabilitiesFrom(
  supported: readonly AccountCapability[],
  reasons: Readonly<Partial<Record<AccountCapability, string>>>,
  readAt: number,
): AccountCapabilities {
  const kept = ACCOUNT_CAPABILITIES.filter((c) => supported.includes(c))
  const unsupported: Partial<Record<AccountCapability, string>> = {}
  for (const capability of ACCOUNT_CAPABILITIES) {
    if (!kept.includes(capability)) {
      unsupported[capability] = reasons[capability] ?? 'the account does not support this operation'
    }
  }
  return { supported: kept, unsupported, readAt }
}

/** Does the stored declaration admit `capability`? */
export function supports(capabilities: AccountCapabilities | null, capability: AccountCapability): boolean {
  return capabilities?.supported.includes(capability) === true
}

/** Why `capability` is not carried; null when it is, or when nothing is stored. */
export function unsupportedReason(
  capabilities: AccountCapabilities | null,
  capability: AccountCapability,
): string | null {
  if (capabilities?.supported.includes(capability) !== false) {
    return null
  }
  return capabilities.unsupported[capability] ?? 'the account does not support this operation'
}

/** Serialize for `accounts.capabilities_json`. */
export function serializeCapabilities(capabilities: AccountCapabilities): string {
  return JSON.stringify(capabilities)
}

/**
 * Parse `accounts.capabilities_json`. A null column (never polled) or a
 * malformed blob reads as no declaration — the caller decides what an Account
 * whose capabilities have not been read yet may do.
 */
export function parseCapabilities(json: string | null): AccountCapabilities | null {
  if (!json) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    return null
  }
  const raw = parsed as { supported?: unknown; unsupported?: unknown; readAt?: unknown }
  const supported =
    Array.isArray(raw.supported) ? ACCOUNT_CAPABILITIES.filter((c) => (raw.supported as unknown[]).includes(c)) : []
  const unsupported: Partial<Record<AccountCapability, string>> = {}
  if (raw.unsupported && typeof raw.unsupported === 'object') {
    for (const [key, value] of Object.entries(raw.unsupported as Record<string, unknown>)) {
      if (typeof value === 'string' && (ACCOUNT_CAPABILITIES as readonly string[]).includes(key)) {
        unsupported[key as AccountCapability] = value
      }
    }
  }
  return { supported, unsupported, readAt: typeof raw.readAt === 'number' ? raw.readAt : 0 }
}
