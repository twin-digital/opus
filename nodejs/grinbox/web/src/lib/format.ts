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
