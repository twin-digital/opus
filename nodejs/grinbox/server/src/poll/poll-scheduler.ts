/**
 * The poll scheduler (pipeline-runtime.md "Process model → Poll loop"). One of
 * the Daemon's two conceptual loops: on a cadence it finds Accounts that are due
 * for a poll, resolves each to a {@link Provider} via the injected
 * {@link ProviderFactory}, and runs one {@link pollAccount} cycle per Account.
 *
 * ## Cadence vs. per-Account interval
 *
 * `start()` schedules a single croner job — the scheduler *tick* — every
 * `config.pollSchedulerTickSeconds` (default 60s). Each tick calls
 * {@link pollDueAccounts}, which selects only the Accounts whose own
 * `poll_interval_seconds` (default 600s) has elapsed since their
 * `last_polled_at`. So there is one shared heartbeat, not a timer per Account;
 * the per-Account interval is enforced by the due-selection query, not by the
 * cron cadence. The tick should be `<=` the smallest Account interval for poll
 * latency to track that interval closely.
 *
 * ## Test seam
 *
 * Tests drive `pollDueAccounts(now?)` and `pollAccount(...)` directly — never
 * `start()`. There is no real cron and no waiting in tests; `start()`/`stop()`
 * exist only for the daemon's lifecycle wiring. `pollDueAccounts` accepts an
 * injected `now` (Unix seconds) so due-selection and the persisted
 * `last_polled_at` are deterministic.
 */

import { Cron } from 'croner'
import type { Config } from '../config.js'
import type { DB } from '../db/schema.js'
import type { Provider } from '../providers/provider.js'
import {
  type PollCycleSummary,
  type PollableAccount,
  type ResyncSummary,
  pollAccount,
  reconcileAccount,
  resyncAccount,
} from './poll-cycle.js'
import type { ProviderFactory } from './provider-factory.js'

export interface PollSchedulerDeps {
  readonly db: DB
  readonly config: Config
  /** Maps each due Account to a live Provider, or `null` to skip it. */
  readonly providerFactory: ProviderFactory
}

export interface PollScheduler {
  /**
   * Poll every Account that is due as of `now` (Unix seconds; defaults to the
   * wall clock). Selects non-deleted Accounts with an `active_pipeline_id` whose
   * `last_polled_at` is null or older than their `poll_interval_seconds`,
   * resolves each via the {@link ProviderFactory} (skipping `null`), and runs
   * one {@link pollAccount} cycle. Returns a summary per Account actually
   * polled. A failing Account's error is logged and does not abort the others.
   *
   * ## In-flight guard
   *
   * This is the guarded entry point the cron tick calls. A single cycle may
   * outrun the tick interval (one slow Account's poll can exceed
   * `pollSchedulerTickSeconds`); without a guard the next tick would re-select
   * the same Accounts — their `last_polled_at` not yet written — and poll them
   * concurrently. So a call made while a previous cycle is still in flight is a
   * no-op: it returns an empty summary list and does not touch the DB. The guard
   * clears once the in-flight cycle settles (success *or* failure), so the next
   * tick runs normally.
   */
  pollDueAccounts(now?: number): Promise<PollCycleSummary[]>
  /**
   * Force-poll every eligible Account now, ignoring per-Account intervals (the
   * manual Inbox "sync"). Shares the in-flight guard with the scheduled tick.
   */
  pollAllNow(now?: number): Promise<PollCycleSummary[]>
  /**
   * Full resync of every eligible Account now (the Inbox "sync" button): re-fetch
   * all in-inbox Messages, backfilling ones Grinbox never ingested and refreshing
   * existing rows' metadata, then align source-state. Heavier than a poll; shares
   * the in-flight guard with the scheduled tick.
   */
  resyncAllNow(now?: number): Promise<ResyncSummary[]>
  /** Run one poll cycle for a specific Account (exposed for tests + targeted
   * polls). Resolves the Provider via the factory; throws if the factory
   * returns `null`. */
  pollAccount(account: PollableAccount, now?: number): Promise<PollCycleSummary>
  /** Begin the croner tick (every `config.pollSchedulerTickSeconds`). */
  start(): void
  /** Cancel the croner tick. Idempotent. */
  stop(): void
}

