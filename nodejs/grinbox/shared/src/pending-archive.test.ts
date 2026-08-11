import { describe, expect, it } from 'vitest'
import { archiveDelaySecondsSchema, pendingArchiveSchema } from './index.js'
import { archiveConfigSchema } from './operators.js'

// --- archiveDelaySecondsSchema (d-grcdd4ov) -------------------------------
//
// Whole seconds, at least one, no ceiling. Present-or-absent is the delay's
// existence: an archive with none archives during the Triage it runs in.

describe('archiveDelaySecondsSchema', () => {
  it('accepts one second (the floor)', () => {
    expect(archiveDelaySecondsSchema.safeParse(1).success).toBe(true)
  })

  it('accepts a large delay (no ceiling)', () => {
    expect(archiveDelaySecondsSchema.safeParse(60 * 60 * 24 * 365).success).toBe(true)
  })

  it('rejects zero, a negative, and a fraction', () => {
    expect(archiveDelaySecondsSchema.safeParse(0).success).toBe(false)
    expect(archiveDelaySecondsSchema.safeParse(-1).success).toBe(false)
    expect(archiveDelaySecondsSchema.safeParse(90.5).success).toBe(false)
  })
})

describe('archiveConfigSchema', () => {
  it('parses a config stored before delays existed, unchanged', () => {
    const parsed = archiveConfigSchema.safeParse({ when: { tag_key: 'disposition', equals: ['archive'] } })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.delay_seconds).toBeUndefined()
    }
  })

  it('carries the delay alongside the gate', () => {
    const parsed = archiveConfigSchema.safeParse({
      delay_seconds: 7200,
      when: { tag_key: 'disposition', equals: ['archive_later'] },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.delay_seconds).toBe(7200)
    }
  })
})

// --- pendingArchiveSchema (d-0tajzoy7, d-p0ea1t8q) ------------------------
//
// A Message holds at most one pending archive: the due moment and the Triage
// that recorded it, carried on the Message's read surfaces while it stands.

describe('pendingArchiveSchema', () => {
  it('carries the due moment and the recording Triage', () => {
    const parsed = pendingArchiveSchema.safeParse({ due_at: 1_770_000_000, triage_id: 42 })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({ due_at: 1_770_000_000, triage_id: 42 })
    }
  })

  it('requires both the due moment and the Triage', () => {
    expect(pendingArchiveSchema.safeParse({ due_at: 1_770_000_000 }).success).toBe(false)
    expect(pendingArchiveSchema.safeParse({ triage_id: 42 }).success).toBe(false)
  })

  it('takes a due moment already past (a delay elapsed at settle is due at once)', () => {
    expect(pendingArchiveSchema.safeParse({ due_at: 0, triage_id: 1 }).success).toBe(true)
  })

  it('rejects a non-integer due moment or a non-positive Triage id', () => {
    expect(pendingArchiveSchema.safeParse({ due_at: 1.5, triage_id: 1 }).success).toBe(false)
    expect(pendingArchiveSchema.safeParse({ due_at: 1, triage_id: 0 }).success).toBe(false)
  })
})
