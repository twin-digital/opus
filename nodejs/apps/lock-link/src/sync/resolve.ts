/**
 * The Lynx→Lodgify join. Lynx never returns Lodgify's numeric booking number directly,
 * but embeds it in `confirmationCode = <lodgifyBookingId>VK<accountId>`. The `VK<accountId>`
 * suffix is constant per Lynx account, so every code must end with it — one that doesn't is
 * an integrity error to escalate, not a silent skip.
 */

export class ConfirmationCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfirmationCodeError'
  }
}

/**
 * Extract the Lodgify booking id from a Lynx `confirmationCode`. Throws
 * `ConfirmationCodeError` if the code doesn't end with `VK<accountId>` or has no numeric
 * booking id before it (both → escalate).
 */
export const resolveBookingId = (confirmationCode: string, accountId: number): number => {
  const suffix = `VK${String(accountId)}`
  if (!confirmationCode.endsWith(suffix)) {
    throw new ConfirmationCodeError(`confirmationCode "${confirmationCode}" does not end with "${suffix}"`)
  }
  const bookingId = confirmationCode.slice(0, -suffix.length)
  if (!/^\d+$/.test(bookingId)) {
    throw new ConfirmationCodeError(
      `confirmationCode "${confirmationCode}" has no numeric booking id before "${suffix}"`,
    )
  }
  return Number(bookingId)
}
