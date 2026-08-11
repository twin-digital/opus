/**
 * Small presentation helpers shared by the account surfaces.
 */

/**
 * Render a UNIX-seconds timestamp as a compact relative time ("2m ago",
 * "3h ago", "5d ago"), or "never" when null. Used for an Account's last-poll
 * column (ui-design.md "Account list"). `now` is injectable for deterministic
 * tests.
 */
export function relativeTime(unixSeconds: number | null, now: number = Date.now()): string {
  if (unixSeconds === null) {
    return 'never'
  }
  const deltaSec = Math.max(0, Math.floor(now / 1000) - unixSeconds)
  if (deltaSec < 5) {
    return 'just now'
  }
  if (deltaSec < 60) {
    return `${deltaSec}s ago`
  }
  const min = Math.floor(deltaSec / 60)
  if (min < 60) {
    return `${min}m ago`
  }
  const hr = Math.floor(min / 60)
  if (hr < 24) {
    return `${hr}h ago`
  }
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

/**
 * Render a UNIX-seconds moment still ahead as a compact countdown ("in 45s",
 * "in 2h", "in 5d"). A moment already past reads "due now" rather than as a
 * negative time: grinbox sweeps what is due on its next heartbeat (d-gzv0jty7),
 * so past-due means imminent, not missed. `now` is injectable for tests.
 */
export function timeUntil(unixSeconds: number, now: number = Date.now()): string {
  const deltaSec = unixSeconds - Math.floor(now / 1000)
  if (deltaSec <= 0) {
    return 'due now'
  }
  return `in ${formatSeconds(deltaSec)}`
}

/** Compact duration rendering: "45s", "10m", "1h", "1d". */
export function formatSeconds(seconds: number): string {
  if (seconds % 86_400 === 0) {
    return `${seconds / 86_400}d`
  }
  if (seconds % 3_600 === 0) {
    return `${seconds / 3_600}h`
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`
  }
  return `${seconds}s`
}

/** A UNIX-seconds moment in the viewer's locale, for tooltips and detail lines. */
export function absoluteTime(unixSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(unixSeconds * 1000))
}
