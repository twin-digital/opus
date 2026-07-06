/** The escalation sink shape. Every unresolved case funnels through one `Notifier`. */

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
