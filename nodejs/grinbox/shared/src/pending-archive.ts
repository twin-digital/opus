import { z } from 'zod'

/**
 * The pending-archive vocabulary (d-grcdd4ov, d-0tajzoy7, d-p0ea1t8q). An
 * archive Operator may carry a delay; a Triage that settles with one recorded
 * leaves a pending archive on the Message, due that many seconds past the
 * Message's take-in, and grinbox performs it when it comes due.
 */

/**
 * An archive delay: a whole number of seconds, at least one, with no ceiling
 * (d-grcdd4ov). Present-or-absent is the delay's existence — an archive config
 * with none archives during the Triage it runs in, and zero is not stored
 * (removing the delay drops the field rather than writing 0). Mirrors the
 * cooldown interval's form.
 */
export const archiveDelaySecondsSchema = z.number().int().min(1)
export type ArchiveDelaySeconds = z.infer<typeof archiveDelaySecondsSchema>

/**
 * A Message's pending archive: the one its latest settled Triage recorded, the
 * earliest due where that Triage recorded several (d-0tajzoy7). Carried on the
 * Message's read surfaces while it stands, so what a re-Triage would cancel is
 * visible before it fires (d-p0ea1t8q).
 *  - `due_at` — Unix seconds, the Message's take-in plus the recording
 *    Operator's delay. A moment already past when the Triage settled is due at
 *    once.
 *  - `triage_id` — the Triage that recorded it; the run it is recorded against
 *    when it performs.
 */
export const pendingArchiveSchema = z.object({
  due_at: z.number().int(),
  triage_id: z.number().int().positive(),
})
export type PendingArchive = z.infer<typeof pendingArchiveSchema>
