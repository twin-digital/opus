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
 * earliest due where that Triage recorded several (d-0tajzoy7). Every read
 * surface a Message appears on carries it while it stands — and `null` where
 * the Message holds none — so what a re-Triage would cancel is visible before
 * it fires (d-p0ea1t8q). Only a standing pending archive is carried, so the
 * shape needs no status.
 *  - `due_at` — Unix seconds, the Message's take-in plus the recording
 *    Operator's delay. A moment already past when the Triage settled is due at
 *    once.
 *  - `triage_id` — the Triage that recorded it; the run it is recorded against
 *    when it performs.
 *  - `operator_id` — the archive Operator whose run recorded it.
 */
export const pendingArchiveSchema = z.object({
  due_at: z.number().int(),
  triage_id: z.number().int().positive(),
  operator_id: z.number().int().positive(),
})
export type PendingArchive = z.infer<typeof pendingArchiveSchema>

/**
 * Why a due pending archive made no mailbox call — the `reason` a
 * `pending_archive_skipped` triage event carries in its details (d-41v9yqvh,
 * d-ymvh4v9a):
 *  - `already_departed` — the Message had already left the inbox, so the
 *    mailbox was left untouched.
 *  - `abandoned` — the pending archive's Pipeline or Account is gone; what was
 *    recorded of it stays readable.
 *  - `pipeline_inactive` — the Pipeline is not active on the Account. It fires
 *    late if the Pipeline returns while the pending archive still stands.
 *
 * Closed, and code-resident rather than CHECK-constrained: the reason lives
 * inside a triage event's details. Declaring it here is what stops the daemon
 * writing a reason the interface has never heard of — it is not a gate the
 * interface parses through. A reader that meets an unrecognised reason shows it
 * as stored, so a daemon ahead of the interface still says something.
 */
export const pendingArchiveSkipReasonSchema = z.enum(['already_departed', 'abandoned', 'pipeline_inactive'])
export type PendingArchiveSkipReason = z.infer<typeof pendingArchiveSkipReasonSchema>
