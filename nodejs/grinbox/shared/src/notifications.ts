import { z } from 'zod'

/**
 * The notification-kind and cooldown vocabulary (d-vn2jdxbs, d-k3wq81vn).
 * A notify Operator may name a notification kind — a short name the user
 * chooses — and every push it sends then belongs to that kind. A cooldown is
 * the user's per-kind minimum interval: a push whose kind was delivered inside
 * it is suppressed rather than sent.
 */

/**
 * A notification kind's name: a non-empty line of text, trimmed of surrounding
 * whitespace and otherwise stored as typed (d-p8xrn2ce). Parsing produces the
 * stored form (the trim is applied here), and two Operators share a kind
 * exactly when their stored names match character for character — no case
 * folding, no further normalization.
 */
export const notificationKindSchema = z
  .string()
  .trim()
  .min(1)
  .refine((kind) => !/[\r\n]/.test(kind), {
    message: 'a notification kind is a single line of text',
  })
export type NotificationKind = z.infer<typeof notificationKindSchema>

/**
 * A cooldown interval: a whole number of seconds, at least one, with no
 * ceiling (d-t6mhv3aq). Present-or-absent is the setting's existence — a kind
 * with no setting has no cooldown, and zero is not stored (removing the
 * cooldown deletes the setting rather than writing 0).
 */
export const cooldownIntervalSecondsSchema = z.number().int().min(1)
export type CooldownIntervalSeconds = z.infer<typeof cooldownIntervalSecondsSchema>

/**
 * A cooldown setting: the user's per-kind interval, keyed by the kind's name
 * and shared across every Pipeline (d-k3wq81vn). Operators naming one kind
 * share one cooldown wherever they live, and the setting outlives the
 * Operators naming its kind.
 */
export const cooldownSettingSchema = z.object({
  kind: notificationKindSchema,
  interval_seconds: cooldownIntervalSecondsSchema,
})
export type CooldownSetting = z.infer<typeof cooldownSettingSchema>
