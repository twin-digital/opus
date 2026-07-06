import { type BookingSnapshot, type Outcome } from '../sync/sync.js'

/**
 * Pure log-payload builders — separated from the emit site so the field selection and
 * masking rules are unit-testable without mocking Powertools Logger. The security posture
 * of the observability layer rests on these shapes; a test that pins them keeps a future
 * regression (reintroducing raw `code`, mistyping `**` on a short value, misrouting the
 * mask into another field) from landing silently.
 */

/** `**` + the last two digits of a Lynx door code. The whole PIN is a physical-access
 * secret, so only a suffix goes into CloudWatch — enough to match a sync log against the
 * value visible in Lodgify, not enough to enter a lock. */
export const maskCode = (code: string): string => `**${code.slice(-2)}`

export const buildSnapshotLogFields = (b: BookingSnapshot): Record<string, unknown> => ({
  bookingId: b.bookingId,
  arrival: b.arrival,
  category: b.category,
  status: b.status,
})

export const buildOutcomeLogFields = (o: Outcome): Record<string, unknown> => ({
  bookingId: o.bookingId,
  action: o.action,
  ...(o.code !== undefined && { codeMasked: maskCode(o.code) }),
  roomTypeIds: o.roomTypeIds,
  confirmationCode: o.confirmationCode,
  reasons: o.reasons,
})
