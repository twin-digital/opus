/**
 * What one Account can carry, as its backend last declared it (d-bzw8qoiy,
 * d-f9tj4wnr).
 *
 * The vocabulary — which operations are Account-dependent at all — is
 * `@grinbox/shared`'s {@link ACCOUNT_CAPABILITIES}. What this module adds is the
 * stored form: the supported set, a reason for each gap so the interface can say
 * why an Account cannot send or file (d-5h66e3zl, d-qzxvoph1), and when it was
 * read.
 *
 * The declaration is per Account, not per backend: two IMAP accounts of one
 * server differ by what their arrival folder admits and what the server
 * advertises. The poll loop reads it from the backend each poll
 * (`Provider.declareCapabilities`) and stores it on the Account; every other
 * path — the resource dispatch, the pipeline save warning, the interface —
 * reads what was stored.
 */

import { ACCOUNT_CAPABILITIES, type AccountCapability } from '@grinbox/shared'

export { ACCOUNT_CAPABILITIES }
export type { AccountCapability }

/**
 * The stored declaration. `supported` is what the Account can carry;
 * `unsupported` explains each gap in the user's terms.
 */
export interface AccountCapabilityDeclaration {
  readonly supported: readonly AccountCapability[]
  readonly unsupported: Readonly<Partial<Record<AccountCapability, string>>>
  /** Unix seconds the declaration was last read from the backend. */
  readonly readAt: number
}

/** Every capability supported, with nothing to explain — the Gmail case. */
export function allCapabilities(readAt: number): AccountCapabilityDeclaration {
  return { supported: [...ACCOUNT_CAPABILITIES], unsupported: {}, readAt }
}

/** Build a declaration from the supported set, explaining every other capability. */
export function capabilitiesFrom(
  supported: readonly AccountCapability[],
  reasons: Readonly<Partial<Record<AccountCapability, string>>>,
  readAt: number,
): AccountCapabilityDeclaration {
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
export function supports(capabilities: AccountCapabilityDeclaration | null, capability: AccountCapability): boolean {
  return capabilities?.supported.includes(capability) === true
}

/** Why `capability` is not carried; null when it is, or when nothing is stored. */
export function unsupportedReason(
  capabilities: AccountCapabilityDeclaration | null,
  capability: AccountCapability,
): string | null {
  if (capabilities?.supported.includes(capability) !== false) {
    return null
  }
  return capabilities.unsupported[capability] ?? 'the account does not support this operation'
}

/** Serialize for `accounts.capabilities_json`. */
export function serializeCapabilities(capabilities: AccountCapabilityDeclaration): string {
  return JSON.stringify(capabilities)
}

/**
 * Parse `accounts.capabilities_json`. A null column (never polled) or a
 * malformed blob reads as no declaration — the caller decides what an Account
 * whose capabilities have not been read yet may do.
 */
export function parseCapabilities(json: string | null): AccountCapabilityDeclaration | null {
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
