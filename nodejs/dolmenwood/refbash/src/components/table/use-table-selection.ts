import { useEffect, useRef, useState } from 'react'

/**
 * Configuration options for table selection behavior.
 */
export interface UseTableSelectionOptions {
  /**
   * The data items in the table.
   */
  data: readonly object[]

  /**
   * Function to extract a unique identifier from a data item.
   * @param item The data item
   * @param index The index of the item in the data array
   * @returns A unique identifier for the item
   */
  getItemId: (item: object, index: number) => string | number

  /**
   * Whether selection is enabled. If false, all selection state will be null/-1.
   */
  isEnabled: boolean

  /**
   * Callback invoked when the selected row changes, either through navigation or auto-selection.
   * @param rowIndex Zero-based index of the newly selected row
   * @param data The data item at that row
   */
  onSelectRow: (rowIndex: number, data: object) => void
}

/**
 * Return value from the useTableSelection hook.
 */
export interface UseTableSelectionResult {
  /**
   * The currently selected item ID, or null if nothing is selected.
   */
  selectedId: string | number | null

  /**
   * The index of the currently selected row in the data array.
   * Returns -1 if the selected ID is not found in the current data (e.g., item was deleted).
   */
  selectedRow: number

  /**
   * The effective selected row index, accounting for deletions.
   * If the selectedRow is -1 (ID not found), this returns the closest valid index
   * based on the previous selection position. Otherwise returns selectedRow.
   */
  effectiveSelectedRow: number

  /**
   * Handler for arrow key navigation. Call this from useInput with the key object.
   * @param isUpArrow True if up arrow was pressed
   * @param isDownArrow True if down arrow was pressed
   */
  handleArrowKey: (isUpArrow: boolean, isDownArrow: boolean) => void
}

/**
 * Custom hook managing table row selection with ID-based tracking for stability across data mutations.
 *
 * ## Selection State Machine
 *
 * This hook implements a state machine with four auto-selection scenarios:
 *
 * 1. **Empty → Data**: When table transitions from empty to having data, selects first row
 * 2. **Item Deleted**: When selected item is deleted (ID not found), selects item at same index position
 * 3. **Data Changed**: When data length changes and effective row changed, updates to new row at that index
 * 4. **Null Selection**: When selection enabled but no selection exists and data present, selects first row
 *
 * ## Why ID-Based Selection?
 *
 * Index-based selection becomes stale when items are added/deleted. For example:
 * - Items: [Jon, Bob, Mike]
 * - User selects Bob (index 1, ID 'bob-123')
 * - Parent component receives IID: 'bob-123'
 * - User deletes Bob
 * - Items: [Jon, Mike]
 * - Mike is now at index 1
 * - Without ID tracking, parent still has stale 'bob-123' reference
 *
 * By tracking selection by ID and detecting when ID is not found (selectedRow === -1),
 * we can automatically update the selection to the item now at that index position.
 *
 * @param options Configuration for selection behavior
 * @returns Selection state and navigation handler
 */
export const useTableSelection = ({
  data,
  getItemId,
  isEnabled,
  onSelectRow,
}: UseTableSelectionOptions): UseTableSelectionResult => {
  const [selectedId, setSelectedId] = useState<string | number | null>(() => {
    // Initialize with first item's ID if selection is enabled and data exists
    if (isEnabled && data.length > 0) {
      return getItemId(data[0], 0)
    }
    return null
  })

  const prevEffectiveRowRef = useRef<number>(0)
  // Initialize with 0 so that the useEffect will detect initial data and call onSelectRow
  const prevDataLengthRef = useRef<number>(0)

  // Find the index of the selected item by ID
  const selectedRow =
    selectedId === null ? -1 : (
      data.findIndex((item, index) => {
        const id = getItemId(item, index)
        return id === selectedId
      })
    )

  // When selected item is deleted (selectedRow === -1), fall back to previous index position
  const effectiveSelectedRow =
    selectedRow === -1 && data.length > 0 ? Math.min(prevEffectiveRowRef.current, data.length - 1) : selectedRow

  useEffect(() => {
    if (!isEnabled) {
      return
    }

    // Scenario 1: Table was empty and now has data, select first row
    if (prevDataLengthRef.current === 0 && data.length > 0) {
      const newId = getItemId(data[0], 0)
      setSelectedId(newId)
      onSelectRow(0, data[0])
    }
    // Scenario 2: Selected item was deleted (selectedRow === -1 means ID not found)
    else if (data.length > 0 && selectedRow === -1 && selectedId !== null) {
      const newId = getItemId(data[effectiveSelectedRow], effectiveSelectedRow)
      setSelectedId(newId)
      onSelectRow(effectiveSelectedRow, data[effectiveSelectedRow])
    }
    // Scenario 3: effectiveSelectedRow changed AND data changed (deletion/addition)
    else if (
      data.length > 0 &&
      effectiveSelectedRow !== prevEffectiveRowRef.current &&
      data.length !== prevDataLengthRef.current
    ) {
      const newId = getItemId(data[effectiveSelectedRow], effectiveSelectedRow)
      setSelectedId(newId)
      onSelectRow(effectiveSelectedRow, data[effectiveSelectedRow])
    }
    // Scenario 4: Selection enabled but no selection and data exists, select first row
    else if (data.length > 0 && selectedId === null && effectiveSelectedRow === 0) {
      const newId = getItemId(data[0], 0)
      setSelectedId(newId)
      onSelectRow(0, data[0])
    }

    // Update refs for next render
    prevEffectiveRowRef.current = effectiveSelectedRow
    prevDataLengthRef.current = data.length
  }, [isEnabled, effectiveSelectedRow, data, getItemId, onSelectRow, selectedId, selectedRow])

  const handleArrowKey = (isUpArrow: boolean, isDownArrow: boolean) => {
    if (!isEnabled || data.length === 0) {
      return
    }

    const currentIndex = effectiveSelectedRow === -1 ? 0 : effectiveSelectedRow

    if (isUpArrow) {
      const newRow = currentIndex === 0 ? data.length - 1 : currentIndex - 1
      const newId = getItemId(data[newRow], newRow)
      setSelectedId(newId)
      onSelectRow(newRow, data[newRow])
    } else if (isDownArrow) {
      const newRow = currentIndex === data.length - 1 ? 0 : currentIndex + 1
      const newId = getItemId(data[newRow], newRow)
      setSelectedId(newId)
      onSelectRow(newRow, data[newRow])
    }
  }

  return {
    selectedId,
    selectedRow,
    effectiveSelectedRow,
    handleArrowKey,
  }
}
