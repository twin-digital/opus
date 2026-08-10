/**
 * Cron occurrence math for the digest scheduler, over `croner` patterns
 * (architecture.md tech stack). A `Cron` constructed without a callback is a
 * pure pattern object — nothing is scheduled; only `nextRun(from)` is used.
 *
 * The scheduler needs one question answered per tick: *what is the most recent
 * scheduled occurrence at or before now that has not been attempted yet?*
 * Firing exactly that occurrence (and nothing older) is what gives catch-up
 * its at-most-once semantics: occurrences missed while the Daemon was down
 * collapse into the single latest one, whose run covers the whole gap via the
 * watermark window.
 */

import { Cron } from 'croner'

/**
 * Parse a digest `schedule` (+ optional IANA `timezone`) into a pattern-only
 * croner instance, or `null` when croner rejects either. Used both by the
 * scheduler and by the server-side config validation layered onto the shared
 * digest config schema.
 */
export function tryParseCron(schedule: string, timezone?: string): Cron | null {
  try {
    const cron = new Cron(schedule, timezone ? { timezone } : {})
    // croner validates the pattern at construction but the timezone only when
    // an occurrence is computed; force one computation so a bad zone fails
    // here rather than mid-scan.
    cron.nextRun()
    return cron
  } catch {
    return null
  }
}

/**
 * Validate a digest schedule/timezone pair; returns a human-readable error, or
 * `null` when valid. The error message carries croner's own reason.
 */
export function validateDigestSchedule(schedule: string, timezone?: string): string | null {
  try {
    const cron = new Cron(schedule, timezone ? { timezone } : {})
    cron.nextRun() // force timezone evaluation (see tryParseCron)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * Cap on `nextRun` steps per scan pass. A pass that exceeds it means the
 * occurrences are denser than the scanned range warrants walking; the caller
 * retries from a narrower floor (see {@link latestDueOccurrence}).
 */
const MAX_SCAN_STEPS = 5000

/**
 * The most recent occurrence of `schedule` that is strictly after `after` and
 * at or before `now` (both Unix seconds), or `null` when there is none — i.e.
 * the single occurrence the scheduler should fire, skipping any older missed
 * ones. Returns `null` for an unparseable schedule/timezone.
 *
 * croner exposes only forward iteration (`nextRun`), so the scan walks
 * occurrences from a floor toward `now`, keeping the last one `<= now`. To
 * bound the walk for dense schedules over long gaps (a first run whose floor
 * is the Operator's `created_at`, months back, on an every-few-minutes cron),
 * the scan falls back through progressively narrower floors: a pass that
 * exceeds {@link MAX_SCAN_STEPS} proves the spacing is short relative to the
 * scanned range, so the latest occurrence necessarily also lies within the
 * narrower range, where the walk terminates.
 */
export function latestDueOccurrence(args: {
  readonly schedule: string
  readonly timezone?: string
  /** Occurrences at or before this are already attempted (or precede the
   * Operator); only strictly-later ones are due. */
  readonly after: number
  readonly now: number
}): number | null {
  const cron = tryParseCron(args.schedule, args.timezone)
  if (cron === null) {
    return null
  }
  if (args.now <= args.after) {
    return null
  }

  const floors = [args.after, args.now - 32 * 86_400, args.now - 86_400, args.now - 3_600]
  for (const floor of floors) {
    const start = Math.max(args.after, floor)
    const pass = scan(cron, start, args.now)
    if (pass.terminated) {
      return pass.latest
    }
  }
  // Every pass capped out — occurrences denser than 1/second over the last
  // hour, which croner patterns cannot express. Unreachable in practice.
  return null
}

/** One bounded forward walk from `after` (exclusive) to `now` (inclusive). */
function scan(cron: Cron, after: number, now: number): { terminated: boolean; latest: number | null } {
  let cursor = new Date(after * 1000)
  let latest: number | null = null
  for (let i = 0; i < MAX_SCAN_STEPS; i++) {
    const next = cron.nextRun(cursor)
    if (next === null) {
      return { terminated: true, latest }
    }
    const nextSec = Math.floor(next.getTime() / 1000)
    if (nextSec > now) {
      return { terminated: true, latest }
    }
    latest = nextSec
    // `nextRun` is strictly-after its argument; the extra +1s guard makes
    // forward progress structural even if a croner edge returned the cursor
    // itself (cron resolution is >= 1s, so no occurrence can be skipped).
    cursor = new Date(Math.max(next.getTime(), cursor.getTime() + 1000))
  }
  return { terminated: false, latest }
}