/** The `accounts` columns the due-selection reads. */
interface DueAccountRow {
  readonly id: number
  readonly provider_type: string
  readonly active_pipeline_id: number | null
  readonly settings_json: string
  readonly last_history_cursor: string | null
  readonly last_polled_at: number | null
  readonly last_reconciled_at: number | null
  readonly poll_interval_seconds: number
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Build the croner pattern for a tick of `tickSeconds`. croner's seconds field
 * caps a step ("slash-n") at 60, so a sub-minute tick uses a seconds step and a
 * tick of a whole number of minutes uses a minutes step. Anything else (e.g.
 * 90s) rounds to the nearest whole minute — a coarser-but-valid heartbeat is
 * preferable to a pattern croner rejects (which would crash `start()`).
 */
function tickCronPattern(tickSeconds: number): string {
  if (tickSeconds < 60) {
    return `*/${tickSeconds} * * * * *`
  }
  const minutes = Math.max(1, Math.round(tickSeconds / 60))
  if (minutes >= 60) {
    // A multi-hour tick is unusual; fall back to once per hour rather than risk
    // an out-of-range minutes step.
    return '0 0 * * * *'
  }
  return `0 */${minutes} * * * *`
}

/** Project a selected row into the {@link PollableAccount} a cycle consumes.
 * Only called for rows the due query already proved have a non-null
 * `active_pipeline_id`. */
function toPollable(row: DueAccountRow): PollableAccount {
  return {
    id: row.id,
    providerType: row.provider_type,
    // Non-null by construction: the due query filters `active_pipeline_id IS
    // NOT NULL`. The cast narrows the nullable column type accordingly.
    activePipelineId: row.active_pipeline_id as number,
    settingsJson: row.settings_json,
    lastHistoryCursor: row.last_history_cursor,
    lastPolledAt: row.last_polled_at,
    lastReconciledAt: row.last_reconciled_at,
  }
}

export function createPollScheduler(deps: PollSchedulerDeps): PollScheduler {
  const { db, config, providerFactory } = deps
  let job: Cron | null = null
  // The in-flight cycle (poll or resync), or null when idle. The guards read it
  // to avoid overlapping cursor/metadata writes across the tick + manual paths;
  // the `.finally()` clears it.
  let inFlight: Promise<unknown> | null = null

  async function runOneAccount(account: PollableAccount, now: number): Promise<PollCycleSummary> {
    const provider = providerFactory(account)
    if (provider === null) {
      throw new Error(`no Provider configured for account ${account.id} (needs auth)`)
    }
    const summary = await pollAccount(db, account, provider, now)
    await maybeReconcile(account, provider, now)
    return summary
  }

  /**
   * Run the source-state reconcile if the Account is due (never reconciled, or
   * `reconcileIntervalSeconds` elapsed since `last_reconciled_at`). Advances
   * `last_reconciled_at` only on success, so a failure retries next poll. Its
   * error is logged and never propagates — reconcile is a backstop, not part of
   * the poll's success contract.
   */
  async function maybeReconcile(account: PollableAccount, provider: Provider, now: number): Promise<void> {
    const due = account.lastReconciledAt === null || account.lastReconciledAt + config.reconcileIntervalSeconds <= now
    if (!due) {
      return
    }
    try {
      const summary = await reconcileAccount(db, account, provider, now)
      await db.updateTable('accounts').set({ last_reconciled_at: now }).where('id', '=', account.id).execute()
      if (summary.archived > 0 || summary.restored > 0) {
        console.log(
          `[grinbox][reconcile] account=${account.id} archived=${summary.archived} restored=${summary.restored}`,
        )
      }
    } catch (err) {
      console.error(`[grinbox][reconcile] account=${account.id} reconcile failed`, err)
    }
  }

  /**
   * Select eligible Accounts (non-deleted, with an active Pipeline). When
   * `dueOnly` (the scheduled tick), additionally require the per-Account interval
   * to have elapsed (data-model.md idx_accounts_polling); a manual sync/resync
   * drops that clause to act on every eligible Account immediately.
   */
  async function selectAccounts(now: number, dueOnly: boolean): Promise<PollableAccount[]> {
    const rows = (await db
      .selectFrom('accounts')
      .select([
        'id',
        'provider_type',
        'active_pipeline_id',
        'settings_json',
        'last_history_cursor',
        'last_polled_at',
        'last_reconciled_at',
        'poll_interval_seconds',
      ])
      .where('deleted_at', 'is', null)
      .where('active_pipeline_id', 'is not', null)
      .$if(dueOnly, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('last_polled_at', 'is', null),
            // Due when now - last_polled_at >= poll_interval_seconds, i.e.
            // last_polled_at + poll_interval_seconds <= now.
            eb(eb('last_polled_at', '+', eb.ref('poll_interval_seconds')), '<=', now),
          ]),
        ),
      )
      .execute()) as DueAccountRow[]
    return rows.map(toPollable)
  }

  async function runPollCycle(now: number, dueOnly = true): Promise<PollCycleSummary[]> {
    const accounts = await selectAccounts(now, dueOnly)
    const summaries: PollCycleSummary[] = []
    for (const account of accounts) {
      const provider = providerFactory(account)
      if (provider === null) {
        continue
      } // skip; factory already logged the reason
      try {
        summaries.push(await pollAccount(db, account, provider, now))
        await maybeReconcile(account, provider, now)
      } catch (err) {
        console.error(`[grinbox][poll] account=${account.id} poll cycle failed`, err)
      }
    }
    return summaries
  }

  /** Full resync of every eligible Account (the Sync button). See {@link resyncAccount}. */
  async function runResyncCycle(now: number): Promise<ResyncSummary[]> {
    const accounts = await selectAccounts(now, false)
    const summaries: ResyncSummary[] = []
    for (const account of accounts) {
      const provider = providerFactory(account)
      if (provider === null) {
        continue
      }
      try {
        summaries.push(await resyncAccount(db, account, provider, now))
      } catch (err) {
        console.error(`[grinbox][resync] account=${account.id} resync failed`, err)
      }
    }
    return summaries
  }

  /**
   * Guarded entry point (see {@link PollScheduler.pollDueAccounts}). If a cycle
   * is already in flight, skip — returning `[]` without re-selecting or polling
   * — so two ticks never poll the same not-yet-advanced Accounts concurrently.
   * Otherwise start a cycle, hold its promise, and clear the guard once it
   * settles (whether it resolves or rejects).
   */
  function pollDueAccounts(now: number = nowSeconds()): Promise<PollCycleSummary[]> {
    if (inFlight !== null) {
      console.warn('[grinbox][poll] poll cycle still running, skipping tick')
      return Promise.resolve([])
    }
    return guard(runPollCycle(now))
  }

  /**
   * Force a poll of every eligible Account *now*, ignoring per-Account intervals
   * (the manual "sync" the Inbox refresh triggers). Shares the in-flight guard
   * with the scheduled tick: if a cycle is already running, this resolves to the
   * in-flight cycle's result rather than starting an overlapping one (which could
   * race the cursor advance).
   */
  function pollAllNow(now: number = nowSeconds()): Promise<PollCycleSummary[]> {
    if (inFlight !== null) {
      return inFlight as Promise<PollCycleSummary[]>
    }
    return guard(runPollCycle(now, false))
  }

  /**
   * Full resync of every eligible Account (the Inbox "sync" button). Shares the
   * in-flight guard: if a cycle is already running, resolve to it rather than
   * starting an overlapping one.
   */
  function resyncAllNow(now: number = nowSeconds()): Promise<ResyncSummary[]> {
    if (inFlight !== null) {
      return inFlight as Promise<ResyncSummary[]>
    }
    return guard(runResyncCycle(now))
  }

  /** Hold `cycle` as the in-flight one and clear the guard once it settles. */
  function guard<T>(cycle: Promise<T>): Promise<T> {
    inFlight = cycle
    // Clear the guard (only if still ours) once it settles; the caller still
    // observes `cycle`'s resolution/rejection.
    void cycle.finally(() => {
      if (inFlight === cycle) {
        inFlight = null
      }
    })
    return cycle
  }

  function start(): void {
    if (job !== null) {
      return
    }
    // Croner heartbeat derived from `pollSchedulerTickSeconds` (see
    // tickCronPattern for the seconds-vs-minutes field handling).
    // `protect: true` is croner's own overlap guard (belt-and-suspenders); the
    // authoritative guard is `pollDueAccounts`'s in-flight check, which holds
    // across the whole cycle regardless of cron timing.
    job = new Cron(tickCronPattern(config.pollSchedulerTickSeconds), { protect: true }, () => {
      void pollDueAccounts().catch((err: unknown) => {
        console.error('[grinbox][poll] scheduler tick error', err)
      })
    })
  }

  function stop(): void {
    if (job !== null) {
      job.stop()
      job = null
    }
  }

  return {
    pollDueAccounts,
    pollAllNow,
    resyncAllNow,
    pollAccount: (account, now = nowSeconds()) => runOneAccount(account, now),
    start,
    stop,
  }
}
