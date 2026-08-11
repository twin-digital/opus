import { describe, expect, it } from 'vitest'
import { cooldownIntervalSecondsSchema, cooldownSettingSchema, notificationKindSchema } from './index.js'
import { notifyConfigSchema } from './operators.js'

// --- notificationKindSchema (d-p8xrn2ce) ----------------------------------
//
// A kind's name is a non-empty line of text, trimmed of surrounding whitespace
// and otherwise stored as typed. Parsing produces the stored form; matching is
// character-for-character over that form.

describe('notificationKindSchema', () => {
  it('accepts a short name and stores it as typed', () => {
    const parsed = notificationKindSchema.safeParse('order updates')
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toBe('order updates')
    }
  })

  it('trims surrounding whitespace to produce the stored form', () => {
    const parsed = notificationKindSchema.safeParse('  urgent\t')
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toBe('urgent')
    }
  })

  it('preserves inner whitespace and case exactly (matched character for character)', () => {
    const parsed = notificationKindSchema.safeParse('Order  Updates')
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      // No case folding, no inner-whitespace collapsing: 'Order  Updates' and
      // 'order updates' are two different kinds.
      expect(parsed.data).toBe('Order  Updates')
      expect(parsed.data).not.toBe('order updates')
    }
  })

  it('rejects an empty name', () => {
    expect(notificationKindSchema.safeParse('').success).toBe(false)
  })

  it('rejects a whitespace-only name (empty once trimmed)', () => {
    expect(notificationKindSchema.safeParse('   ').success).toBe(false)
  })

  it('rejects a name spanning more than one line', () => {
    expect(notificationKindSchema.safeParse('order\nupdates').success).toBe(false)
    expect(notificationKindSchema.safeParse('order\rupdates').success).toBe(false)
  })
})

// --- cooldownIntervalSecondsSchema (d-t6mhv3aq) ---------------------------
//
// Whole seconds, at least one, no ceiling. Zero is never stored — removing the
// cooldown deletes the setting instead.

describe('cooldownIntervalSecondsSchema', () => {
  it('accepts one second (the floor)', () => {
    expect(cooldownIntervalSecondsSchema.safeParse(1).success).toBe(true)
  })

  it('accepts an arbitrarily large interval (no ceiling)', () => {
    expect(cooldownIntervalSecondsSchema.safeParse(60 * 60 * 24 * 365).success).toBe(true)
  })

  it('rejects zero (a kind with no cooldown has no setting)', () => {
    expect(cooldownIntervalSecondsSchema.safeParse(0).success).toBe(false)
  })

  it('rejects a negative interval', () => {
    expect(cooldownIntervalSecondsSchema.safeParse(-60).success).toBe(false)
  })

  it('rejects a fractional interval (whole seconds only)', () => {
    expect(cooldownIntervalSecondsSchema.safeParse(1.5).success).toBe(false)
  })
})

// --- cooldownSettingSchema (d-k3wq81vn) -----------------------------------

describe('cooldownSettingSchema', () => {
  it('accepts a setting keyed by the kind name', () => {
    const parsed = cooldownSettingSchema.safeParse({ kind: 'order updates', interval_seconds: 600 })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({ kind: 'order updates', interval_seconds: 600 })
    }
  })

  it('trims the kind to its stored form', () => {
    const parsed = cooldownSettingSchema.safeParse({ kind: ' urgent ', interval_seconds: 1 })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.kind).toBe('urgent')
    }
  })

  it('rejects a setting without an interval', () => {
    expect(cooldownSettingSchema.safeParse({ kind: 'urgent' }).success).toBe(false)
  })
})

// --- notify config's notification_kind (d-vn2jdxbs) ------------------------

describe('notify config notification_kind', () => {
  const base = { message_template: 'hi', credentials_id: 1 }

  it('accepts a config naming a kind', () => {
    const parsed = notifyConfigSchema.safeParse({ ...base, notification_kind: 'order updates' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.notification_kind).toBe('order updates')
    }
  })

  it('accepts a config naming none — it stands alone, and stored configs parse unchanged', () => {
    const parsed = notifyConfigSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.notification_kind).toBeUndefined()
    }
  })

  it('trims the named kind to its stored form', () => {
    const parsed = notifyConfigSchema.safeParse({ ...base, notification_kind: '  urgent ' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.notification_kind).toBe('urgent')
    }
  })

  it('rejects an empty or whitespace-only kind', () => {
    expect(notifyConfigSchema.safeParse({ ...base, notification_kind: '' }).success).toBe(false)
    expect(notifyConfigSchema.safeParse({ ...base, notification_kind: '  ' }).success).toBe(false)
  })
})
