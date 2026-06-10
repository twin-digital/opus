import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TagChip, TagOverflowChip, orderTagsByPriority, tagColorIndex } from './tag-chip.js'

/**
 * Tag-chip helpers + components (mostly pure). The color index must be stable
 * per key and spread across the 8-slot palette (not collapse to a constant);
 * ordering must be deterministic, honor an optional registry priority list, and
 * dedup repeated priority keys; the chips render key-muted / value-mono / `+N`.
 */

describe('tagColorIndex', () => {
  it('is stable for the same key', () => {
    expect(tagColorIndex('urgency')).toBe(tagColorIndex('urgency'))
  })

  it('stays within the 8-color palette', () => {
    for (const key of ['urgency', 'domain', 'action', 'sender', 'x', '']) {
      const idx = tagColorIndex(key)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(8)
    }
  })

  it('spreads keys across the palette (not a constant)', () => {
    // Hand-computed against the FNV-1a hash — a `return 0` mutant fails these.
    expect(tagColorIndex('urgency')).toBe(4)
    expect(tagColorIndex('action')).toBe(7)
    // Several distinct keys must land on more than one slot.
    const slots = new Set(['urgency', 'domain', 'action', 'sender', 'b'].map(tagColorIndex))
    expect(slots.size).toBeGreaterThan(1)
  })
})

describe('orderTagsByPriority', () => {
  const tags = [
    { key: 'zebra', value: 'b' },
    { key: 'alpha', value: 'a' },
    { key: 'mid', value: 'c' },
  ]

  it('falls back to a stable lexicographic order without a priority list', () => {
    expect(orderTagsByPriority(tags).map((t) => t.key)).toEqual(['alpha', 'mid', 'zebra'])
  })

  it('honors an explicit key-priority order, with unranked keys after', () => {
    expect(orderTagsByPriority(tags, ['zebra', 'mid']).map((t) => t.key)).toEqual(['zebra', 'mid', 'alpha'])
  })

  it('breaks a same-key tie by value, lexicographically', () => {
    const sameKey = [
      { key: 'urgency', value: 'medium' },
      { key: 'urgency', value: 'high' },
      { key: 'urgency', value: 'low' },
    ]
    expect(orderTagsByPriority(sameKey).map((t) => t.value)).toEqual(['high', 'low', 'medium'])
  })

  it('dedups a repeated key in the priority list (first position wins)', () => {
    // 'a' appears twice; the dedup keeps rank 0 so it stays ahead of 'b' (rank 2).
    const t = [
      { key: 'b', value: '1' },
      { key: 'a', value: '1' },
    ]
    expect(orderTagsByPriority(t, ['a', 'b', 'a']).map((x) => x.key)).toEqual(['a', 'b'])
  })
})

describe('TagChip / TagOverflowChip rendering', () => {
  it('renders the key (muted) and value, with provenance as a title', () => {
    render(<TagChip tagKey='urgency' value='high' provenance='Triage 200' />)
    const key = screen.getByText('urgency:')
    const value = screen.getByText('high')
    expect(key).toHaveClass('opacity-70')
    expect(value).toHaveClass('font-mono')
    // The provenance tooltip lives on the chip wrapper.
    expect(key.closest('[data-tag-key="urgency"]')).toHaveAttribute('title', 'Triage 200')
  })

  it('renders the +N overflow chip', () => {
    render(<TagOverflowChip count={2} title='2 more' />)
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('+2')).toHaveAttribute('title', '2 more')
  })
})
