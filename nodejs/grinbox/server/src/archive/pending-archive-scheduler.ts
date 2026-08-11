/**
 * The pending-Archive sweep: the third scheduler the daemon's one heartbeat
 * wakes (d-gzv0jty7). Each beat it takes the standing pending Archives whose
 * moment has passed and works the case table of d-41v9yqvh:
 *
 *  - its Pipeline or Account is deleted → `abandoned`; nothing is called and
 *    what was recorded stays readable
 *  - its Pipeline is not active on the Account → nothing performs and the row
 *    stays `pending`, so it fires late if the Pipeline returns
 *  - the Message has already left the inbox → `already_departed`; the mailbox is
 *    untouched and the outcome records on the run that recorded it
 *  - a Limit denies the call → the row stays `pending` and the next beat retries
 *  - the call fails past its operation's retries → `failed` on that run; the
 *    retry is a re-triage (d-0tebpjex)
 *  - otherwise → `archived`, recorded on the run that recorded it
 *
 * The sweep shares the in-flight guard shape of the other two schedulers: a beat
 * arriving while a previous sweep is still working is a no-op, so one due row is
 * never worked twice concurrently.
 */

import type { Config } from '../config.js'
import type { DB } from '../db/schema.js'
import type { MakeUnderlyingClients } from '../resources/underlying-clients.js'

export interface PendingArchiveSchedulerDeps {
  readonly db: DB
  readonly config: Config
  readonly makeClients: MakeUnderlyingClients
}

/** What one due pending Archive did on this beat. */
export interface PendingArchiveSweepSummary {
  readonly pendingArchiveId: number
  readonly messageId: number
  readonly triageId: number
  readonly operatorId: number
  /** The case of d-41v9yqvh this row met. `deferred` is a Limit denial or an
   * inactive Pipeline — the row still stands. */
  readonly outcome: 'archived' | 'already_departed' | 'failed' | 'abandoned' | 'deferred'
}

export interface PendingArchiveScheduler {
  /**
   * Work every pending Archive due as of `now` (Unix seconds; defaults to the
   * wall clock). Guarded: a call made while a previous sweep is in flight is a
   * no-op returning `[]`. One row's failure is recorded on its own run and does
   * not abort the others.
   */
  runDuePendingArchives(now?: number): Promise<PendingArchiveSweepSummary[]>
  /** Await any in-flight sweep's DB writes, so shutdown can close the
   * connection under it. Idempotent. */
  drain(): Promise<void>
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function createPendingArchiveScheduler(deps: PendingArchiveSchedulerDeps): PendingArchiveScheduler {
  void deps
  let inFlight: Promise<PendingArchiveSweepSummary[]> | null = null

  function runSweep(now: number): Promise<PendingArchiveSweepSummary[]> {
    void now
    // Stub: the Code wave performs each due row against the metered mailbox
    // client. Standing rows are left as they are, which is the deferral the
    // case table already allows, so nothing is lost by a beat that finds this.
    return Promise.resolve([])
  }

  function runDuePendingArchives(now: number = nowSeconds()): Promise<PendingArchiveSweepSummary[]> {
    if (inFlight !== null) {
      return Promise.resolve([])
    }
    const sweep = runSweep(now)
    inFlight = sweep
    void sweep.finally(() => {
      if (inFlight === sweep) {
        inFlight = null
      }
    })
    return sweep
  }

  async function drain(): Promise<void> {
    if (inFlight !== null) {
      await inFlight.catch(() => undefined)
    }
  }

  return { runDuePendingArchives, drain }
}
