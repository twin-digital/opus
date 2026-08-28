import { UnknownReferenceValueError } from './errors.js'
import type { Position } from './position.js'

export const LINEUP_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH', 'IR'] as const

export type LineupSlot = (typeof LINEUP_SLOTS)[number]

/** Positions eligible to fill each starting slot — drives VOR replacement ranks. */
export const SLOT_ELIGIBILITY: Record<LineupSlot, Position[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  DST: ['DST'],
  K: ['K'],
  BENCH: [],
  IR: [],
}

/**
 * ESPN numeric lineup slot ids (keys of `mSettings.rosterSettings.lineupSlotCounts`, and
 * `lineupSlotId` on draft picks / roster entries). Other ids (3 RB/WR, 5 WR/TE, 7 OP,
 * 8–15 IDP, 18 P, 19 HC) exist in ESPN's scheme; ingest asserts the league uses none of
 * them — supporting one is a deliberate change here, not a silent pass-through.
 */
export const ESPN_LINEUP_SLOT_IDS: Record<number, LineupSlot> = {
  0: 'QB',
  2: 'RB',
  4: 'WR',
  6: 'TE',
  23: 'FLEX',
  16: 'DST',
  17: 'K',
  20: 'BENCH',
  21: 'IR',
}

export const lineupSlotFromEspn = (slotId: number): LineupSlot => {
  const slot: LineupSlot | undefined = ESPN_LINEUP_SLOT_IDS[slotId]
  if (slot === undefined) {
    throw new UnknownReferenceValueError('LineupSlot', 'espn', slotId)
  }
  return slot
}
