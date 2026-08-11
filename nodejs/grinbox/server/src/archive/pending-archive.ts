/**
 * The pending Archive: the Archive a Triage concluded but did not perform
 * (d-grcdd4ov).
 *
 * An Archive Operator carrying `delay_seconds` makes no mailbox call during its
 * run. It records `pending_archive_recorded` on its own run, carrying the
 * moment the Archive comes due — the Message's take-in (`messages.created_at`,
 * the same clock the digest's coverage span reads) plus the delay, never the
 * Triage's own time.
 *
 * Settlement is what turns those recordings into the one pending Archive the
 * Message holds (d-0tajzoy7). When a Triage settles as the Message's latest, its
 * earliest recorded due moment becomes the standing row and whatever stood
 * before is settled `superseded`; a latest Triage that recorded none settles the
 * standing row `cancelled`. So re-triaging is the user's lever on a pending
 * Archive, and the reconcile runs inside the settlement transaction so two
 * concurrent settlements cannot both write a standing row.
 */

import type { Kysely } from 'kysely'
import type { Database, PendingArchiveStatus } from '../db/schema.js'
import type { TriageEventInput } from '../pipeline/persist.js'

/** The moment a delayed Archive comes due: take-in plus the delay. */
export function pendingArchiveDueAt(takenInAt: number, delaySeconds: number): number {
  return takenInAt + delaySeconds
}

/** What a `pending_archive_recorded` event carries. */
export interface PendingArchiveRecordedDetails {
  readonly due_at: number
  readonly delay_seconds: number
}

/** The event an Archive run records instead of calling the mailbox. */
export function pendingArchiveRecordedEvent(details: PendingArchiveRecordedDetails): TriageEventInput {
  return { eventType: 'pending_archive_recorded', detailsJson: JSON.stringify(details) }
}

/** Why a due pending Archive made no call (d-41v9yqvh). */
export type PendingArchiveSkipReason = 'already_departed' | 'abandoned' | 'pipeline_inactive'

/** The event recorded on the run when a due pending Archive made no call. */
export function pendingArchiveSkippedEvent(reason: PendingArchiveSkipReason): TriageEventInput {
  return { eventType: 'pending_archive_skipped', detailsJson: JSON.stringify({ reason }) }
}

/** A Message's standing pending Archive, as the read surfaces carry it. */
export interface StandingPendingArchive {
  readonly message_id: number
  /** Unix seconds the Archive comes due. */
  readonly due_at: number
  /** The Triage that recorded it — what a re-triage would cancel (d-p0ea1t8q). */
  readonly triage_id: number
  /** The Archive Operator whose run recorded it. */
  readonly operator_id: number
}

/**
 * Load the standing pending Archive of each of `messageIds`, keyed by message
 * id. Messages with none are absent from the map.
 */
export async function loadStandingPendingArchives(
  db: Kysely<Database>,
  messageIds: readonly number[],
): Promise<Map<number, StandingPendingArchive>> {
  const out = new Map<number, StandingPendingArchive>()
  if (messageIds.length === 0) {
    return out
  }
  const rows = await db
    .selectFrom('pending_archives')
    .select(['message_id', 'due_at', 'triage_id', 'operator_id'])
    .where('status', '=', 'pending')
    .where('message_id', 'in', messageIds)
    .execute()
  for (const r of rows) {
    out.set(r.message_id, r)
  }
  return out
}

/** Move a pending row to a terminal status. */
export async function settlePendingArchive(
  tx: Kysely<Database>,
  id: number,
  status: Exclude<PendingArchiveStatus, 'pending'>,
  ts: number,
): Promise<void> {
  await tx
    .updateTable('pending_archives')
    .set({ status, settled_at: ts })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .execute()
}

/**
 * Reconcile a Message's pending Archive against a Triage that has just settled,
 * inside that settlement's transaction (d-0tajzoy7).
 *
 * Does nothing where a later-started settled Triage of the same Message already
 * exists — the standing pending Archive is the *latest* settled Triage's, and
 * settlements can land out of order. Otherwise the Triage's earliest recorded
 * due moment replaces whatever stood, and a Triage that recorded none cancels
 * it.
 */
export async function reconcilePendingArchiveOnSettle(
  tx: Kysely<Database>,
  triageId: number,
  ts: number,
): Promise<void> {
  const triage = await tx
    .selectFrom('triages')
    .select(['id', 'message_id', 'started_at'])
    .where('id', '=', triageId)
    .executeTakeFirst()
  if (triage === undefined) {
    return
  }

  const later = await tx
    .selectFrom('triages')
    .select('id')
    .where('message_id', '=', triage.message_id)
    .where('id', '!=', triageId)
    .where('ended_at', 'is not', null)
    .where('started_at', '>', triage.started_at)
    .limit(1)
    .executeTakeFirst()
  if (later !== undefined) {
    return
  }

  const recorded = await earliestRecorded(tx, triageId)

  const standing = await tx
    .selectFrom('pending_archives')
    .select(['id', 'triage_id'])
    .where('message_id', '=', triage.message_id)
    .where('status', '=', 'pending')
    .executeTakeFirst()

  if (standing !== undefined) {
    if (standing.triage_id === triageId) {
      // Already reconciled for this Triage (a re-entrant settlement check).
      return
    }
    await settlePendingArchive(tx, standing.id, recorded === null ? 'cancelled' : 'superseded', ts)
  }

  if (recorded === null) {
    return
  }

  await tx
    .insertInto('pending_archives')
    .values({
      message_id: triage.message_id,
      triage_id: triageId,
      operator_id: recorded.operatorId,
      due_at: recorded.dueAt,
      status: 'pending',
      settled_at: null,
      created_at: ts,
    })
    .execute()
}

/**
 * The earliest due moment this Triage recorded, with the Operator run that
 * recorded it, or `null` where it recorded none. Where several runs recorded
 * one, the earliest wins (d-0tajzoy7); ties go to the lower operator id so the
 * choice is deterministic.
 */
async function earliestRecorded(
  tx: Kysely<Database>,
  triageId: number,
): Promise<{ dueAt: number; operatorId: number } | null> {
  const events = await tx
    .selectFrom('triage_events')
    .select(['operator_id', 'details_json'])
    .where('triage_id', '=', triageId)
    .where('event_type', '=', 'pending_archive_recorded')
    .orderBy('operator_id', 'asc')
    .execute()

  let best: { dueAt: number; operatorId: number } | null = null
  for (const e of events) {
    const dueAt = dueAtOf(e.details_json)
    if (dueAt === null) {
      continue
    }
    if (best === null || dueAt < best.dueAt) {
      best = { dueAt, operatorId: e.operator_id }
    }
  }
  return best
}

/** The `due_at` a `pending_archive_recorded` event's details carry, or `null`. */
function dueAtOf(detailsJson: string | null): number | null {
  if (detailsJson === null) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(detailsJson)
    const dueAt = (parsed as { due_at?: unknown }).due_at
    return typeof dueAt === 'number' ? dueAt : null
  } catch {
    return null
  }
}
