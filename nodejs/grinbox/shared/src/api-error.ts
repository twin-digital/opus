import { z } from 'zod'

/**
 * The structured form the API answers a refused write in (d-u2rotm38). A
 * refusal names what was wrong rather than handing back a sentence for a human:
 * `code` is the stable machine discriminator a client branches on, `message` is
 * the human-readable copy, and `details` carries the case-specific structure —
 * the per-error list from a pipeline validation failure, the offending field, the
 * dependent operator ids that block a delete.
 *
 * Declared here so the daemon and the browser application read the same shape
 * (d-j4huq3jy): the daemon composes refusals from it, and the browser parses
 * them with it.
 */
export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>

/**
 * The refusal `code`s grinbox itself produces. The schema keeps `code` an open
 * string — a client branches on the codes it knows and falls back on the
 * `message` for any it does not — so adding a refusal is not a breaking change
 * to the envelope.
 */
export const API_ERROR_CODES = [
  'pipeline_validation_failed',
  'invalid_config',
  'invalid_kind_name',
  'credential_in_use',
  'cooldown_conflict',
  'limit_conflict',
  'name_conflict',
  'pipeline_not_assignable',
  'poll_interval_out_of_range',
  'seeded_limit',
  'not_found',
  'invalid_category_name',
  'duplicate_folder_role',
  'account_login_failed',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]
