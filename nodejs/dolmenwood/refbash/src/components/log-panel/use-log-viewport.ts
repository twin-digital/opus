import { useRef } from 'react'
import type { EventLogEntry } from '@twin-digital/dolmenwood'

interface UseLogViewportOptions {
  /**
   * All events in the log
   */
  items: readonly EventLogEntry[]

  /**
   * Number of rows to display
   */
  height: number

  /**
   * Currently selected index (in the full items array)
   */
  selectedIndex: number | null

  /**
   * Whether the panel is focused
   */
  focused: boolean

  /**
   * Number of context rows to keep visible above/below the selected row when scrolling.
   * This creates smoother scrolling by keeping the selected row at a fixed position
   * (scrollLeadingContext rows from the edge) rather than jumping immediately.
   */
  scrollLeadingContext?: number
}

interface UseLogViewportResult {
  /**
   * Slice of items to render
   */
  visibleItems: readonly EventLogEntry[]

  /**
   * Starting index in the full items array
   */
  visibleStartIndex: number

  /**
   * Ending index (exclusive) in the full items array
   */
  visibleEndIndex: number
}

/**
 * Calculates which items should be visible in a log panel viewport.
 *
 * When not focused: shows the last N items (most recent)
 * When focused with selection: keeps the selected item visible with leading context
 * When fewer items than height: shows all items from the top
 *
 * The scrollLeadingContext parameter creates smoother scrolling by maintaining
 * the current viewport until the selection reaches a boundary that requires scrolling.
 * When scrolling up, viewport scrolls when selection reaches scrollLeadingContext from top.
 * When scrolling down, viewport scrolls when selection reaches scrollLeadingContext from bottom.
 */
export function useLogViewport({
  items,
  height,
  selectedIndex,
  focused,
  scrollLeadingContext = 0,
}: UseLogViewportOptions): UseLogViewportResult {
  const prevSelectedIndexRef = useRef<number | null>(null)
  const prevStartIndexRef = useRef<number | null>(null)

  const prevSelectedIndex = prevSelectedIndexRef.current
  const prevStartIndex = prevStartIndexRef.current
  const itemCount = items.length

  // If fewer items than height, show all from the top
  if (itemCount <= height) {
    return {
      visibleItems: items.slice(0, itemCount),
      visibleStartIndex: 0,
      visibleEndIndex: itemCount,
    }
  }

  // When not focused or no selection, show the last N items
  if (!focused || selectedIndex === null) {
    const startIndex = itemCount - height
    return {
      visibleItems: items.slice(startIndex, itemCount),
      visibleStartIndex: startIndex,
      visibleEndIndex: itemCount,
    }
  }

  // Clamp scrollLeadingContext to be reasonable (can't be >= height)
  const maxLeadingContext = Math.floor((height - 1) / 2)
  const leadingContext = Math.min(scrollLeadingContext, maxLeadingContext)

  // Calculate the safe range where selection can move without scrolling
  // Selection can be anywhere from leadingContext to (height - leadingContext - 1)
  const topBoundary = leadingContext
  const bottomBoundary = height - leadingContext - 1

  // If we have a previous viewport, try to maintain it
  if (prevStartIndex !== null) {
    const currentStartIndex = prevStartIndex
    const positionInViewport = selectedIndex - currentStartIndex

    // Check if selection is still within acceptable range
    if (positionInViewport >= topBoundary && positionInViewport <= bottomBoundary) {
      // Selection is within safe range, keep current viewport
      const startIndex = Math.max(0, Math.min(currentStartIndex, itemCount - height))
      const endIndex = startIndex + height
      return {
        visibleItems: items.slice(startIndex, endIndex),
        visibleStartIndex: startIndex,
        visibleEndIndex: endIndex,
      }
    }

    // Selection is outside safe range, need to scroll
    // Determine direction to decide where to position selection
    const isScrollingDown = prevSelectedIndex !== null && selectedIndex > prevSelectedIndex
    const isScrollingUp = prevSelectedIndex !== null && selectedIndex < prevSelectedIndex

    let startIndex: number
    if (isScrollingDown) {
      // Scrolling down: put selection at bottom boundary
      startIndex = selectedIndex - bottomBoundary
    } else if (isScrollingUp) {
      // Scrolling up: put selection at top boundary
      startIndex = selectedIndex - topBoundary
    } else {
      // No clear direction, default to top boundary
      startIndex = selectedIndex - topBoundary
    }

    startIndex = Math.max(0, startIndex)
    startIndex = Math.min(startIndex, itemCount - height)
    const endIndex = startIndex + height

    // Update refs for next render
    prevSelectedIndexRef.current = selectedIndex
    prevStartIndexRef.current = startIndex

    return {
      visibleItems: items.slice(startIndex, endIndex),
      visibleStartIndex: startIndex,
      visibleEndIndex: endIndex,
    }
  }

  // First time showing viewport with selection, position at top boundary
  let startIndex = selectedIndex - topBoundary
  startIndex = Math.max(0, startIndex)
  startIndex = Math.min(startIndex, itemCount - height)
  const endIndex = startIndex + height

  // Update refs for next render
  prevSelectedIndexRef.current = selectedIndex
  prevStartIndexRef.current = startIndex

  return {
    visibleItems: items.slice(startIndex, endIndex),
    visibleStartIndex: startIndex,
    visibleEndIndex: endIndex,
  }
}
