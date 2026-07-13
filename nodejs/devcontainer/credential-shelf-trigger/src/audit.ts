/**
 * Structured audit line per trigger attempt — who/when/outcome. Deliberately records **no**
 * secret material: never the `user_code`, the verification URL, or the token. Those reach the
 * authenticated operator in the HTTP response only; they are never logged.
 */
export interface AuditEntry {
  event: 'refresh' | 'status'
  /** Remote address of the caller. */
  source: string
  authorized: boolean
  /**
   * Coarse result: 'ok' | 'unauthorized' | 'rate_limited' | 'upstream_error', plus
   * 'ok_in_flight' when a throttled refresh re-presented the prompt already pending approval.
   */
  outcome: string
}

export type Auditor = (entry: AuditEntry) => void

export const audit: Auditor = (entry) => {
  process.stdout.write(`${new Date().toISOString()} refresh-trigger audit ${JSON.stringify(entry)}\n`)
}
