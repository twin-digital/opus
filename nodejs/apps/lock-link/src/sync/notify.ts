/**
 * The single escalation sink. Every error case the sync can't resolve itself — a code
 * that's overdue and still not live, a gap with no Lynx reservation, a `confirmationCode`
 * that doesn't parse, a whole-run failure — funnels through one `Notifier`. The transport
 * (SNS→email, SES, …) is injected and decided separately; the sync only emits events.
 */

export type Severity = 'info' | 'warning' | 'critical'

export interface NotifyEvent {
  readonly severity: Severity
  /** Short, human-readable reason — the subject line of the escalation. */
  readonly reason: string
  /** Lodgify booking id, when known (absent for a confirmationCode that didn't parse). */
  readonly bookingId?: number
  readonly confirmationCode?: string
  /** Supporting detail — e.g. the readiness `reasons`, or an error message. */
  readonly details?: readonly string[]
}

export type Notifier = (event: NotifyEvent) => Promise<void>
