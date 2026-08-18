import type { AccountSummary, OperatorDetail } from '@grinbox/server'
import {
  type AccountCapability,
  type AccountCapabilityWarning,
  accountSupports as declarationSupports,
  capabilitiesRequiredBy,
  capabilityAbsenceReason,
} from '@grinbox/shared'

/**
 * What an Account can carry, and which Accounts cannot carry what a Pipeline
 * names.
 *
 * A configuration is never refused for naming an operation some Account cannot
 * carry (d-qzxvoph1): saving the Pipeline and activating it on an Account each
 * warn, naming the Accounts that cannot carry it, and the Operator fails on
 * those Accounts when it runs. The same reading says which Accounts an edition
 * claims no occurrence for, and why (d-5h66e3zl).
 *
 * The declaration is read from the backend each poll and stored on the Account
 * (d-bzw8qoiy), so `capabilities` is null until an Account has been polled once.
 * Unknown is not "cannot": nothing warns about an Account whose declaration has
 * not been read.
 */

/** How each capability reads in the interface, in the user's terms. */
export const CAPABILITY_LABELS: Record<AccountCapability, string> = {
  apply_category: 'apply a Category',
  archive: 'archive a Message',
  file: 'file a Message into a folder',
  send_message: 'send mail',
}

/** Whether the Account's stored declaration admits `capability`. */
export function accountSupports(account: AccountSummary, capability: AccountCapability): boolean {
  return declarationSupports(account.capabilities, capability)
}

/**
 * Why the Account cannot carry `capability`, in the backend's own words — what
 * the interface shows for "which Accounts those are and why" (d-5h66e3zl).
 * Null where it can carry it, and where nothing has been read yet.
 */
export function unsupportedReason(account: AccountSummary, capability: AccountCapability): string | null {
  if (account.capabilities === null || accountSupports(account, capability)) {
    return null
  }
  return capabilityAbsenceReason(account.capabilities, capability) ?? UNEXPLAINED_GAP
}

/** What a gap the backend explained nothing about reads as. */
export const UNEXPLAINED_GAP = 'this Account does not support this operation'

/** The Accounts known to lack `capability` — never one whose declaration is unread. */
export function accountsLacking(
  accounts: readonly AccountSummary[],
  capability: AccountCapability,
): readonly AccountSummary[] {
  return accounts.filter((account) => account.capabilities !== null && !accountSupports(account, capability))
}

/**
 * The capability warnings standing over a Pipeline's Operators and a set of
 * Accounts: per capability an enabled Operator needs, the Operators needing it
 * and the Accounts known to lack it (d-x198jell). An Operator whose type or
 * config would not parse carries no Contract and is passed over — there is
 * nothing to read a requirement from.
 *
 * This is the same shape the API returns from a save and from activation, so
 * one renderer serves both the standing view and the answer to a write.
 */
export function deriveCapabilityWarnings(
  operators: readonly OperatorDetail[],
  accounts: readonly AccountSummary[],
): AccountCapabilityWarning[] {
  const byCapability = new Map<AccountCapability, number[]>()
  for (const operator of operators) {
    if (!operator.enabled || operator.contract === null) {
      continue
    }
    for (const capability of capabilitiesRequiredBy(operator.contract)) {
      const operators = byCapability.get(capability) ?? []
      operators.push(operator.id)
      byCapability.set(capability, operators)
    }
  }

  const warnings: AccountCapabilityWarning[] = []
  for (const [capability, operatorIds] of byCapability) {
    const lacking = accountsLacking(accounts, capability)
    if (lacking.length === 0) {
      continue
    }
    warnings.push({
      capability,
      operator_ids: operatorIds,
      account_ids: lacking.map((account) => account.id),
    })
  }
  return warnings
}

/**
 * The capability warnings an API write answered with. The routes carry them on
 * a successful save and on activation — a 200 with warnings, never a blocked
 * save (d-qzxvoph1) — and a response carrying none reads as none.
 */
export function warningsFromResponse(payload: unknown): AccountCapabilityWarning[] {
  if (!payload || typeof payload !== 'object' || !('warnings' in payload)) {
    return []
  }
  const warnings = (payload as { warnings?: unknown }).warnings
  if (!Array.isArray(warnings)) {
    return []
  }
  return warnings.filter(isCapabilityWarning)
}

/**
 * One line naming what a write warned about: the capability, and the Accounts
 * the Operator will fail on (d-x198jell). An Account the browser has not
 * loaded is named by its id rather than dropped.
 */
export function describeWarnings(
  warnings: readonly AccountCapabilityWarning[],
  accounts: readonly AccountSummary[],
): string {
  return warnings
    .map((warning) => {
      const named = warning.account_ids.map(
        (id) => accounts.find((account) => account.id === id)?.name ?? `account ${String(id)}`,
      )
      return `${named.join(', ')} cannot ${CAPABILITY_LABELS[warning.capability]}`
    })
    .join('; ')
}

function isCapabilityWarning(value: unknown): value is AccountCapabilityWarning {
  if (!value || typeof value !== 'object') {
    return false
  }
  const warning = value as Partial<AccountCapabilityWarning>
  return (
    typeof warning.capability === 'string' &&
    warning.capability in CAPABILITY_LABELS &&
    Array.isArray(warning.operator_ids) &&
    Array.isArray(warning.account_ids)
  )
}
