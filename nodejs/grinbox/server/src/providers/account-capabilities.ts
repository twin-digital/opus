/**
 * Storing what one Account can carry, as its backend last declared it
 * (d-bzw8qoiy, d-f9tj4wnr).
 *
 * The declaration itself is `@grinbox/shared`'s {@link AccountCapabilities} —
 * the supported set, a reason for each gap, and when it was read — together with
 * {@link accountSupports} and {@link capabilityAbsenceReason} for reading one.
 * What this module adds is the daemon's half: building a declaration from what a
 * backend reported, and putting it in and out of `accounts.capabilities_json`.
 *
 * The declaration is per Account, not per backend: two IMAP accounts of one
 * server differ by what their arrival folder admits and what the server
 * advertises. The poll loop reads it from the backend each poll
 * (`Provider.declareCapabilities`) and stores it; every other path — the resource
 * dispatch, the pipeline save warning, the interface — reads what was stored.
 */

import {
  ACCOUNT_CAPABILITIES,
  type AccountCapabilities,
  type AccountCapability,
  accountCapabilitiesSchema,
  accountSupports,
  capabilityAbsenceReason,
} from '@grinbox/shared'

export { ACCOUNT_CAPABILITIES, accountSupports, capabilityAbsenceReason }
export type { AccountCapabilities, AccountCapability }

/** Every capability supported, with nothing to explain — the Gmail case. */
export function allCapabilities(readAt: number): AccountCapabilities {
  return { supported: [...ACCOUNT_CAPABILITIES], unsupported: {}, read_at: readAt }
}

/**
 * Build a declaration from the supported set, explaining every other capability.
 * A capability appears in exactly one of the two members, which is what shared's
 * schema requires.
 */
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
  return { supported: kept, unsupported, read_at: readAt }
}

/** Serialize for `accounts.capabilities_json`. */
export function serializeCapabilities(capabilities: AccountCapabilities): string {
  return JSON.stringify(capabilities)
}

/**
 * Parse `accounts.capabilities_json`. A null column (never polled), a malformed
 * blob, or a declaration that no longer satisfies the shared schema all read as
 * no declaration — the caller decides what an Account whose capabilities have
 * not been read may do, and a stored blob a later release cannot make sense of
 * is replaced at the next poll rather than failing the read.
 */
export function parseCapabilities(json: string | null): AccountCapabilities | null {
  if (!json) {
    return null
  }
  try {
    const parsed = accountCapabilitiesSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
