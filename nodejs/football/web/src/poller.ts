import type { EspnDraftDetailResponse } from '@twin-digital/football-data/fetchers/espn'

export interface PollStatus {
  enabled: boolean
  inFlight: boolean
  intervalMs: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  consecutiveFailures: number
  nextDelayMs: number
}

/** 5s → 10s → 20s → 40s → 60s cap; back to base on success. */
export const backoffDelayMs = (failures: number, baseMs = 5000, maxMs = 60000): number =>
  failures <= 0 ? baseMs : Math.min(maxMs, baseMs * 2 ** Math.min(failures, 10))

export interface PollerOptions {
  fetchDetail: () => Promise<EspnDraftDetailResponse>
  /** Persist + recompute; poller treats a throw here as a failed poll. */
  apply: (detail: EspnDraftDetailResponse) => void
  /** When false (ingest running), ticks skip without counting as failures. */
  canPoll?: () => boolean
  intervalMs?: number
  log?: (message: string) => void
  now?: () => Date
}

/**
 * The live draft poll loop. Never throws out of a tick: an ESPN failure is logged, counted, and
 * retried with exponential backoff while the last-known state stays served.
 */
export class DraftPoller {
  readonly status: PollStatus
  private timer: NodeJS.Timeout | null = null
  private readonly options: Required<Omit<PollerOptions, 'canPoll'>> & Pick<PollerOptions, 'canPoll'>

  constructor(options: PollerOptions) {
    this.options = {
      intervalMs: 5000,
      log: () => undefined,
      now: () => new Date(),
      ...options,
    }
    this.status = {
      enabled: false,
      inFlight: false,
      intervalMs: this.options.intervalMs,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      consecutiveFailures: 0,
      nextDelayMs: this.options.intervalMs,
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.status.enabled === enabled) {
      return
    }
    this.status.enabled = enabled
    if (enabled) {
      this.options.log('poll: enabled')
      void this.runTick()
    } else {
      this.options.log('poll: disabled')
      this.clearTimer()
    }
  }

  stop(): void {
    this.status.enabled = false
    this.clearTimer()
  }

  /** One poll attempt; exposed for tests. Schedules the next tick while enabled. */
  async tick(): Promise<void> {
    if (this.options.canPoll !== undefined && !this.options.canPoll()) {
      return // paused (ingest running); not a failure
    }
    this.status.inFlight = true
    this.status.lastAttemptAt = this.options.now().toISOString()
    try {
      const detail = await this.options.fetchDetail()
      this.options.apply(detail)
      this.status.lastSuccessAt = this.options.now().toISOString()
      this.status.lastError = null
      this.status.consecutiveFailures = 0
    } catch (error) {
      this.status.consecutiveFailures += 1
      this.status.lastError = error instanceof Error ? error.message : String(error)
      this.options.log(
        `poll: attempt failed (${String(this.status.consecutiveFailures)} in a row): ${this.status.lastError}`,
      )
    } finally {
      this.status.inFlight = false
      this.status.nextDelayMs = backoffDelayMs(this.status.consecutiveFailures, this.options.intervalMs)
    }
  }

  private async runTick(): Promise<void> {
    await this.tick()
    if (this.status.enabled) {
      this.clearTimer()
      this.timer = setTimeout(() => {
        void this.runTick()
      }, this.status.nextDelayMs)
      this.timer.unref()
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
