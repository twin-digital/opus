import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventLog, EventLogEntry } from '@twin-digital/dolmenwood'
import { useInput } from 'ink'
import { observer } from 'mobx-react-lite'
import { StyledText } from '../styled-text.js'
import { Panel, type PanelProps } from '../panel.js'
import { useLogViewport } from './use-log-viewport.js'

interface Props extends Omit<PanelProps, 'children'> {
  /**
   * Event Log containing data to render in this panel.
   */
  eventLog: EventLog

  /**
   * True if the LogPanel is focused. A focused log panel receives input events, and lets the user scroll its contents.
   */
  focused?: boolean

  /**
   * Optional function to generate the text for a log entry. If not supplied, the description will be used as the entry
   * for the text. This can be used to add decoration, such as a timestamp prefix.
   *
   * @param description Description taken from the log entry
   * @param event Full event entry data
   * @returns The string to render in the log panel for this item
   */
  getText?: (description: string, event: EventLogEntry) => string

  /**
   * Height of this panel, in terminal rows. The LogPanel requires height, and it must be specified as a number (not %).
   */
  height: number

  /**
   * Number of context rows to keep visible above/below the selected row when scrolling.
   * Creates smoother scrolling by keeping the selected row at a fixed position rather than jumping.
   * Defaults to 3.
   */
  scrollLeadingContext?: number
}

export const LogPanel = observer(
  ({ eventLog, focused, getText, height, scrollLeadingContext = 3, ...panelProps }: Props) => {
    const events = eventLog.events

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const prevFocusedRef = useRef<boolean>(false)

    // Auto-select last item when focused
    useEffect(() => {
      if (focused && selectedIndex === null) {
        setSelectedIndex(() => eventLog.events.length - 1)
      }
    }, [focused, selectedIndex, eventLog.events.length])

    // Snap back to end when losing focus
    useEffect(() => {
      if (prevFocusedRef.current && !focused) {
        setSelectedIndex(null)
      }
      prevFocusedRef.current = focused ?? false
    }, [focused])

    // Calculate viewport
    const { visibleItems, visibleStartIndex } = useLogViewport({
      items: events,
      height,
      selectedIndex,
      focused: focused ?? false,
      scrollLeadingContext,
    })

    // Memoize input handler to avoid recreation on every render
    const handleInput = useCallback(
      (_: string, key: { upArrow?: boolean; downArrow?: boolean }) => {
        if (!focused) {
          return
        }

        if (key.upArrow) {
          setSelectedIndex((value) => (value !== null ? Math.max(0, value - 1) : eventLog.events.length - 1))
        }

        if (key.downArrow) {
          setSelectedIndex((value) =>
            value !== null ? Math.min(eventLog.events.length - 1, value + 1) : eventLog.events.length - 1,
          )
        }
      },
      [focused, eventLog.events.length],
    )

    useInput(handleInput)

    // Memoize rendered items to avoid re-rendering when only selection changes
    const renderedItems = useMemo(
      () =>
        visibleItems.map((event, index) => {
          const message = getText?.(event.description, event) ?? event.description
          const absoluteIndex = visibleStartIndex + index
          const isSelected = focused && selectedIndex === absoluteIndex
          return (
            <Panel key={absoluteIndex} state={isSelected ? 'selected' : undefined}>
              <StyledText textProps={{ wrap: 'truncate' }}>{message}</StyledText>
            </Panel>
          )
        }),
      [visibleItems, visibleStartIndex, getText, focused, selectedIndex],
    )

    return (
      <Panel
        {...panelProps}
        flexDirection='column'
        state={focused ? 'current' : undefined}
        title='Messages'
        type='titled'
      >
        {events.length === 0 ?
          <StyledText type='bodySecondary'>No events yet</StyledText>
        : renderedItems}
      </Panel>
    )
  },
)
