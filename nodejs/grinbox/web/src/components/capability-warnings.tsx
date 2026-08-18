import type { AccountSummary, OperatorDetail } from '@grinbox/server'
import type { AccountCapabilityWarning } from '@grinbox/shared'
import { TriangleAlert } from 'lucide-react'

import { CAPABILITY_LABELS, deriveCapabilityWarnings, UNEXPLAINED_GAP, unsupportedReason } from '@/lib/capabilities'
import { usePipeline } from '@/lib/pipelines'

/**
 * The warnings a configuration draws for naming an operation some Account
 * cannot carry (d-qzxvoph1). Nothing here blocks anything: the save happened,
 * the activation happened, and this says which Accounts the Operator will fail
 * on when it runs — and why, in the backend's own words (d-5h66e3zl).
 *
 * Rendered from an API write's `warnings` and from the standing reading over a
 * Pipeline's Operators alike, so the user meets one shape of message wherever
 * the gap surfaces.
 */
export function CapabilityWarnings({
  warnings,
  accounts,
  operators = [],
  className,
}: {
  warnings: readonly AccountCapabilityWarning[]
  accounts: readonly AccountSummary[]
  /** Operators, to name which ones need the capability; omitted where unknown. */
  operators?: readonly OperatorDetail[]
  className?: string
}) {
  if (warnings.length === 0) {
    return null
  }
  return (
    <div
      role='status'
      className={`space-y-3 rounded-md border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 p-3 text-sm ${className ?? ''}`}
    >
      <p className='flex items-center gap-2 font-medium [color:var(--warning)]'>
        <TriangleAlert className='h-4 w-4 shrink-0' />
        Some Accounts cannot carry part of this configuration
      </p>
      <ul className='space-y-2'>
        {warnings.map((warning) => (
          <CapabilityWarningItem key={warning.capability} warning={warning} accounts={accounts} operators={operators} />
        ))}
      </ul>
      <p className='text-xs text-muted-foreground'>
        This is saved either way — the Operator fails on those Accounts when it runs, and runs normally everywhere else.
      </p>
    </div>
  )
}

/**
 * What activating this Pipeline on this Account cannot carry (d-qzxvoph1).
 * Activating warns as saving does, and warning before the user commits is the
 * same reading applied a moment earlier.
 */
export function ActivationWarnings({ account, pipelineId }: { account: AccountSummary; pipelineId: number }) {
  const { data } = usePipeline(pipelineId)
  if (!data) {
    return null
  }
  return (
    <CapabilityWarnings
      warnings={deriveCapabilityWarnings(data.operators, [account])}
      accounts={[account]}
      operators={data.operators}
    />
  )
}

function CapabilityWarningItem({
  warning,
  accounts,
  operators,
}: {
  warning: AccountCapabilityWarning
  accounts: readonly AccountSummary[]
  operators: readonly OperatorDetail[]
}) {
  const named = warning.operator_ids
    .map((id) => operators.find((operator) => operator.id === id)?.name)
    .filter((name): name is string => name !== undefined)
  const lacking = warning.account_ids
    .map((id) => accounts.find((account) => account.id === id))
    .filter((account): account is AccountSummary => account !== undefined)

  return (
    <li className='space-y-1'>
      <p>
        {named.length > 0 ?
          <>
            <span className='font-medium'>{named.join(', ')}</span>{' '}
          </>
        : null}
        {named.length === 1 ?
          'needs to '
        : named.length > 1 ?
          'need to '
        : 'This configuration needs to '}
        {CAPABILITY_LABELS[warning.capability]}.
      </p>
      <ul className='ml-4 list-disc space-y-0.5 text-xs text-muted-foreground'>
        {lacking.map((account) => (
          <li key={account.id}>
            <span className='font-medium text-foreground'>{account.name}</span>
            {' — '}
            {unsupportedReason(account, warning.capability) ?? UNEXPLAINED_GAP}
          </li>
        ))}
      </ul>
    </li>
  )
}
