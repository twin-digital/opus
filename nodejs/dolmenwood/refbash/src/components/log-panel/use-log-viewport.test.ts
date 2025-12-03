import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLogViewport } from './use-log-viewport.js'
import type { EventLogEntry } from '@twin-digital/dolmenwood'

describe('useLogViewport', () => {
  const createEvents = (count: number): EventLogEntry[] => {
    return Array.from({ length: count }, (_, i) => ({
      description: `Event ${i}`,
      gameTime: { year: 1, month: 1, day: 1, hour: 0, turn: 0 },
      realTime: new Date(),
    }))
  }

  describe('initialization', () => {
    it('shows all items when fewer items than height', () => {
      const items = createEvents(3)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 10,
          selectedIndex: null,
          focused: false,
        }),
      )

      expect(result.current.visibleItems).toHaveLength(3)
      expect(result.current.visibleStartIndex).toBe(0)
      expect(result.current.visibleEndIndex).toBe(3)
      expect(result.current.visibleItems).toEqual(items)
    })

    it('shows last N items when not focused', () => {
      const items = createEvents(20)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 5,
          selectedIndex: null,
          focused: false,
        }),
      )

      expect(result.current.visibleItems).toHaveLength(5)
      expect(result.current.visibleStartIndex).toBe(15)
      expect(result.current.visibleEndIndex).toBe(20)
      expect(result.current.visibleItems[0].description).toBe('Event 15')
      expect(result.current.visibleItems[4].description).toBe('Event 19')
    })

    it('shows last N items when focused but no selection', () => {
      const items = createEvents(20)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 5,
          selectedIndex: null,
          focused: true,
        }),
      )

      expect(result.current.visibleItems).toHaveLength(5)
      expect(result.current.visibleStartIndex).toBe(15)
      expect(result.current.visibleEndIndex).toBe(20)
    })
  })

  describe('scrollLeadingContext clamping', () => {
    it('clamps scrollLeadingContext to floor((height - 1) / 2)', () => {
      const items = createEvents(50)
      // height = 10, max should be floor(9/2) = 4
      // With scrollLeadingContext = 100, it should be clamped to 4
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 10,
          selectedIndex: 25,
          focused: true,
          scrollLeadingContext: 100,
        }),
      )

      // With clamped context of 4, selectedIndex 25 should be at position 4
      expect(result.current.visibleStartIndex).toBe(21)
      expect(result.current.visibleEndIndex).toBe(31)
    })

    it('handles scrollLeadingContext = 0', () => {
      const items = createEvents(50)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 10,
          selectedIndex: 25,
          focused: true,
          scrollLeadingContext: 0,
        }),
      )

      // With no leading context, should show selected at top
      expect(result.current.visibleStartIndex).toBe(25)
      expect(result.current.visibleEndIndex).toBe(35)
    })

    it('handles odd height values', () => {
      const items = createEvents(50)
      // height = 7, max should be floor(6/2) = 3
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 7,
          selectedIndex: 25,
          focused: true,
          scrollLeadingContext: 10,
        }),
      )

      // Should clamp to 3
      expect(result.current.visibleStartIndex).toBe(22)
      expect(result.current.visibleEndIndex).toBe(29)
    })
  })

  describe('scroll direction handling', () => {
    it('keeps selection near top when scrolling up', () => {
      const items = createEvents(50)
      const scrollLeadingContext = 3

      // User starts at index 20, establish viewport
      const { result, rerender } = renderHook(
        ({ selectedIndex }) =>
          useLogViewport({
            items,
            height: 10,
            selectedIndex,
            focused: true,
            scrollLeadingContext,
          }),
        { initialProps: { selectedIndex: 20 } },
      )

      // Initial viewport with selection at position 3 (topBoundary)
      expect(result.current.visibleStartIndex).toBe(17)

      // User scrolls up to 15
      rerender({ selectedIndex: 15 })

      // Should show selection at position 3 (scrollLeadingContext rows from top)
      expect(result.current.visibleStartIndex).toBe(12) // 15 - 3 = 12
      expect(result.current.visibleEndIndex).toBe(22)

      // Verify selected item is at correct position in viewport
      const selectedPositionInViewport = 15 - result.current.visibleStartIndex
      expect(selectedPositionInViewport).toBe(3)
    })

    it('keeps selection near bottom when scrolling down', () => {
      const items = createEvents(50)
      const scrollLeadingContext = 3
      const height = 10

      // User starts at index 15, establish viewport
      const { result, rerender } = renderHook(
        ({ selectedIndex }) =>
          useLogViewport({
            items,
            height,
            selectedIndex,
            focused: true,
            scrollLeadingContext,
          }),
        { initialProps: { selectedIndex: 15 } },
      )

      // Initial viewport
      expect(result.current.visibleStartIndex).toBe(12)

      // User scrolls down to 20
      rerender({ selectedIndex: 20 })

      // Should show selection at position (height - scrollLeadingContext - 1) = 6
      expect(result.current.visibleStartIndex).toBe(14) // 20 - (10 - 3 - 1) = 14
      expect(result.current.visibleEndIndex).toBe(24)

      // Verify selected item is at correct position in viewport
      const selectedPositionInViewport = 20 - result.current.visibleStartIndex
      expect(selectedPositionInViewport).toBe(6)
    })

    it('handles first selection without previous index', () => {
      const items = createEvents(50)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 10,
          selectedIndex: 25,
          focused: true,
          scrollLeadingContext: 3,
        }),
      )

      // Without direction, defaults to showing context above
      expect(result.current.visibleStartIndex).toBe(22)
      expect(result.current.visibleEndIndex).toBe(32)
    })

    it('handles same index (no movement)', () => {
      const items = createEvents(50)
      const { result, rerender } = renderHook(
        ({ selectedIndex }) =>
          useLogViewport({
            items,
            height: 10,
            selectedIndex,
            focused: true,
            scrollLeadingContext: 3,
          }),
        { initialProps: { selectedIndex: 25 } },
      )

      expect(result.current.visibleStartIndex).toBe(22)

      // Rerender with same index
      rerender({ selectedIndex: 25 })

      // Should maintain viewport
      expect(result.current.visibleStartIndex).toBe(22)
      expect(result.current.visibleEndIndex).toBe(32)
    })
  })

  describe('edge cases at boundaries', () => {
    it('clamps viewport to start when scrolling up near beginning', () => {
      const items = createEvents(20)

      // Start at index 5
      const { result, rerender } = renderHook(
        ({ selectedIndex }) =>
          useLogViewport({
            items,
            height: 10,
            selectedIndex,
            focused: true,
            scrollLeadingContext: 3,
          }),
        { initialProps: { selectedIndex: 5 } },
      )

      expect(result.current.visibleStartIndex).toBe(2)

      // Scroll up to index 2
      rerender({ selectedIndex: 2 })

      // Would want to show from index -1, but clamped to 0
      expect(result.current.visibleStartIndex).toBe(0)
      expect(result.current.visibleEndIndex).toBe(10)
    })

    it('clamps viewport to end when scrolling down near end', () => {
      const items = createEvents(20)

      // Start at index 15
      const { result, rerender } = renderHook(
        ({ selectedIndex }) =>
          useLogViewport({
            items,
            height: 10,
            selectedIndex,
            focused: true,
            scrollLeadingContext: 3,
          }),
        { initialProps: { selectedIndex: 15 } },
      )

      // Initial viewport should clamp to end since 15 is near the end
      expect(result.current.visibleStartIndex).toBe(10)

      // Scroll down to index 18
      rerender({ selectedIndex: 18 })

      // Would want to show beyond end, but clamped
      expect(result.current.visibleStartIndex).toBe(10) // 20 - 10 = 10
      expect(result.current.visibleEndIndex).toBe(20)
    })

    it('handles selecting first item', () => {
      const items = createEvents(20)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 10,
          selectedIndex: 0,
          focused: true,
          scrollLeadingContext: 3,
        }),
      )

      expect(result.current.visibleStartIndex).toBe(0)
      expect(result.current.visibleEndIndex).toBe(10)
      expect(result.current.visibleItems[0].description).toBe('Event 0')
    })

    it('handles selecting last item', () => {
      const items = createEvents(20)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 10,
          selectedIndex: 19,
          focused: true,
          scrollLeadingContext: 3,
        }),
      )

      expect(result.current.visibleStartIndex).toBe(10)
      expect(result.current.visibleEndIndex).toBe(20)
      expect(result.current.visibleItems[9].description).toBe('Event 19')
    })
  })

  describe('exact height match', () => {
    it('shows all items when item count equals height', () => {
      const items = createEvents(10)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 10,
          selectedIndex: 5,
          focused: true,
          scrollLeadingContext: 3,
        }),
      )

      expect(result.current.visibleItems).toHaveLength(10)
      expect(result.current.visibleStartIndex).toBe(0)
      expect(result.current.visibleEndIndex).toBe(10)
    })
  })

  describe('minimal scrollable viewport', () => {
    it('handles one extra item beyond height', () => {
      const items = createEvents(11)
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 10,
          selectedIndex: 5,
          focused: true,
          scrollLeadingContext: 3,
        }),
      )

      // With 11 items and height 10, max startIndex is 1
      // selectedIndex 5 with topBoundary 3 would want startIndex 2
      // but clamped to max of 1
      expect(result.current.visibleItems).toHaveLength(10)
      expect(result.current.visibleStartIndex).toBe(1) // clamped from 2 to 1
      expect(result.current.visibleEndIndex).toBe(11)
    })
  })

  describe('small viewport with large context', () => {
    it('handles height=3 with scrollLeadingContext=5', () => {
      const items = createEvents(50)
      // height = 3, max context = floor(2/2) = 1
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 3,
          selectedIndex: 25,
          focused: true,
          scrollLeadingContext: 5,
        }),
      )

      // Should clamp to 1
      expect(result.current.visibleStartIndex).toBe(24)
      expect(result.current.visibleEndIndex).toBe(27)
    })

    it('handles height=1', () => {
      const items = createEvents(50)
      // height = 1, max context = floor(0/2) = 0
      const { result } = renderHook(() =>
        useLogViewport({
          items,
          height: 1,
          selectedIndex: 25,
          focused: true,
          scrollLeadingContext: 10,
        }),
      )

      // Should show only the selected item
      expect(result.current.visibleItems).toHaveLength(1)
      expect(result.current.visibleStartIndex).toBe(25)
      expect(result.current.visibleEndIndex).toBe(26)
    })
  })

  describe('continuous scrolling behavior', () => {
    it('maintains stable viewport when scrolling up continuously', () => {
      const items = createEvents(50)
      const scrollLeadingContext = 3
      const height = 10

      // Start at index 30
      const { result, rerender } = renderHook(
        ({ selectedIndex }) =>
          useLogViewport({
            items,
            height,
            selectedIndex,
            focused: true,
            scrollLeadingContext,
          }),
        { initialProps: { selectedIndex: 30 } },
      )

      expect(result.current.visibleStartIndex).toBe(27)

      // Scroll up to 29
      rerender({ selectedIndex: 29 })

      const firstStart = result.current.visibleStartIndex

      // Continue scrolling up to 28
      rerender({ selectedIndex: 28 })

      // Viewport should have moved by 1
      expect(result.current.visibleStartIndex).toBe(firstStart - 1)
    })

    it('maintains stable viewport when scrolling down continuously', () => {
      const items = createEvents(50)
      const scrollLeadingContext = 3
      const height = 10

      // Start at index 20
      const { result, rerender } = renderHook(
        ({ selectedIndex }) =>
          useLogViewport({
            items,
            height,
            selectedIndex,
            focused: true,
            scrollLeadingContext,
          }),
        { initialProps: { selectedIndex: 20 } },
      )

      // Initial viewport: 17-26 (selectedIndex 20 at position 3)
      expect(result.current.visibleStartIndex).toBe(17)

      // Scroll down to 21
      rerender({ selectedIndex: 21 })

      // Position in viewport: 21-17=4, within safe range [3,6], viewport stays at 17
      expect(result.current.visibleStartIndex).toBe(17)

      // Continue scrolling down to 22
      rerender({ selectedIndex: 22 })

      // Position in viewport: 22-17=5, still within safe range [3,6], viewport stays at 17
      expect(result.current.visibleStartIndex).toBe(17)

      // Scroll down to 23
      rerender({ selectedIndex: 23 })

      // Position in viewport: 23-17=6, at bottomBoundary, viewport stays at 17
      expect(result.current.visibleStartIndex).toBe(17)

      // Scroll down to 24
      rerender({ selectedIndex: 24 })

      // Position in viewport: 24-17=7, beyond bottomBoundary (6), viewport scrolls
      // Scrolling down: position selection at bottomBoundary (6)
      // startIndex = 24 - 6 = 18
      expect(result.current.visibleStartIndex).toBe(18)
    })
  })
})
